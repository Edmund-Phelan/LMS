import { describe, expect, it } from 'vitest'
import { burnOrder, playerState, reentryBurns, type BurnedTeam, type History } from './engine'
import { buyback, history, match, outcomes, pick, r2, round, settle } from './fixtures'

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
    const ms = [match(3, 4, 5, 10, 0), match(3, 6, 7, 10, 0)]
    const s = settle(h, round(3), ms, { a: 4, b: 6, c: 6 }, { payments: [buyback('a')] })
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
    // a went out in Round 1, bought back for Round 2 and went out again.
    const used = history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 2 }, res: { a: 'out', b: 'through' } },
        { n: 2, picks: { a: 3, b: 4 }, res: { a: 'out', b: 'through' } },
      ],
    )
    expect(playerState(used, 'a', round(3)).buybackUsed).toBe(true)
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

describe('burn order (Q4, Q5)', () => {
  it('Q4: most-picked first, ties broken by the stored draw', () => {
    const ps = [5, 3, 3, 7].map((t) => pick(1, 'x', t))
    expect(burnOrder(ps, [7, 5, 3])).toEqual([3, 7, 5])
    const h = history(
      ['a', 'b', 'c'],
      [
        {
          n: 1,
          picks: { a: 1, b: 2, c: 3 },
          res: { a: 'out', b: 'through', c: 'through' },
          round: { tiebreak: [3, 2, 1] },
        },
      ],
    )
    expect(reentryBurns(h, 'a', round(2), 'buyback_penalty').map((b) => b.teamId)).toEqual([3])
  })
  it('settle returns the round’s burn order and needs a draw covering every team', () => {
    expect(settle(hOut(), round(2), r2(), { b: 6, c: 1 }).burnOrder).toEqual([1, 6])
    expect(() => settle(hOut(), round(2, 'pool', null, { tiebreak: null }), r2(), { b: 6, c: 1 })).toThrow(/draw/)
    expect(() => settle(hOut(), round(2, 'pool', null, { tiebreak: [1, 2, 3] }), r2(), { b: 6, c: 1 })).toThrow(/draw/)
  })
  it('Q5: every team picked that round is taken: fall back to the season-wide order', () => {
    const h = history(
      ['a', 'b', 'c'],
      [
        { n: 1, picks: { a: 1, b: 2, c: 2 }, res: { a: 'through', b: 'through', c: 'through' } },
        { n: 2, picks: { a: 4, b: 4, c: 4 }, res: { a: 'out', b: 'through', c: 'through' } },
      ],
    )
    expect(reentryBurns(h, 'a', round(3), 'buyback_penalty').map((b) => b.teamId)).toEqual([2])
  })
  it('Q5: nothing left at all: no burn', () => {
    const h = history(['a', 'b'], [{ n: 1, picks: { a: 1, b: 1 }, res: { a: 'out', b: 'through' } }])
    expect(reentryBurns(h, 'a', round(2), 'buyback_penalty')).toEqual([])
  })
})

// a out in Round 2 (team 4); b and c picked 5 in R2 and 6 in R3. Round 4: away 21 wins, home 22 wins, 25 postponed.
const hRes = () =>
  history(
    ['a', 'b', 'c'],
    [
      { n: 1, picks: { a: 1, b: 2, c: 3 }, res: { a: 'through', b: 'through', c: 'through' } },
      { n: 2, picks: { a: 4, b: 5, c: 5 }, res: { a: 'out', b: 'through', c: 'through' } },
      { n: 3, picks: { b: 6, c: 6 }, res: { a: 'already_out', b: 'through', c: 'through' } },
    ],
  )
const r4 = () => [
  match(4, 20, 21, 10, 25),
  match(4, 22, 23, 30, 10),
  match(4, 24, 25, null, null, { status: 'postponed' }),
  match(4, 26, 5, 0, 10),
]

describe('rule 12: resurrection', () => {
  it('Q7: away team wins: reinstated, with buy-back burns (round they went out in + each round sat out)', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 } })
    expect(outcomes(s).a).toBe('reinstated')
    expect(s.stillIn).toContain('a')
    expect(s.newBurnedTeams).toEqual<BurnedTeam[]>([
      { playerId: 'a', teamId: 5, roundId: 4, reason: 'resurrection_penalty' },
      { playerId: 'a', teamId: 6, roundId: 4, reason: 'resurrection_penalty' },
    ])
  })
  it('loses: stays out, no burns', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 23 } })
    expect(outcomes(s).a).toBe('already_out')
    expect(s.newBurnedTeams).toEqual([])
  })
  it('Q6: match postponed: stays out, no burns', () => {
    const s = settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 25 } })
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
  it('Q8: rejects a team that would be burned if they come back', () => {
    expect(() => settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 5 } })).toThrow(
      /burned if they come back/,
    )
  })
  it('rejects a buy-back and a resurrection in the same round', () => {
    expect(() =>
      settle(hRes(), round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 }, payments: [buyback('a')] }),
    ).toThrow(/not both/)
  })
  it('a player who already used their buy-back can still resurrect', () => {
    const h = history(
      ['a', 'b', 'c'],
      [
        { n: 1, picks: { a: 1, b: 2, c: 2 }, res: { a: 'out', b: 'through', c: 'through' } },
        { n: 2, picks: { a: 3, b: 4, c: 4 }, res: { a: 'through', b: 'through', c: 'through' } },
        { n: 3, picks: { a: 7, b: 6, c: 6 }, res: { a: 'out', b: 'through', c: 'through' } },
      ],
      [{ playerId: 'a', teamId: 2, roundId: 2, reason: 'buyback_penalty' }],
    )
    expect(playerState(h, 'a', round(4)).buybackUsed).toBe(true)
    const s = settle(h, round(4), r4(), { b: 22, c: 22 }, { resurrect: { a: 21 } })
    expect(outcomes(s).a).toBe('reinstated')
    expect(s.newBurnedTeams.map((b) => b.teamId)).toEqual([6])
  })
  it('Q9: rule 8 among those in at the start; a winning resurrection comes back alongside', () => {
    const s = settle(hRes(), round(4), r4(), { b: 23, c: 20 }, { resurrect: { a: 21 } })
    expect(outcomes(s)).toEqual({ a: 'reinstated', b: 'through', c: 'through' })
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
