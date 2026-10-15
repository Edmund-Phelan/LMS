// Admin data: load rows from Supabase and map them to the engine's types, run the engine for a preview.
import * as E from './engine/engine'
import { supabase, type Match, type Pick as PickRow, type Player, type Round, type Team } from './lib/supabase'
import { loadPayments, type PaymentRow } from './Pay'

export type ResultRow = {
  round_id: number
  player_id: string
  outcome: E.Outcome
  prediction_points: number
  exact_score: boolean
  jinx_points: number
}
export type BurnRow = { player_id: string; team_id: number; round_id: number; reason: E.BurnedTeam['reason'] }

export type Data = {
  round: Round
  prev: Round | undefined
  teams: Map<number, Team>
  players: Player[]
  me: Player | undefined
  matches: Match[]
  history: E.History
  roundPicks: E.Pick[]
  roundResults: ResultRow[]
  roundBurns: BurnRow[]
  predictions: E.Prediction[]
  jinxes: E.Jinx[]
  payments: E.Payment[]
  paymentRows: PaymentRow[]
}

export function must<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export const toRound = (r: Round): E.Round => ({
  id: r.id,
  number: r.number,
  stage: r.stage,
  lockAt: r.lock_at,
  featuredMatchId: r.featured_match_id,
  cleanSlate: r.clean_slate,
  tiebreak: r.tiebreak,
})
export const toMatch = (m: Match): E.Match => ({
  id: m.id,
  roundId: m.round_id,
  homeTeamId: m.home_team_id,
  awayTeamId: m.away_team_id,
  homeScore: m.home_score,
  awayScore: m.away_score,
  winnerTeamId: m.winner_team_id,
  status: m.status,
})
export const toPick = (p: PickRow): E.Pick => ({
  roundId: p.round_id,
  playerId: p.player_id,
  teamId: p.team_id,
  isAuto: p.is_auto,
  isResurrection: p.is_resurrection ?? false,
})
export const toResult = (r: ResultRow): E.RoundResult => ({
  roundId: r.round_id,
  playerId: r.player_id,
  outcome: r.outcome,
  predictionPoints: r.prediction_points,
  exactScore: r.exact_score,
  jinxPoints: r.jinx_points,
})

/** Raw rows as the admin page fetches them (matches, predictions and jinxes for this round only). */
export type Rows = {
  rounds: Round[]
  teams: Team[]
  players: Player[]
  matches: Match[]
  picks: PickRow[]
  results: ResultRow[]
  burns: BurnRow[]
  predictions: { player_id: string; home_score: number; away_score: number }[]
  jinxes: { jinxer_id: string; target_id: string }[]
  payments: PaymentRow[]
  me: string | undefined
}

// Every query has a fixed order: Settle compares a fresh load with the preview, so row order must be stable.
export async function load(number: number): Promise<Data | null> {
  const rounds = must(await supabase.from('rounds').select('*').order('number').returns<Round[]>())
  const round = rounds.find((r) => r.number === number)
  if (!round) return null
  const [teams, players, matches, picks, results, burns, predictions, jinxes, payments, user] = await Promise.all([
    supabase.from('teams').select('*').order('id').returns<Team[]>(),
    supabase
      .from('players')
      .select('id, name, nickname, is_admin, avatar_url, kit_colour')
      .order('name')
      .returns<Player[]>(),
    supabase.from('matches').select('*').eq('round_id', round.id).order('kickoff_at').returns<Match[]>(),
    supabase
      .from('picks')
      .select('round_id, player_id, team_id, is_auto, is_resurrection')
      .order('round_id')
      .order('player_id')
      .returns<PickRow[]>(),
    supabase.from('round_results').select('*').order('round_id').order('player_id').returns<ResultRow[]>(),
    supabase
      .from('burned_teams')
      .select('player_id, team_id, round_id, reason')
      .order('round_id')
      .order('player_id')
      .order('team_id')
      .returns<BurnRow[]>(),
    supabase
      .from('predictions')
      .select('player_id, home_score, away_score')
      .eq('round_id', round.id)
      .order('player_id'),
    supabase.from('jinxes').select('jinxer_id, target_id').eq('round_id', round.id).order('jinxer_id'),
    loadPayments(),
    supabase.auth.getUser(),
  ])
  return build(number, {
    rounds,
    teams: must(teams),
    players: must(players),
    matches: must(matches),
    picks: must(picks),
    results: must(results),
    burns: must(burns),
    predictions: must(predictions),
    jinxes: must(jinxes),
    payments: must(payments),
    me: user.data.user?.id,
  })
}

/** Rows → the engine's view of round `number`. Pure, so the admin flow test runs the same mapping. */
export function build(number: number, rows: Rows): Data | null {
  const { rounds, picks, results, burns, payments } = rows
  const round = rounds.find((r) => r.number === number)
  if (!round) return null
  const numberOf = new Map(rounds.map((r) => [r.id, r.number]))
  const before = (roundId: number) => numberOf.get(roundId)! < number
  const ps = rows.players
  return {
    round,
    prev: rounds.findLast((r) => r.number < number),
    teams: new Map(rows.teams.map((t) => [t.id, t])),
    players: ps,
    me: ps.find((p) => p.id === rows.me),
    matches: rows.matches,
    history: {
      playerIds: ps.map((p) => p.id),
      rounds: rounds.filter((r) => r.number < number).map(toRound),
      picks: picks.filter((p) => before(p.round_id)).map(toPick),
      roundResults: results.filter((r) => before(r.round_id)).map(toResult),
      burnedTeams: burns
        .filter((b) => before(b.round_id))
        .map((b) => ({ playerId: b.player_id, teamId: b.team_id, roundId: b.round_id, reason: b.reason })),
    },
    roundPicks: picks.filter((p) => p.round_id === round.id).map(toPick),
    roundResults: results.filter((r) => r.round_id === round.id),
    roundBurns: burns.filter((b) => b.round_id === round.id),
    predictions: rows.predictions.map((p) => ({
      roundId: round.id,
      playerId: p.player_id,
      homeScore: p.home_score,
      awayScore: p.away_score,
    })),
    jinxes: rows.jinxes.map((j) => ({ roundId: round.id, jinxerId: j.jinxer_id, targetId: j.target_id })),
    paymentRows: payments,
    payments: payments.map((p) => ({
      playerId: p.player_id,
      kind: p.kind,
      amountEur: Number(p.amount_eur),
      status: p.status,
      claimedAt: p.claimed_at,
    })),
  }
}

/** The settle_round() arguments for a confirmed preview. */
export const settleArgs = (roundId: number, p: Preview) => ({
  p_round_id: roundId,
  p_tiebreak: p.draw,
  p_results: p.roundResults.map((r) => ({
    player_id: r.playerId,
    outcome: r.outcome,
    prediction_points: r.predictionPoints,
    exact_score: r.exactScore,
    jinx_points: r.jinxPoints,
  })),
  p_burns: p.newBurnedTeams.map((b) => ({ player_id: b.playerId, team_id: b.teamId, reason: b.reason })),
})

/** Fisher–Yates with crypto randomness: the Q4 tiebreak draw. */
export function shuffle(ids: number[]) {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1) // ponytail: modulo bias ~1e-8 at 24 teams
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function runEngine(d: Data, draw: number[]) {
  const round = { ...toRound(d.round), tiebreak: draw }
  const s = E.settleRound(d.history, round, d.matches.map(toMatch), d.roundPicks, d.predictions, d.jinxes, d.payments)
  const table = E.pointsTable([...d.history.roundResults, ...s.roundResults])
  return { ...s, winners: E.gameWinners(s.stillIn, round, table), draw }
}
export type Preview = ReturnType<typeof runEngine>
