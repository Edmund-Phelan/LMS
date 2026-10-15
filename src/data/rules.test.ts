import { describe, expect, it } from 'vitest'
import { explainPoints, SECTIONS } from './rules'

describe('rules page points calculator', () => {
  it('matches the engine at the boundaries (off by exactly 5 and exactly 10)', () => {
    expect(explainPoints(30, 15, 27, 17)).toEqual({ n: 3, why: 'Right winner, off by 5 in total. Within 5.' })
    expect(explainPoints(30, 15, 27, 18).n).toBe(2) // off by 6
    expect(explainPoints(30, 15, 25, 20)).toEqual({ n: 2, why: 'Right winner, off by 10 in total. Within 10.' })
    expect(explainPoints(30, 15, 25, 21).n).toBe(1) // off by 11
    expect(explainPoints(20, 10, 20, 10).n).toBe(5)
    expect(explainPoints(20, 10, 10, 20).n).toBe(0)
    expect(explainPoints(15, 15, 17, 17).n).toBe(3) // a called draw is a right winner
  })

  it('has the 13 sections from the prototype', () => {
    expect(SECTIONS).toHaveLength(13)
    expect(SECTIONS.filter((s) => s.isOpenRule).map((s) => s.title)).toEqual(['The forfeit'])
  })
})
