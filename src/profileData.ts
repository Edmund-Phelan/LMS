// Player profile (docs/UI-REDESIGN.md §20): their road and prediction record, from rows the viewer can already read.
import type { Match, Pick, Round, Team } from './lib/supabase'

export type Result = {
  round_id: number
  outcome: string
  prediction_points: number
  exact_score: boolean
}
export type Prediction = { round_id: number; home_score: number; away_score: number }

export type Tile =
  | { kind: 'pick'; label: string; team: Team; line: string; out: boolean }
  | { kind: 'hidden' | 'stands' | 'future'; label: string }

const label = (r: Round) => (r.number <= 4 ? `R${r.number}` : r.name)

/** "Beat Exeter 38–12", "Won at Bristol 25–23", "Lost 18–24 to Gloucester", "Drew 20–20". */
export function resultLine(m: Match, teamId: number, teams: Map<number, Team>) {
  if (m.status === 'postponed' || m.status === 'abandoned') return 'Postponed · team back'
  if (m.home_score === null || m.away_score === null) return 'Locked in'
  const home = m.home_team_id === teamId
  const [us, them] = home ? [m.home_score, m.away_score] : [m.away_score, m.home_score]
  const opp = teams.get(home ? m.away_team_id : m.home_team_id)?.name
  if (us > them) return home ? `Beat ${opp} ${us}–${them}` : `Won at ${opp} ${us}–${them}`
  if (us < them) return `Lost ${us}–${them} to ${opp}`
  return `Drew ${us}–${them}`
}

/**
 * One tile per round. Privacy: a pick only shows for a round whose lock has passed, whatever rows are passed in
 * (RLS already hides the rest; this is the second wall). `inNow` = still in for the current round.
 */
export function road(
  rounds: Round[],
  picks: Pick[],
  results: Result[],
  matches: Match[],
  teams: Map<number, Team>,
  inNow: boolean,
  now: number,
): Tile[] {
  const current = rounds.find((r) => !r.settled_at)
  const exits = rounds.filter((r) =>
    results.some(
      (x) => x.round_id === r.id && (x.outcome === 'out' || (r.number === 1 && x.outcome === 'already_out')),
    ),
  )
  const exit = exits.at(-1)?.number ?? Infinity
  return rounds.map((r): Tile => {
    const locked = now >= Date.parse(r.lock_at)
    const pick = locked ? picks.find((p) => p.round_id === r.id) : undefined
    const team = pick && teams.get(pick.team_id)
    if (team) {
      const settled = results.find((x) => x.round_id === r.id)
      const m = matches.find((m) => m.round_id === r.id && (m.home_team_id === team.id || m.away_team_id === team.id))
      const out = settled?.outcome === 'out'
      return {
        kind: 'pick',
        label: label(r) + (out ? ' · OUT' : ''),
        team,
        out,
        line: settled && m ? resultLine(m, team.id, teams) : 'Locked in',
      }
    }
    if (r.id === current?.id && !locked) return { kind: inNow ? 'hidden' : 'stands', label: label(r) }
    if (r.number > exit && (locked || r.id === current?.id)) return { kind: 'stands', label: label(r) }
    return { kind: 'future', label: label(r) }
  })
}

/** One row per settled round with a prediction and a featured match. */
export function predictionRows(
  rounds: Round[],
  predictions: Prediction[],
  results: Result[],
  matches: Match[],
  teams: Map<number, Team>,
) {
  return rounds.flatMap((r) => {
    const p = predictions.find((p) => p.round_id === r.id)
    const res = results.find((x) => x.round_id === r.id)
    const m = matches.find((m) => m.id === r.featured_match_id)
    if (!r.settled_at || !p || !res || !m) return []
    return [
      {
        label: label(r),
        fixture: `${teams.get(m.home_team_id)?.name} v ${teams.get(m.away_team_id)?.name}`,
        said: `${p.home_score}–${p.away_score}`,
        finished: m.home_score === null ? 'postponed' : `${m.home_score}–${m.away_score}`,
        points: res.prediction_points,
        exact: res.exact_score,
      },
    ]
  })
}
