import { describe, expect, it } from 'vitest'
import {
  NeedsRuling,
  playerState,
  reentryBurns,
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

// Round ids equal round numbers. Lock is 8pm UTC on the round number's day in Jan 2027.
const round = (number: number, stage: Stage = 'pool', featuredMatchId: number | null = null): Round => ({
  id: number,
  number,
  stage,
  lockAt: `2027-01-${String(number).padStart(2, '0')}T20:00:00Z`,
  featuredMatchId,
})
let nextMatch = 0
const match = (
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
const pick = (roundId: number, playerId: string, teamId: number, isResurrection = false): Pick => ({
  roundId,
  playerId,
  teamId,
  isAuto: false,
  isResurrection,
})
const buyback = (
  playerId: string,
  claimedAt = '2027-01-01T12:00:00Z',
  status: Payment['status'] = 'confirmed',
): Payment => ({
  playerId,
  kind: 'buyback',
  amountEur: 10,
  status,
  claimedAt,
})

type Past = { n: number; stage?: Stage; picks?: Record<string, number>; res: Record<string, Outcome> }
const history = (playerIds: string[], past: Past[], burnedTeams: BurnedTeam[] = []): History => ({
  playerIds,
  rounds: past.map((p) => round(p.n, p.stage)),
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

const settle = (
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
const outcomes = (s: Settlement) => Object.fromEntries(s.roundResults.map((r) => [r.playerId, r.outcome]))

// Round 2: 1 beats 2, 3 draws 4, 6 beats 5 away, 7 v 8 postponed.
const r2 = () => [
  match(2, 1, 2, 20, 10),
  match(2, 3, 4, 15, 15),
  match(2, 5, 6, 10, 30),
  match(2, 7, 8, null, null, { status: 'postponed' }),
]
// a, b, c all through Round 1 on teams outside Round 2's fixtures; d went out in Round 1.
const h1 = () =>
  history(
    ['a', 'b', 'c', 'd'],
    [{ n: 1, picks: { a: 11, b: 12, c: 13, d: 14 }, res: { a: 'through', b: 'through', c: 'through', d: 'out' } }],
  )

describe('rule 1: pick to win', () => {
  it('win is through, loss is out, out players stay out', () => {
    const s = settle(h1(), round(2), r2(), { a: 1, b: 2, c: 6 })
    expect(outcomes(s)).toEqual({ a: 'through', b: 'out', c: 'through', d: 'already_out' })
    expect(s.stillIn).toEqual(['a', 'c'])
  })
})

describe('rule 2: lock', () => {
  it('a buy-back claimed after the lock waits for the next round', () => {
    const s = settle(h1(), round(2), r2(), { a: 1, b: 1, c: 1 }, { payments: [buyback('d', '2027-01-02T20:00:00Z')] })
    expect(outcomes(s).d).toBe('already_out')
  })
})

describe('rule 3: each team once', () => {
  it('a Round 1 pick counts as used', () => {
    const h = history(['a'], [{ n: 1, picks: { a: 1 }, res: { a: 'through' } }])
    expect(playerState(h, 'a', 2).used).toEqual(new Set([1]))
    expect(() => settle(h, round(2), r2(), { a: 1 })).toThrow(/used/)
  })
  it('rejects a team that does not play this round', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 9, b: 1, c: 1 })).toThrow(/doesn't play/)
  })
})

describe('rule 4 (1b): running out of teams', () => {
  const r3 = () => [match(3, 1, 2, 20, 10)]
  it('one player stuck is out', () => {
    const h = history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 3 }, res: { a: 'through', b: 'through' } },
        { n: 2, picks: { a: 2, b: 4 }, res: { a: 'through', b: 'through' } },
      ],
    )
    expect(outcomes(settle(h, round(3), r3(), { b: 1 }))).toEqual({ a: 'out', b: 'through' })
  })
  it('everyone stuck is not knocked out (clean slate mechanics need a ruling)', () => {
    const h = history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 2 }, res: { a: 'through', b: 'through' } },
        { n: 2, picks: { a: 2, b: 1 }, res: { a: 'through', b: 'through' } },
      ],
    )
    expect(() => settle(h, round(3), r3(), {})).toThrow(NeedsRuling)
  })
  it('a clean slate in history resets used teams from that round on', () => {
    const h = history(
      ['a'],
      [
        { n: 1, picks: { a: 1 }, res: { a: 'through' } },
        { n: 2, picks: { a: 2 }, res: { a: 'clean_slate' } },
      ],
    )
    expect(playerState(h, 'a', 3).used).toEqual(new Set([2]))
  })
})

describe('rule 5: missed pick', () => {
  it('a player still in with teams left but no pick is a data error (the lock cron assigns one)', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 1, b: 1 })).toThrow(/no pick/)
  })
  it('an auto pick settles like any other', () => {
    const r = round(2)
    const picks = [{ ...pick(2, 'a', 2), isAuto: true }, pick(2, 'b', 1), pick(2, 'c', 1)]
    expect(outcomes(settleRound(h1(), r, r2(), picks, [], [], [])).a).toBe('out')
  })
})

describe('rule 6: what counts as a win', () => {
  it('pool: a draw is a loss for both sides', () => {
    expect(outcomes(settle(h1(), round(2), r2(), { a: 3, b: 4, c: 1 }))).toMatchObject({
      a: 'out',
      b: 'out',
      c: 'through',
    })
  })
  it('knockout: level on the scoreboard, the team that goes through wins', () => {
    const h = history(['a', 'b'], [{ n: 4, res: { a: 'through', b: 'through' } }])
    const ms = [match(5, 3, 4, 20, 20, { winnerTeamId: 4 })]
    expect(outcomes(settle(h, round(5, 'r16'), ms, { a: 4, b: 3 }))).toEqual({ a: 'through', b: 'out' })
  })
  it('refuses to settle a match with no result', () => {
    const ms = [match(2, 1, 2, null, null, { status: 'scheduled' })]
    expect(() => settle(h1(), round(2), ms, { a: 1, b: 1, c: 1 })).toThrow(/no result/)
  })
})

describe('rule 7: postponed or abandoned', () => {
  it('survives, gets the team back and can reuse it later', () => {
    const s = settle(h1(), round(2), [...r2(), match(2, 9, 10, null, null, { status: 'abandoned' })], {
      a: 7,
      b: 9,
      c: 1,
    })
    expect(outcomes(s)).toMatchObject({ a: 'survived_postponed', b: 'survived_postponed', c: 'through' })
    const h: History = {
      ...h1(),
      rounds: [round(1), round(2)],
      picks: [...h1().picks, pick(2, 'a', 7)],
      roundResults: [...h1().roundResults, ...s.roundResults],
    }
    expect(playerState(h, 'a', 3).used.has(7)).toBe(false)
    expect(outcomes(settle(h, round(3), [match(3, 7, 1, 25, 3)], { a: 7, b: 7, c: 7 })).a).toBe('through')
  })
})

describe('rule 8: everyone out at once', () => {
  it('all stay in', () => {
    const s = settle(h1(), round(2), r2(), { a: 2, b: 3, c: 5 })
    expect(outcomes(s)).toEqual({ a: 'through', b: 'through', c: 'through', d: 'already_out' })
    expect(s.stillIn).toEqual(['a', 'b', 'c'])
  })
  it('in the final too', () => {
    const h = history(['a', 'b'], [{ n: 7, stage: 'sf', res: { a: 'through', b: 'through' } }])
    const s = settle(h, round(8, 'final'), [match(8, 1, 2, 10, 20, { winnerTeamId: 2 })], { a: 1, b: 1 })
    expect(s.stillIn).toEqual(['a', 'b'])
  })
})

// Round 1: a picked 1 and went out; b and c both picked 2 (the most-picked team).
const hOut = () =>
  history(['a', 'b', 'c'], [{ n: 1, picks: { a: 1, b: 2, c: 2 }, res: { a: 'out', b: 'through', c: 'through' } }])

describe('rule 11: buy-back', () => {
  it('back in, burning the most-picked team of the round they went out in', () => {
    const s = settle(hOut(), round(2), r2(), { a: 6, b: 1, c: 1 }, { payments: [buyback('a')] })
    expect(outcomes(s).a).toBe('through')
    expect(s.newBurnedTeams).toEqual([{ playerId: 'a', teamId: 2, roundId: 2, reason: 'buyback_penalty' }])
  })
  it('cannot pick a burned team', () => {
    expect(() => settle(hOut(), round(2), r2(), { a: 2, b: 1, c: 1 }, { payments: [buyback('a')] })).toThrow(/burned/)
  })
  it('most-picked team already used: burn the next one down', () => {
    const h = history(
      ['a', 'b', 'c'],
      [{ n: 1, picks: { a: 2, b: 2, c: 1 }, res: { a: 'out', b: 'through', c: 'through' } }],
    )
    expect(reentryBurns(h, 'a', round(2), 'buyback_penalty').map((b) => b.teamId)).toEqual([1])
  })
  it('one more burn per round sat out, each that round’s most-picked', () => {
    const h = history(
      ['a', 'b', 'c'],
      [
        { n: 1, picks: { a: 1, b: 2, c: 2 }, res: { a: 'out', b: 'through', c: 'through' } },
        { n: 2, picks: { b: 3, c: 3 }, res: { a: 'already_out', b: 'through', c: 'through' } },
      ],
    )
    const s = settle(
      h,
      round(3),
      [match(3, 4, 5, 10, 0), match(3, 6, 7, 10, 0)],
      { a: 4, b: 6, c: 6 },
      { payments: [buyback('a')] },
    )
    expect(s.newBurnedTeams.map((b) => [b.teamId, b.roundId])).toEqual([
      [2, 3],
      [3, 3],
    ])
    expect(outcomes(s).a).toBe('through')
  })
  it('only confirmed payments count', () => {
    const s = settle(hOut(), round(2), r2(), { b: 1, c: 1 }, { payments: [buyback('a', undefined, 'claimed')] })
    expect(outcomes(s).a).toBe('already_out')
  })
  it('one per player', () => {
    expect(() => settle(hOut(), round(2), r2(), { b: 1, c: 1 }, { payments: [buyback('a'), buyback('a')] })).toThrow(
      /one per player/,
    )
    const used = history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 2 }, res: { a: 'out', b: 'through' } },
        { n: 2, picks: { a: 3, b: 4 }, res: { a: 'out', b: 'through' } },
      ],
      [{ playerId: 'a', teamId: 2, roundId: 2, reason: 'buyback_penalty' }],
    )
    const s = settle(used, round(3), [match(3, 5, 6, 10, 0)], { b: 5 }, { payments: [buyback('a')] })
    expect(outcomes(s).a).toBe('already_out')
  })
  it('pool stage only: an unused buy-back in the knockouts is flagged for a refund', () => {
    const h = history(['a', 'b'], [{ n: 4, picks: { a: 1, b: 2 }, res: { a: 'out', b: 'through' } }])
    expect(() =>
      settle(h, round(5, 'r16'), [match(5, 3, 4, 0, 10, { winnerTeamId: 4 })], { b: 4 }, { payments: [buyback('a')] }),
    ).toThrow(/refund/)
  })
})

// a out in Round 2 (team 4); b and c picked 5 in R2 and 6 in R3. Round 4: away 21 wins, home 22 wins, 25 postponed.
const hRes = (burnedTeams: BurnedTeam[] = []) =>
  history(
    ['a', 'b', 'c'],
    [
      { n: 1, picks: { a: 1, b: 2, c: 3 }, res: { a: 'through', b: 'through', c: 'through' } },
      { n: 2, picks: { a: 4, b: 5, c: 5 }, res: { a: 'out', b: 'through', c: 'through' } },
      { n: 3, picks: { b: 6, c: 6 }, res: { a: 'already_out', b: 'through', c: 'through' } },
    ],
    burnedTeams,
  )
const r4 = () => [
  match(4, 20, 21, 10, 25),
  match(4, 22, 23, 30, 10),
  match(4, 24, 25, null, null, { status: 'postponed' }),
  match(4, 26, 5, 0, 10),
]

describe('rule 12: resurrection', () => {
  it('away team wins: reinstated, with the same burns as a buy-back', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 } })
    expect(outcomes(s).a).toBe('reinstated')
    expect(s.stillIn).toContain('a')
    expect(s.newBurnedTeams).toEqual([
      { playerId: 'a', teamId: 5, roundId: 4, reason: 'resurrection_penalty' },
      { playerId: 'a', teamId: 6, roundId: 4, reason: 'resurrection_penalty' },
    ])
  })
  it('loses: stays out, no burns', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 23 } })
    expect(outcomes(s).a).toBe('already_out')
    expect(s.newBurnedTeams).toEqual([])
  })
  it('rejects a home team', () => {
    expect(() => settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 22 } })).toThrow(/away team/)
  })
  it('rejects a used team', () => {
    const ms = [...r4(), match(4, 27, 4, 0, 10)]
    expect(() => settle(hRes(), round(4), ms, { b: 22, c: 22 }, { resurrect: { a: 4 } })).toThrow(/used/)
  })
  it('rejects a buy-back and a resurrection in the same round', () => {
    expect(() =>
      settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 }, payments: [buyback('a')] }),
    ).toThrow(/not both/)
  })
  it('a player who already used their buy-back can still resurrect', () => {
    const h = hRes([{ playerId: 'a', teamId: 30, roundId: 1, reason: 'buyback_penalty' }])
    expect(outcomes(settle(h, round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 } })).a).toBe('reinstated')
  })
  it('Round 4 only', () => {
    expect(() => settle(hOut(), round(2), r2(), { b: 1, c: 1 }, { resurrect: { a: 6 } })).toThrow(/Round 4 only/)
  })
  it('players knocked out in Round 4 have no way back', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 23 }, { resurrect: { a: 21 } })
    expect(outcomes(s).c).toBe('out')
    const h: History = {
      ...hRes(),
      rounds: [...hRes().rounds, round(4)],
      roundResults: [...hRes().roundResults, ...s.roundResults],
    }
    const r16 = [match(5, 7, 8, 0, 0, { winnerTeamId: 7 })]
    expect(() => settle(h, round(5, 'r16'), r16, { a: 7, b: 7 }, { resurrect: { c: 8 } })).toThrow(/Round 4 only/)
    expect(() => settle(h, round(5, 'r16'), r16, { a: 7, b: 7 }, { payments: [buyback('c')] })).toThrow(/refund/)
  })
})

describe('rule 13: points table, in settle', () => {
  it('everyone in or out scores on the featured match; no prediction scores 0', () => {
    const ms = r2()
    const p = (playerId: string, homeScore: number, awayScore: number) => ({
      roundId: 2,
      playerId,
      homeScore,
      awayScore,
    })
    const s = settle(
      h1(),
      round(2, 'pool', ms[0].id),
      ms,
      { a: 1, b: 1, c: 1 },
      { predictions: [p('a', 20, 10), p('b', 25, 15), p('d', 10, 20)] },
    )
    expect(s.roundResults.map((r) => [r.playerId, r.predictionPoints, r.exactScore])).toEqual([
      ['a', 5, true],
      ['b', 2, false],
      ['c', 0, false],
      ['d', 0, false],
    ])
  })
  it('a postponed featured match scores nobody', () => {
    const ms = r2()
    const s = settle(
      h1(),
      round(2, 'pool', ms[3].id),
      ms,
      { a: 1, b: 1, c: 1 },
      { predictions: [{ roundId: 2, playerId: 'a', homeScore: 0, awayScore: 0 }] },
    )
    expect(s.roundResults[0].predictionPoints).toBe(0)
  })
})

describe('rule 14: jinx', () => {
  it('lands when the target goes out', () => {
    const s = settle(h1(), round(2), r2(), { a: 2, b: 1, c: 1 }, { jinxes: { d: 'a' } })
    expect(s.roundResults.find((r) => r.playerId === 'd')!.jinxPoints).toBe(1)
  })
  it('scores nothing on a survivor, or on a target whose match is postponed', () => {
    expect(settle(h1(), round(2), r2(), { a: 1, b: 2, c: 1 }, { jinxes: { d: 'a' } }).roundResults[3].jinxPoints).toBe(
      0,
    )
    expect(settle(h1(), round(2), r2(), { a: 7, b: 2, c: 1 }, { jinxes: { d: 'a' } }).roundResults[3].jinxPoints).toBe(
      0,
    )
  })
  it('only players who are out jinx, and only players still in can be jinxed', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 1, b: 1, c: 1 }, { jinxes: { a: 'b' } })).toThrow(/can't jinx/)
    const h = history(
      ['a', 'b', 'c'],
      [{ n: 1, picks: { a: 1, b: 2, c: 3 }, res: { a: 'through', b: 'out', c: 'out' } }],
    )
    expect(() => settle(h, round(2), r2(), { a: 6 }, { jinxes: { b: 'c' } })).toThrow(/isn't still in/)
  })
})

describe('open questions: the engine refuses to guess (QUESTIONS.md)', () => {
  it('Q2: rule 8 fires while someone went out under 1b', () => {
    const h = history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 3 }, res: { a: 'through', b: 'through' } },
        { n: 2, picks: { a: 2, b: 4 }, res: { a: 'through', b: 'through' } },
      ],
    )
    expect(() => settle(h, round(3), [match(3, 1, 2, 20, 10)], { b: 2 })).toThrow(/Q2/)
  })
  it('Q3: jinx on a player saved by rule 8', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 2, b: 2, c: 2 }, { jinxes: { d: 'a' } })).toThrow(/Q3/)
  })
  it('Q4: tie for most-picked when choosing a burn', () => {
    const h = history(
      ['a', 'b', 'c'],
      [{ n: 1, picks: { a: 1, b: 2, c: 3 }, res: { a: 'out', b: 'through', c: 'through' } }],
    )
    expect(() => settle(h, round(2), r2(), { a: 6, b: 1, c: 1 }, { payments: [buyback('a')] })).toThrow(/Q4/)
  })
  it('Q5: nothing left to burn', () => {
    const h = history(['a', 'b'], [{ n: 1, picks: { a: 1, b: 1 }, res: { a: 'out', b: 'through' } }])
    expect(() => reentryBurns(h, 'a', round(2), 'buyback_penalty')).toThrow(/Q5/)
  })
  it('Q6: resurrection match postponed', () => {
    expect(() => settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 25 } })).toThrow(/Q6/)
  })
  it('Q8: resurrection team is also due to be burned', () => {
    expect(() => settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 5 } })).toThrow(/Q8/)
  })
  it('Q9: rule 8 in Round 4 while a resurrection wins', () => {
    expect(() => settle(hRes(), round(4), r4(), { b: 23, c: 20 }, { resurrect: { a: 21 } })).toThrow(/Q9/)
  })
  it('Q12: featured knockout match ends level', () => {
    const h = history(['a'], [{ n: 4, res: { a: 'through' } }])
    const ms = [match(5, 1, 2, 20, 20, { winnerTeamId: 1 })]
    expect(() =>
      settle(
        h,
        round(5, 'r16', ms[0].id),
        ms,
        { a: 1 },
        { predictions: [{ roundId: 5, playerId: 'a', homeScore: 20, awayScore: 10 }] },
      ),
    ).toThrow(/Q12/)
  })
  it.todo('Q1: everyone still in is stuck — how is the clean-slate round played?')
  it.todo('Q2: everyone goes out and one of them was stuck (1b) — does the stuck player stay in?')
  it.todo('Q3: a jinx target loses but rule 8 keeps everyone in — does the jinx land?')
  it.todo('Q4: two teams tie for most-picked when choosing a burn — which is burned?')
  it.todo('Q5: every team picked in a round is already used/burned — burn an unpicked team, or nothing?')
  it.todo('Q6: a resurrection pick’s match is postponed — back in, stay out, or another go?')
  it.todo('Q7: resurrection cost — the spec’s buy-back burns, or the rules doc’s one per round sat out?')
  it.todo('Q8: the resurrection team is one that would be burned — invalid pick, or burn the next one down?')
  it.todo('Q9: rule 8 fires in Round 4 while a resurrection wins — do the losers still stay in?')
  it.todo('Q12: a featured knockout match is level (kicking competition) — who is the "winner" for predictions?')
})
