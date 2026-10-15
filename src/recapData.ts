import { lockLabel, supabase, type Match, type Player, type Round, type Team } from './lib/supabase'
import { loadTable, rankOf, type Standing } from './points'
import type { CardSound } from './sound'

// Round recap data (docs/UI-REDESIGN.md §19): which cards a player sees after a settle. The story is Recap.tsx.

export type Win = 'h' | 'a' | 'draw'
export type Clash = { home: Team; away: Team; mine: number; win: Win; score: string; line: string }
export type Outcome = {
  sound: CardSound
  clash?: Clash
  team?: Team
  line: string
  sub: string
  extra?: string
  final?: boolean
}
export type Card =
  | (Outcome & { type: 'through' })
  | (Outcome & { type: 'out' })
  | {
      type: 'pred'
      sound: CardSound
      kind: 'exact' | 'points' | 'zero'
      you: string
      ft: string
      big: string
      band: string
      sub: string
      home: Team
      away: Team
    }
  | {
      type: 'jinx'
      sound: CardSound
      kind: 'landed' | 'missed' | 'jinxed'
      who: Player
      names: string
      team: Team
      line: string
      sub: string
    }
export type Recap = { round: Round; cards: Card[]; final: string; to: string }

const BAND: Record<number, string> = {
  5: 'Spot on',
  3: 'Right winner · within 5',
  2: 'Right winner · within 10',
  1: 'Right winner',
  0: 'Wrong winner',
}
const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th')
const listNames = (ns: string[]) => (ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`)
const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`

type Result = { player_id: string; outcome: string; prediction_points: number; jinx_points: number }
/** Everything the recap reads, all from the settled round (spec §19: never live/provisional). */
export type RecapRows = {
  round: Round
  next?: Round
  results: Result[]
  entrants: number // in the comp (Round 1 entries)
  matches: Match[]
  teams: Team[]
  players: Player[]
  picks: { player_id: string; team_id: number }[]
  pred: { home_score: number; away_score: number } | null
  jinxes: { jinxer_id: string; target_id: string }[]
  table: Standing[]
}

/** The recap for the latest settled round, or null if it's been seen (or there's nothing to show). */
export async function loadRecap(me: string, seen: number | null | undefined): Promise<Recap | null> {
  const { data: rounds } = await supabase.from('rounds').select('*').order('number').returns<Round[]>()
  const round = rounds?.findLast((r) => r.settled_at)
  if (!round || round.number <= (seen ?? 0)) return null
  const r1 = rounds!.find((r) => r.number === 1)!
  const [results, entrants, matches, teams, players, picks, pred, jinxes, table] = await Promise.all([
    supabase
      .from('round_results')
      .select('player_id, outcome, prediction_points, jinx_points')
      .eq('round_id', round.id)
      .returns<Result[]>(),
    supabase.from('round_results').select('player_id').eq('round_id', r1.id).neq('outcome', 'already_out'),
    supabase.from('matches').select('*').eq('round_id', round.id).returns<Match[]>(),
    supabase.from('teams').select('*').returns<Team[]>(),
    supabase.from('players').select('id, name, nickname, avatar_url, kit_colour').returns<Player[]>(),
    supabase.from('picks').select('player_id, team_id').eq('round_id', round.id),
    supabase
      .from('predictions')
      .select('home_score, away_score')
      .eq('round_id', round.id)
      .eq('player_id', me)
      .maybeSingle(),
    supabase.from('jinxes').select('jinxer_id, target_id').eq('round_id', round.id),
    loadTable(),
  ])
  const recap = buildRecap(me, {
    round,
    next: rounds!.find((r) => r.number > round.number),
    results: results.data ?? [],
    entrants: entrants.data?.length ?? 0,
    matches: matches.data ?? [],
    teams: teams.data ?? [],
    players: players.data ?? [],
    picks: picks.data ?? [],
    pred: pred.data,
    jinxes: jinxes.data ?? [],
    table,
  })
  if (recap.cards.length) return recap
  await markSeen(me, round.number) // nothing to show: don't look again
  return null
}

/** Async so it runs: a Supabase query builder does nothing until it's awaited. */
export async function markSeen(me: string, n: number) {
  await supabase.from('players').update({ seen_recap_round: n }).eq('id', me)
}

/** Pure: one player's cards, in order (spec §19 "Cards"). */
export function buildRecap(me: string, d: RecapRows): Recap {
  const { round, next, table } = d
  const T = new Map(d.teams.map((t) => [t.id, t]))
  const P = new Map(d.players.map((p) => [p.id, p]))
  const name = (id: string) => P.get(id)?.nickname || P.get(id)?.name || '?'
  const pickOf = (id: string) => d.picks.find((p) => p.player_id === id)?.team_id
  const matchOf = (tid?: number) => d.matches.find((m) => m.home_team_id === tid || m.away_team_id === tid)
  const played = (m?: Match): m is Match => !!m && m.status === 'completed' && m.home_score !== null
  const line = (m: Match) =>
    `${T.get(m.home_team_id)!.name} ${played(m) ? `${m.home_score}–${m.away_score}` : 'v'} ${T.get(m.away_team_id)!.name}`
  const knockout = round.stage !== 'pool'
  const winOf = (m: Match): Win =>
    knockout && m.winner_team_id
      ? m.winner_team_id === m.home_team_id
        ? 'h'
        : 'a'
      : m.home_score! > m.away_score!
        ? 'h'
        : m.home_score! < m.away_score!
          ? 'a'
          : 'draw'

  const mine = d.results.find((r) => r.player_id === me)
  const myTeam = T.get(pickOf(me)!)
  const myMatch = matchOf(myTeam?.id)
  const featured = d.matches.find((m) => m.id === round.featured_match_id)
  const jinxedBy = d.jinxes.filter((j) => j.target_id === me).map((j) => name(j.jinxer_id))
  const noPred = played(featured) && !d.pred ? 'No prediction this round' : undefined
  const cards: Card[] = []

  // 1. Outcome
  if (mine && (mine.outcome === 'through' || mine.outcome === 'out')) {
    const clash: Clash | undefined =
      myTeam && played(myMatch)
        ? {
            home: T.get(myMatch.home_team_id)!,
            away: T.get(myMatch.away_team_id)!,
            mine: myTeam.id,
            win: winOf(myMatch),
            score: `${myMatch.home_score}–${myMatch.away_score}`,
            line: line(myMatch),
          }
        : undefined
    if (mine.outcome === 'through') {
      const alive = table.filter((s) => s.alive).length
      cards.push({
        type: 'through',
        sound: 'through',
        clash,
        team: myTeam,
        line: clash?.line ?? '',
        final: round.stage === 'final',
        sub:
          `${alive} of ${d.entrants || alive} still in.` +
          (next ? ` ${next.name} picks lock ${lockLabel(next.lock_at)}.` : ''),
        extra: noPred,
      })
    } else {
      const reason = !clash
        ? 'No unused team left to pick.'
        : clash.win === 'draw'
          ? 'A draw is a loss.'
          : myMatch!.home_score === myMatch!.away_score // knockout, level after extra time
            ? 'Out on the kicking competition.'
            : `${(clash.win === 'h' ? clash.home : clash.away).name} won it.`
      cards.push({
        type: 'out',
        sound: 'out',
        clash,
        team: myTeam,
        line: clash?.line ?? '',
        sub:
          `${reason} ` +
          // Rules 11/12: buy-back and resurrection only exist up to Round 4.
          (round.number < 4
            ? 'You’re in the stands, but there are still ways back in.'
            : 'You’re in the stands. You’re still playing for the 20%.') +
          (jinxedBy.length ? ` ${listNames(jinxedBy)} jinxed you.` : ''),
        extra: noPred,
      })
    }
  }

  // 2. Featured-match prediction
  if (mine && d.pred && played(featured)) {
    const p = mine.prediction_points
    const i = table.findIndex((s) => s.player_id === me)
    cards.push({
      type: 'pred',
      sound: p === 5 ? 'exact' : p ? 'points' : 'zero',
      kind: p === 5 ? 'exact' : p ? 'points' : 'zero',
      you: `${d.pred.home_score}–${d.pred.away_score}`,
      ft: `${featured.home_score}–${featured.away_score}`,
      big: p ? `+${p}` : '0',
      band: BAND[p] ?? '',
      sub: i < 0 ? '' : `You’re ${ordinal(rankOf(table, i))} in the race for the 20% · ${pts(table[i].points)}`,
      home: T.get(featured.home_team_id)!,
      away: T.get(featured.away_team_id)!,
    })
  }

  // 3. Jinx: mine on someone else, or theirs on me (if I went out, it's a line on the out card instead)
  const myJinx = d.jinxes.find((j) => j.jinxer_id === me)
  const target = myJinx && P.get(myJinx.target_id)
  const tTeam = target && T.get(pickOf(target.id)!)
  const tMatch = matchOf(tTeam?.id)
  if (target && tTeam && tMatch) {
    const tn = name(target.id)
    const landed = (mine?.jinx_points ?? 0) > 0
    cards.push({
      type: 'jinx',
      sound: landed ? 'jinxLanded' : 'jinxMissed',
      kind: landed ? 'landed' : 'missed',
      who: target,
      names: tn,
      team: tTeam,
      line: line(tMatch),
      sub: landed
        ? `You jinxed ${tn} and ${tTeam.name} ${winOf(tMatch) === 'draw' ? 'drew' : 'lost'}. ${tn} joins you in the stands.`
        : played(tMatch)
          ? `${tTeam.name} won. No point from the jinx this time.`
          : `${tTeam.name} didn’t play. No point from the jinx this time.`,
    })
  }
  if (mine?.outcome === 'through' && jinxedBy.length && myTeam && myMatch) {
    const first = d.jinxes.find((j) => j.target_id === me)!
    cards.push({
      type: 'jinx',
      sound: 'jinxed',
      kind: 'jinxed',
      who: P.get(first.jinxer_id)!,
      names: listNames(jinxedBy),
      team: myTeam,
      line: line(myMatch),
      sub: `${listNames(jinxedBy)} put the jinx on you this round. ${myTeam.name} had other ideas.`,
    })
  }

  return {
    round,
    cards,
    final: mine?.outcome === 'out' && round.number < 4 ? 'See ways back in' : next ? `Into ${next.name}` : 'Done',
    to: next ? `/round/${next.number}` : '/round',
  }
}
