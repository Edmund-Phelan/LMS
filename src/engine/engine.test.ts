import { describe, expect, it } from 'vitest'
import { openRound, playerState, settleRound, type History } from './engine'
import { buyback, h1, history, match, outcomes, pick, r2, round, settle } from './fixtures'

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
    expect(playerState(h, 'a', round(2)).used).toEqual(new Set([1]))
    expect(() => settle(h, round(2), r2(), { a: 1 })).toThrow(/used/)
  })
  it('rejects a team that does not play this round', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 9, b: 1, c: 1 })).toThrow(/doesn't play/)
  })
})

describe('rule 4 (1b): running out of teams, checked when the round opens (Q1, Q2)', () => {
  const r3 = () => [match(3, 1, 2, 20, 10)]
  // a has used both teams playing Round 3; b hasn't.
  const hOneStuck = () =>
    history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 3 }, res: { a: 'through', b: 'through' } },
        { n: 2, picks: { a: 2, b: 4 }, res: { a: 'through', b: 'through' } },
      ],
    )
  // Both have used both teams playing Round 3.
  const hAllStuck = () =>
    history(
      ['a', 'b'],
      [
        { n: 1, picks: { a: 1, b: 2 }, res: { a: 'through', b: 'through' } },
        { n: 2, picks: { a: 2, b: 1 }, res: { a: 'through', b: 'through' } },
      ],
    )

  it('one player stuck: out as soon as the round opens', () => {
    expect(openRound(hOneStuck(), round(3), r3())).toEqual({ cleanSlate: false, noTeamsLeft: ['a'] })
    expect(outcomes(settle(hOneStuck(), round(3), r3(), { b: 1 }))).toEqual({ a: 'out', b: 'through' })
  })
  it('Q2: a stuck player is not saved by rule 8; the others are', () => {
    expect(outcomes(settle(hOneStuck(), round(3), r3(), { b: 2 }))).toEqual({ a: 'out', b: 'through' })
  })
  it('a stuck player is out, so may jinx but cannot be jinxed', () => {
    const s = settle(hOneStuck(), round(3), r3(), { b: 2 }, { jinxes: { a: 'b' } })
    expect(s.roundResults[0].jinxPoints).toBe(1) // b's pick lost (Q3), even though rule 8 kept b in
    const withC = history(
      ['a', 'b', 'c'],
      [
        { n: 1, picks: { a: 1, b: 3, c: 5 }, res: { a: 'through', b: 'through', c: 'out' } },
        { n: 2, picks: { a: 2, b: 4 }, res: { a: 'through', b: 'through', c: 'already_out' } },
      ],
    )
    expect(() => settle(withC, round(3), r3(), { b: 1 }, { jinxes: { c: 'a' } })).toThrow(/isn't still in/)
  })
  it('Q1: everyone stuck is a clean slate: they pick from all teams again', () => {
    expect(openRound(hAllStuck(), round(3), r3())).toEqual({ cleanSlate: true, noTeamsLeft: [] })
    const s = settle(hAllStuck(), round(3, 'pool', null, { cleanSlate: true }), r3(), { a: 1, b: 2 })
    expect(outcomes(s)).toEqual({ a: 'through', b: 'out' })
  })
  it('the round’s clean slate flag must match openRound()', () => {
    expect(() => settle(hAllStuck(), round(3), r3(), {})).toThrow(/clean slate/)
    expect(() => settle(hOneStuck(), round(3, 'pool', null, { cleanSlate: true }), r3(), { a: 1, b: 1 })).toThrow(
      /clean slate/,
    )
  })
  it('Q1: the reset clears used and burned teams from then on, only for players in at its start', () => {
    const h = history(
      ['a', 'c'],
      [
        { n: 1, picks: { a: 1, c: 5 }, res: { a: 'through', c: 'through' } },
        { n: 2, picks: { a: 2, c: 6 }, res: { a: 'through', c: 'out' } },
        { n: 3, picks: { a: 4 }, res: { a: 'through', c: 'already_out' }, round: { cleanSlate: true } },
      ],
      [{ playerId: 'a', teamId: 3, roundId: 2, reason: 'buyback_penalty' }],
    )
    expect(playerState(h, 'a', round(4)).used).toEqual(new Set([4]))
    expect(playerState(h, 'c', round(4)).used).toEqual(new Set([5, 6]))
  })
})

describe('rule 5: missed pick', () => {
  it('a player still in with teams left but no pick is a data error (the lock cron assigns one)', () => {
    expect(() => settle(h1(), round(2), r2(), { a: 1, b: 1 })).toThrow(/no pick/)
  })
  it('an auto pick settles like any other', () => {
    const picks = [{ ...pick(2, 'a', 2), isAuto: true }, pick(2, 'b', 1), pick(2, 'c', 1)]
    expect(outcomes(settleRound(h1(), round(2), r2(), picks, [], [], [])).a).toBe('out')
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
    expect(playerState(h, 'a', round(3)).used.has(7)).toBe(false)
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

describe('rule 13: points table, in settle', () => {
  const p = (roundId: number, playerId: string, homeScore: number, awayScore: number) => ({
    roundId,
    playerId,
    homeScore,
    awayScore,
  })
  it('everyone in or out scores on the featured match; no prediction scores 0', () => {
    const ms = r2()
    const s = settle(
      h1(),
      round(2, 'pool', ms[0].id),
      ms,
      { a: 1, b: 1, c: 1 },
      { predictions: [p(2, 'a', 20, 10), p(2, 'b', 25, 15), p(2, 'd', 10, 20)] },
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
    const s = settle(h1(), round(2, 'pool', ms[3].id), ms, { a: 1, b: 1, c: 1 }, { predictions: [p(2, 'a', 0, 0)] })
    expect(s.roundResults[0].predictionPoints).toBe(0)
  })
  it('Q12: a level knockout featured match (kicking competition) is a draw for predictions', () => {
    const h = history(['a', 'b'], [{ n: 4, res: { a: 'through', b: 'through' } }])
    const ms = [match(5, 1, 2, 20, 20, { winnerTeamId: 1 })]
    const s = settle(
      h,
      round(5, 'r16', ms[0].id),
      ms,
      { a: 1, b: 1 },
      { predictions: [p(5, 'a', 20, 10), p(5, 'b', 18, 18)] },
    )
    expect(s.roundResults.map((r) => r.predictionPoints)).toEqual([0, 3])
  })
})

describe('rule 14: jinx', () => {
  it('lands when the target goes out', () => {
    const s = settle(h1(), round(2), r2(), { a: 2, b: 1, c: 1 }, { jinxes: { d: 'a' } })
    expect(s.roundResults.find((r) => r.playerId === 'd')!.jinxPoints).toBe(1)
  })
  it('scores nothing on a survivor, or on a target whose match is postponed', () => {
    const jinxOnA = (aPick: number) =>
      settle(h1(), round(2), r2(), { a: aPick, b: 2, c: 1 }, { jinxes: { d: 'a' } }).roundResults[3].jinxPoints
    expect(jinxOnA(1)).toBe(0)
    expect(jinxOnA(7)).toBe(0)
  })
  it('Q3: lands when the target loses even if rule 8 keeps them in', () => {
    const s = settle(h1(), round(2), r2(), { a: 2, b: 2, c: 2 }, { jinxes: { d: 'a' } })
    expect(outcomes(s).a).toBe('through')
    expect(s.roundResults[3].jinxPoints).toBe(1)
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
