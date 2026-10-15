import { describe, expect, it } from 'vitest'
import {
  forfeitLosers,
  gameWinners,
  payoutSplit,
  pointsTable,
  predictionPoints,
  topOfTable,
  type Outcome,
  type RoundResult,
} from './engine'
import { round } from './fixtures'

const res = (
  roundId: number,
  playerId: string,
  outcome: Outcome,
  predictionPoints = 0,
  jinxPoints = 0,
): RoundResult => ({
  roundId,
  playerId,
  outcome,
  predictionPoints,
  exactScore: predictionPoints === 5,
  jinxPoints,
})
const score = (homeScore: number, awayScore: number) => ({ homeScore, awayScore })

describe('rule 13: prediction points', () => {
  it.each([
    ['wrong winner', score(20, 10), score(10, 20), 0],
    ['right winner, off by 11', score(30, 10), score(19, 10), 1],
    ['off by exactly 10', score(30, 10), score(25, 5), 2],
    ['off by 6', score(30, 10), score(27, 7), 2],
    ['off by exactly 5 (the rules example: 30–15, ends 27–17)', score(30, 15), score(27, 17), 3],
    ['off by 1', score(20, 10), score(21, 10), 3],
    ['exact', score(27, 17), score(27, 17), 5],
    ['called a draw, it was a draw', score(15, 15), score(20, 20), 2],
    ['called a draw, it was not', score(15, 15), score(16, 15), 0],
  ])('%s', (_, pred, actual, points) => {
    expect(predictionPoints(pred, actual)).toBe(points)
  })
})

describe('rule 10: payout split', () => {
  it('80/20 of confirmed payments, buy-backs included, claims ignored', () => {
    const pay = (kind: 'entry' | 'buyback', status: 'claimed' | 'confirmed') => ({
      playerId: 'x',
      kind,
      amountEur: 10,
      status,
      claimedAt: '',
    })
    const payments = [
      ...Array.from({ length: 11 }, () => pay('entry', 'confirmed')),
      pay('buyback', 'confirmed'),
      pay('entry', 'claimed'),
    ]
    expect(payoutSplit(payments)).toEqual({ potCents: 12000, lastManCents: 9600, pointsCents: 2400 })
    expect(payoutSplit(payments.slice(0, 11))).toEqual({ potCents: 11000, lastManCents: 8800, pointsCents: 2200 })
  })
})

describe('points table', () => {
  it('counts prediction and jinx points; top is split only when points and exact scores tie', () => {
    const t = pointsTable([
      res(2, 'a', 'through', 5),
      res(2, 'b', 'out', 3, 1),
      res(3, 'b', 'already_out', 1, 1),
      res(2, 'c', 'through', 3),
    ])
    expect(t.map((s) => [s.playerId, s.points, s.predictionPoints])).toEqual([
      ['b', 6, 4],
      ['a', 5, 5],
      ['c', 3, 3],
    ])
    expect(topOfTable(t)).toEqual(['b'])
    expect(topOfTable(t, ['a', 'c'])).toEqual(['a'])
  })
})

describe('rule 9: winner and tiebreak', () => {
  const table = pointsTable([
    res(2, 'a', 'through', 3),
    res(3, 'a', 'through', 2),
    res(2, 'b', 'through', 5),
    res(2, 'c', 'through', 5),
    res(2, 'd', 'through', 1),
  ])
  it('last one standing wins', () => {
    expect(gameWinners(['d'], round(8, 'final'), table)).toEqual(['d'])
    expect(gameWinners(['d'], round(6, 'qf'), table)).toEqual(['d'])
    expect(gameWinners(['d'], round(4), table)).toEqual(['d'])
  })
  it('carries on while several are in before the final', () => {
    expect(gameWinners(['a', 'd'], round(7, 'sf'), table)).toBeNull()
  })
  it('several survive the final: points table, then exact scores, then split', () => {
    expect(gameWinners(['a', 'd'], round(8, 'final'), table)).toEqual(['a'])
    expect(gameWinners(['a', 'b'], round(8, 'final'), table)).toEqual(['b']) // 5 each, b has an exact score
    expect(gameWinners(['b', 'c'], round(8, 'final'), table)).toEqual(['b', 'c'])
  })
  it('Q10: no winner before Round 4 settles, while buy-backs and resurrection are open', () => {
    expect(gameWinners(['a'], round(2), table)).toBeNull()
    expect(gameWinners(['a'], round(3), table)).toBeNull()
  })
})

describe('rule 15: forfeit', () => {
  const rounds = [round(2), round(3)]
  it('fewest prediction points; jinx points do not help', () => {
    const results = [
      res(2, 'a', 'out', 1, 5),
      res(3, 'a', 'already_out', 0, 1),
      res(2, 'b', 'through', 3),
      res(3, 'b', 'through', 0),
    ]
    expect(forfeitLosers(results, rounds)).toEqual(['a'])
  })
  it('tied at the bottom: whoever went out first; never out ranks best', () => {
    const results = [
      res(2, 'a', 'through', 1),
      res(3, 'a', 'out', 0),
      res(2, 'b', 'out', 1),
      res(3, 'b', 'already_out'),
      res(2, 'c', 'through', 1),
      res(3, 'c', 'through'),
    ]
    expect(forfeitLosers(results, rounds)).toEqual(['b'])
  })
  it('Q13: still tied (out in the same round), they all do it', () => {
    const results = [res(2, 'a', 'out', 1), res(2, 'b', 'out', 1)]
    expect(forfeitLosers(results, rounds)).toEqual(['a', 'b'])
  })
  it('Q11: a bought-back player is ranked by their final exit', () => {
    // a out in 2, bought back, out for good in 4; b out in 3. b went out for good first.
    const results = [
      res(2, 'a', 'out'),
      res(3, 'a', 'through'),
      res(4, 'a', 'out'),
      res(2, 'b', 'through'),
      res(3, 'b', 'out'),
      res(4, 'b', 'already_out'),
    ]
    expect(forfeitLosers(results, [...rounds, round(4)])).toEqual(['b'])
  })
})
