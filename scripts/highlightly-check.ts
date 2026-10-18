// LIVE-FEED.md §3 step 1, the gate: does Highlightly have the Champions Cup 2026/27 right? Dumps raw responses to
// supabase/functions/_fixtures/ (the test fixtures from now on) and prints the report. ≤ 20 Highlightly calls: every
// response is cached in the fixtures folder, so a re-run costs nothing for what it already has.
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/highlightly-check.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const KEY = process.env.HIGHLIGHTLY_KEY
if (!KEY) throw new Error('HIGHLIGHTLY_KEY missing from .env.local')
const DIR = 'supabase/functions/_fixtures'
mkdirSync(DIR, { recursive: true })
let calls = 0

async function get(name: string, url: string, highlightly = true): Promise<any> {
  const file = `${DIR}/${name}.json`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  if (highlightly && ++calls > 20) throw new Error('Over the 20-call budget for the check')
  const res = await fetch(url, highlightly ? { headers: { 'x-rapidapi-key': KEY! } } : {})
  if (highlightly)
    console.log(
      `  ${res.status} ${url.replace('https://rugby.highlightly.net', '')} · remaining ${res.headers.get('x-ratelimit-requests-remaining')}`,
    )
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`)
  const json = await res.json()
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  return json
}
const hl = (path: string) => `https://rugby.highlightly.net${path}`
const list = (j: any) => (Array.isArray(j) ? j : (j.data ?? []))

// League + season
// leagueName=Champions Cup finds nothing (exact name only), so one page of every league (108 on 18 Oct).
const leagues = await get('leagues-all', hl('/leagues?limit=100'))
const league = list(leagues).find((l: any) => l.name === 'European Rugby Champions Cup')
const SEASON = 2026
console.log(`Using league ${league.id} "${league.name}", season ${SEASON}`)

// Round 1
const days = ['2026-10-16', '2026-10-17', '2026-10-18']
const matches: any[] = []
for (const d of days)
  matches.push(
    ...list(
      await get(
        `matches-${d}`,
        hl(`/matches?leagueId=${league.id}&season=${SEASON}&date=${d}&timezone=Europe/Dublin&limit=100`),
      ),
    ),
  )
console.log(`\nRound 1: ${matches.length} matches`)
for (const m of matches)
  console.log(
    `  ${m.id} ${m.date} ${m.homeTeam.name} ${m.state?.score ?? ''} ${m.awayTeam.name} · ${m.state?.description}`,
  )
const glos = matches.find((m) => /gloucester/i.test(m.homeTeam.name))
console.log(
  `\nGATE: Gloucester v Bordeaux = ${glos ? `${glos.state?.score} ${glos.state?.description}` : 'NOT FOUND'} (must be 36 - 36 Finished)`,
)

const teams = new Map<number, string>()
for (const m of matches) for (const t of [m.homeTeam, m.awayTeam]) teams.set(t.id, t.name)
console.log(`\nTeams (${teams.size}):`)
for (const [id, n] of [...teams].sort((a, b) => a[1].localeCompare(b[1]))) console.log(`  ${id} ${n}`)

if (glos) {
  const detail = await get('match-gloucester-bordeaux', hl(`/matches/${glos.id}`))
  const d = list(detail)[0] ?? detail
  console.log('\n/matches/{id} keys:', Object.keys(d).join(', '))
  console.log(
    '  venue',
    JSON.stringify(d.venue),
    '· referee',
    JSON.stringify(d.referee),
    '· forecast',
    JSON.stringify(d.forecast),
  )
  console.log(
    '  lineups home',
    d.lineups?.home?.initialLineup?.length ?? 'none',
    'away',
    d.lineups?.away?.initialLineup?.length ?? 'none',
  )
  console.log(
    '  predictions prematch',
    d.predictions?.prematch?.length ?? 'none',
    'live',
    d.predictions?.live?.length ?? 'none',
  )
  console.log('  state', JSON.stringify(d.state))
  const [h, a] = [glos.homeTeam.id, glos.awayTeam.id]
  await get('last-five-gloucester', hl(`/last-five-games?teamId=${h}`))
  await get('last-five-bordeaux', hl(`/last-five-games?teamId=${a}`))
  await get('team-stats-gloucester', hl(`/teams/statistics/${h}?fromDate=2026-10-01`))
  await get('team-stats-bordeaux', hl(`/teams/statistics/${a}?fromDate=2026-10-01`))
  const h2h = await get('h2h-gloucester-bordeaux', hl(`/head-2-head?teamIdOne=${h}&teamIdTwo=${a}`))
  console.log(`  head-to-head: ${list(h2h).length} meetings`)
}

console.log('\nHighlights:')
for (const d of days) {
  const hs = list(await get(`highlights-${d}`, hl(`/highlights?leagueId=${league.id}&date=${d}&limit=40`)))
  const count = (k: string) => Object.entries(hs.reduce((o: any, x: any) => ((o[x[k]] = (o[x[k]] ?? 0) + 1), o), {}))
  console.log(
    `  ${d}: ${hs.length} · type ${JSON.stringify(count('type'))} · source ${JSON.stringify(count('source'))} · category ${JSON.stringify(count('category'))}`,
  )
  const hosts = new Set(hs.map((x: any) => x.embedUrl && new URL(x.embedUrl).host))
  console.log(`    embed hosts: ${[...hosts].join(', ')}`)
}

const standings = await get('standings', hl(`/standings?leagueId=${league.id}&season=${SEASON}`))
console.log(
  '\nStandings groups:',
  (standings.groups ?? []).map((g: any) => `${g.name} (${g.standings?.length})`).join(', '),
)

// ESPN: scoreboard for 16 Oct → the event id → summary (stats?)
const sb = await get(
  'espn-scoreboard-20261016',
  'https://site.api.espn.com/apis/site/v2/sports/rugby/271937/scoreboard?dates=20261016',
  false,
)
const ev = sb.events?.find((e: any) => /gloucester/i.test(e.name))
console.log(
  `\nESPN scoreboard 16 Oct: ${ev ? `${ev.id} ${ev.name} · ${ev.status?.type?.description} · ${ev.competitions?.[0]?.competitors?.map((c: any) => c.score).join('–')}` : 'no Gloucester event'}`,
)
if (ev) {
  const sum = await get(
    'espn-summary-gloucester-bordeaux',
    `https://site.api.espn.com/apis/site/v2/sports/rugby/271937/summary?event=${ev.id}`,
    false,
  )
  console.log('  summary keys:', Object.keys(sum).join(', '))
  for (const t of sum.boxscore?.teams ?? [])
    console.log(
      `  ${t.team?.displayName}: ${(t.statistics ?? []).map((s: any) => `${s.name}=${s.displayValue}`).join(', ') || 'no stats'}`,
    )
}
console.log(`\nHighlightly calls this run: ${calls}`)
