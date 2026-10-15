// Monday standings update (packet 5c, manual): ESPN's public standings JSON → src/data/standings.json.
// Run: node --experimental-strip-types --no-warnings scripts/standings.ts
// ponytail: ESPN's feed is unofficial and keyless; if it breaks, edit standings.json by hand from epcrugby.com.
import { writeFileSync } from 'node:fs'

const URL = 'https://site.web.api.espn.com/apis/v2/sports/rugby/271937/standings'
// ESPN team id → our slug. Checked 15 Oct 2026 against spec §15's pools.
const SLUG: Record<string, string> = {
  25917: 'asm-clermont-auvergne', 25952: 'glasgow-warriors', 25903: 'leicester-tigers', 25924: 'leinster',
  25908: 'sale-sharks', 270567: 'section-paloise', 25923: 'connacht', 116227: 'exeter-chiefs', 25958: 'emirates-lions',
  25909: 'saracens', 119318: 'stade-rochelais', 25922: 'stade-toulousain', 25899: 'bristol-bears',
  25900: 'gloucester-rugby', 25925: 'munster-rugby', 99855: 'racing-92', 25962: 'dhl-stormers',
  143737: 'union-bordeaux-begles', 25898: 'bath-rugby', 25953: 'vodacom-bulls', 25965: 'cardiff-rugby',
  25918: 'montpellier-herault-rugby', 25907: 'northampton-saints', 25921: 'stade-francais-paris',
}
const STATS = { p: 'gamesPlayed', w: 'gamesWon', d: 'gamesDrawn', l: 'gamesLost', pf: 'pointsFor', pa: 'pointsAgainst',
  tbp: 'bonusPointsTry', lbp: 'bonusPointsLosing', pts: 'points' } as const

const res = await fetch(URL)
if (!res.ok) throw new Error(`ESPN: HTTP ${res.status}`)
const json = await res.json()
const pools = json.children.map((g: any) =>
  g.standings.entries
    .map((e: any) => {
      const stat = (n: string) => Number(e.stats.find((s: any) => s.name === n)?.value ?? NaN)
      const slug = SLUG[e.team.id] ?? `UNKNOWN ${e.team.id} ${e.team.displayName}`
      return { rank: stat('rank'), slug, ...Object.fromEntries(Object.entries(STATS).map(([k, n]) => [k, stat(n)])) }
    })
    .sort((a: any, b: any) => a.rank - b.rank) // ESPN's own ranking; never recalculated here
    .map(({ rank: _, ...row }: any) => row),
)
// One team per line, so the Monday diff reads like the table.
const rows = (pool: object[]) => '[\n' + pool.map((r) => '      ' + JSON.stringify(r)).join(',\n') + '\n    ]'
const file = `{
  "updated": "${new Date().toISOString()}",
  "source": "ESPN",
  "pools": [
    ${pools.map(rows).join(',\n    ')}
  ]
}
`
JSON.parse(file)
writeFileSync('src/data/standings.json', file)
for (const [i, pool] of pools.entries())
  console.log(`Pool ${i + 1}: ` + pool.map((r: any) => `${r.slug} ${r.pts}`).join(', '))
console.log('wrote src/data/standings.json; now run npm test')
