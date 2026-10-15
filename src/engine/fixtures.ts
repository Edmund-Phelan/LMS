// Test fixtures for the engine tests (not used by the app).
import {
  settleRound,
  type BurnedTeam,
  type History,
  type Match,
  type Outcome,
  type Payment,
  type Pick,
  type Prediction,
  type Round,
  type Settlement,
  type Stage,
} from './engine'

/** Default tiebreak draw: team ids in order, so ties go to the lower id. */
export const DRAW = Array.from({ length: 40 }, (_, i) => i + 1)

// Round ids equal round numbers. Lock is 8pm UTC on the round number's day in Jan 2027.
export const round = (
  number: number,
  stage: Stage = 'pool',
  featuredMatchId: number | null = null,
  more: Partial<Round> = {},
): Round => ({
  id: number,
  number,
  stage,
  lockAt: `2027-01-${String(number).padStart(2, '0')}T20:00:00Z`,
  featuredMatchId,
  cleanSlate: false,
  tiebreak: DRAW,
  ...more,
})
let nextMatch = 0
export const match = (
  roundId: number,
  home: number,
  away: number,
  hs: number | null,
  as: number | null,
  more: Partial<Match> = {},
): Match => ({
  id: ++nextMatch,
  roundId,
  homeTeamId: home,
  awayTeamId: away,
  homeScore: hs,
  awayScore: as,
  winnerTeamId: null,
  status: 'completed',
  ...more,
})
export const pick = (roundId: number, playerId: string, teamId: number, isResurrection = false): Pick => ({
  roundId,
  playerId,
  teamId,
  isAuto: false,
  isResurrection,
})
export const buyback = (
  playerId: string,
  claimedAt = '2027-01-01T12:00:00Z',
  status: Payment['status'] = 'confirmed',
): Payment => ({ playerId, kind: 'buyback', amountEur: 10, status, claimedAt })

type Past = {
  n: number
  stage?: Stage
  picks?: Record<string, number>
  res: Record<string, Outcome>
  round?: Partial<Round>
}
export const history = (playerIds: string[], past: Past[], burnedTeams: BurnedTeam[] = []): History => ({
  playerIds,
  rounds: past.map((p) => round(p.n, p.stage, null, p.round)),
  picks: past.flatMap((p) => Object.entries(p.picks ?? {}).map(([id, team]) => pick(p.n, id, team))),
  roundResults: past.flatMap((p) =>
    Object.entries(p.res).map(([playerId, outcome]) => ({
      roundId: p.n,
      playerId,
      outcome,
      predictionPoints: 0,
      exactScore: false,
      jinxPoints: 0,
    })),
  ),
  burnedTeams,
})

export const settle = (
  h: History,
  r: Round,
  ms: Match[],
  picks: Record<string, number>,
  x: {
    resurrect?: Record<string, number>
    predictions?: Prediction[]
    jinxes?: Record<string, string>
    payments?: Payment[]
  } = {},
) =>
  settleRound(
    h,
    r,
    ms,
    [
      ...Object.entries(picks).map(([id, t]) => pick(r.id, id, t)),
      ...Object.entries(x.resurrect ?? {}).map(([id, t]) => pick(r.id, id, t, true)),
    ],
    x.predictions ?? [],
    Object.entries(x.jinxes ?? {}).map(([jinxerId, targetId]) => ({ roundId: r.id, jinxerId, targetId })),
    x.payments ?? [],
  )
export const outcomes = (s: Settlement) => Object.fromEntries(s.roundResults.map((r) => [r.playerId, r.outcome]))

// Round 2: 1 beats 2, 3 draws 4, 6 beats 5 away, 7 v 8 postponed.
export const r2 = () => [
  match(2, 1, 2, 20, 10),
  match(2, 3, 4, 15, 15),
  match(2, 5, 6, 10, 30),
  match(2, 7, 8, null, null, { status: 'postponed' }),
]
// a, b, c all through Round 1 on teams outside Round 2's fixtures; d went out in Round 1.
export const h1 = () =>
  history(
    ['a', 'b', 'c', 'd'],
    [{ n: 1, picks: { a: 11, b: 12, c: 13, d: 14 }, res: { a: 'through', b: 'through', c: 'through', d: 'out' } }],
  )
