import { describe, expect, it } from 'vitest'
import standings from './standings.json'
import teams from './teams.json'

// Spec §15's real 2026/27 pools: a bad Monday update (wrong team, wrong pool, missing row) fails here.
const POOLS = [
  ['leinster', 'glasgow-warriors', 'section-paloise', 'sale-sharks', 'leicester-tigers', 'asm-clermont-auvergne'],
  ['stade-toulousain', 'emirates-lions', 'saracens', 'stade-rochelais', 'exeter-chiefs', 'connacht'],
  ['union-bordeaux-begles', 'dhl-stormers', 'racing-92', 'munster-rugby', 'bristol-bears', 'gloucester-rugby'],
  ['northampton-saints', 'bath-rugby', 'cardiff-rugby', 'montpellier-herault-rugby', 'stade-francais-paris', 'vodacom-bulls'],
]

describe('standings.json', () => {
  it('has every team in its spec §15 pool', () => {
    expect(standings.pools.map((p) => p.map((r) => r.slug).sort())).toEqual(POOLS.map((p) => [...p].sort()))
    const slugs = new Set(teams.map((t) => t.slug))
    for (const p of POOLS) for (const s of p) expect(slugs.has(s), s).toBe(true)
  })

  it('has sane numbers', () => {
    expect(Number.isNaN(Date.parse(standings.updated))).toBe(false)
    for (const r of standings.pools.flat()) {
      for (const v of Object.values(r)) if (typeof v === 'number') expect(Number.isInteger(v) && v >= 0, r.slug).toBe(true)
      expect(r.w + r.d + r.l, r.slug).toBe(r.p)
      expect(r.pts, r.slug).toBe(4 * r.w + 2 * r.d + r.tbp + r.lbp) // catches a column mix-up, not a ranking
    }
  })
})
