// LIVE-FEED.md §3 step 4: hl-sync. Called every minute on match days by hl_sync_tick() (pg_cron + pg_net), with the
// x-cron-token from Vault. Each run: plan (planCalls), make at most the planned Highlightly calls, log each in api_calls,
// and apply §4 (toMatchUpdate). feed_settings.enabled = false is shadow mode: it calls, logs the results it would
// write, and writes only the live score fields (display only).
// ponytail: scores + standings only. Details, highlights, scouting and team sheets are step 7.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  espnResults,
  parseStandings,
  planCalls,
  standingsDelta,
  toMatchUpdate,
  type ApiMatch,
  type Row,
  type Standing,
} from '../_shared/feed.ts'

const HL = 'https://rugby.highlightly.net'
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/rugby/271937/scoreboard'
const MIN = 60_000
const UA = 'Mozilla/5.0 (compatible; bbb-lms/1.0)'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const dublinDate = (t: number | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(new Date(t)) // YYYY-MM-DD

const log = (endpoint: string, http_status: number | null, remaining: number | null, note?: string) =>
  db.from('api_calls').insert({ endpoint, http_status, remaining, note })

/** One Highlightly call, logged with the rate-limit header (the budget's source of truth). */
async function hl(path: string): Promise<{ json: any; remaining: number | null }> {
  const res = await fetch(HL + path, { headers: { 'x-rapidapi-key': Deno.env.get('HIGHLIGHTLY_KEY')! } })
  const r = res.headers.get('x-ratelimit-requests-remaining')
  const remaining = r === null ? null : Number(r)
  await log(path.split('?')[0], res.status, remaining)
  if (!res.ok) throw new Error(`Highlightly ${path}: HTTP ${res.status}`)
  return { json: await res.json(), remaining }
}

type MatchRow = {
  id: number
  round_id: number
  hl_match_id: number | null
  kickoff_at: string
  status: Row['status']
  result_source: Row['result_source']
  home_team_id: number
  away_team_id: number
  home: { hl_team_id: number; espn_team_id: number }
  away: { hl_team_id: number; espn_team_id: number }
  round: { number: number; stage: Row['stage']; settled_at: string | null }
}

async function storeStandings(json: unknown) {
  const rows = parseStandings(json as Parameters<typeof parseStandings>[0])
  const { data: teams } = await db.from('teams').select('id, hl_team_id')
  const byHl = new Map((teams ?? []).map((t) => [t.hl_team_id, t.id]))
  const now = new Date().toISOString()
  const upserts = [...rows].flatMap(([hlId, r]) =>
    byHl.has(hlId)
      ? [
          {
            team_id: byHl.get(hlId),
            pool: r.pool,
            position: r.position,
            played: r.played,
            won: r.won,
            drawn: r.drawn,
            lost: r.lost,
            points_for: r.pointsFor,
            points_against: r.pointsAgainst,
            points: r.points,
            updated_at: now,
          },
        ]
      : [],
  )
  if (upserts.length) await db.from('pool_standings').upsert(upserts)
}

async function sync(now: number) {
  const { data: settings } = await db.from('feed_settings').select('*').single()
  const today = dublinDate(now)
  const { data: all, error } = await db
    .from('matches')
    .select(
      'id, round_id, hl_match_id, kickoff_at, status, result_source, home_team_id, away_team_id, ' +
        'home:teams!home_team_id(hl_team_id, espn_team_id), away:teams!away_team_id(hl_team_id, espn_team_id), ' +
        'round:rounds!round_id(number, stage, settled_at)',
    )
    .gte('kickoff_at', new Date(now - 36 * 60 * MIN).toISOString())
    .lte('kickoff_at', new Date(now + 36 * 60 * MIN).toISOString())
    .returns<MatchRow[]>()
  if (error) throw new Error(`matches: ${error.message}`)
  const rows = (all ?? []).filter((m) => dublinDate(m.kickoff_at) === today)
  if (!rows.length) return { skipped: 'no match today' }

  // Budget: the last remaining header seen today (UTC day), else the plan's daily allowance.
  const dayStart = new Date(today + 'T00:00:00Z').toISOString()
  const { data: calls } = await db
    .from('api_calls')
    .select('at, endpoint, remaining')
    .gte('at', dayStart)
    .not('http_status', 'is', null)
    .order('at', { ascending: false })
  let remaining = calls?.find((c) => c.remaining !== null)?.remaining ?? settings.daily_budget
  const last = (endpoint: string) => {
    const c = calls?.find((c) => c.endpoint === endpoint)
    return c ? Date.parse(c.at) : null
  }

  // §4 baseline: a pool round after Round 1 takes its standings before its first kick-off, once.
  for (const roundId of new Set(rows.map((m) => m.round_id))) {
    const r = rows.find((m) => m.round_id === roundId)!.round
    if (r.stage !== 'pool' || r.number === 1) continue
    const { count } = await db
      .from('standings_baseline')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', roundId)
    const { data: first } = await db
      .from('matches')
      .select('kickoff_at')
      .eq('round_id', roundId)
      .order('kickoff_at')
      .limit(1)
    if (count || !first?.length || now >= Date.parse(first[0].kickoff_at) || remaining <= 5) continue
    const s = await hl(`/standings?leagueId=${settings.league_id}&season=${settings.season}`)
    remaining = s.remaining ?? remaining - 1
    await storeStandings(s.json)
    const { data: ps } = await db.from('pool_standings').select('team_id, played, points_for, points_against')
    await db.from('standings_baseline').insert((ps ?? []).map((p) => ({ round_id: roundId, ...p })))
  }

  // Standings at most every 15 min. An admin result can land before they count the game (Northampton v Cardiff,
  // 18 Oct), so on the day keep refreshing them until every completed pool match is in them.
  let lastStandings = last('/standings')
  const refreshStandings = async () => {
    if (remaining <= 5 || (lastStandings !== null && now - lastStandings < 15 * MIN)) return
    const s = await hl(`/standings?leagueId=${settings.league_id}&season=${settings.season}`)
    remaining = s.remaining ?? remaining - 1
    lastStandings = now
    await storeStandings(s.json)
  }
  const { data: played } = await db.from('pool_standings').select('team_id, played')
  const { data: base } = await db
    .from('standings_baseline')
    .select('round_id, team_id, played')
    .in('round_id', [...new Set(rows.map((m) => m.round_id))])
  const behind = rows.some(
    (m) =>
      m.round.stage === 'pool' &&
      m.status === 'completed' &&
      [m.home_team_id, m.away_team_id].some((id) => {
        const before =
          m.round.number === 1 ? 0 : base?.find((b) => b.round_id === m.round_id && b.team_id === id)?.played
        const after = played?.find((p) => p.team_id === id)?.played ?? 0
        return before !== undefined && after <= before
      }),
  )
  if (behind) await refreshStandings()

  const open = rows.filter((m) => m.status !== 'completed')
  const reserve = 4 + open.length // a standings call per match still to finish, plus the margin
  const plan = planCalls(
    now,
    rows.map((m) => ({ kickoff: Date.parse(m.kickoff_at), final: m.status === 'completed' })),
    last('/matches'),
    remaining,
    reserve,
  )
  if (!plan.call) return { plan, remaining, behind }

  const list = await hl(
    `/matches?leagueId=${settings.league_id}&season=${settings.season}&date=${today}&timezone=Europe/Dublin&limit=100`,
  )
  remaining = list.remaining ?? remaining - 1
  const api: ApiMatch[] = list.json.data ?? []

  const rowOf = (a: ApiMatch) =>
    rows.find((r) => r.hl_match_id === a.id) ??
    rows.find((r) => r.home.hl_team_id === a.homeTeam.id && r.away.hl_team_id === a.awayTeam.id)
  // A finished match not yet written needs the standings and ESPN (free).
  const finishing = api.some((a) => /^Finished|^Awarded/.test(a.state.description) && rowOf(a)?.status !== 'completed')
  if (finishing) await refreshStandings()
  const toStanding = (x: { played: number; points_for: number; points_against: number }): Standing => ({
    played: x.played,
    pointsFor: x.points_for,
    pointsAgainst: x.points_against,
  })
  const { data: ps } = await db.from('pool_standings').select('team_id, played, points_for, points_against')
  const standings = new Map((ps ?? []).map((x) => [x.team_id, toStanding(x)]))
  let espn = new Map<string, { final: boolean; score: [number, number] }>()
  if (finishing) {
    // ESPN costs no Highlightly budget; logged with http_status null so it never counts as a Highlightly call.
    // ESPN answers 403 to Deno's default User-Agent (checked 18 Oct).
    const res = await fetch(`${ESPN}?dates=${today.replaceAll('-', '')}`, { headers: { 'User-Agent': UA } })
    espn = espnResults(res.ok ? await res.json() : {})
    await log('espn', null, null, `HTTP ${res.status}: ${JSON.stringify([...espn])}`)
  }

  const written: unknown[] = []
  for (const a of api) {
    const m = rowOf(a)
    if (!m) {
      await log('match', null, null, `no row for Highlightly match ${a.id} ${a.homeTeam.name} v ${a.awayTeam.name}`)
      continue
    }
    if (m.hl_match_id === null) await db.from('matches').update({ hl_match_id: a.id }).eq('id', m.id)

    // §4: Round 1's baseline is zero; a later round's is its stored one (missing → no delta, so admins).
    let delta: [number, number] | null = null
    const h = standings.get(m.home_team_id)
    const w = standings.get(m.away_team_id)
    if (m.round.stage === 'pool' && h && w) {
      const zero: Standing = { played: 0, pointsFor: 0, pointsAgainst: 0 }
      const { data: b } = await db
        .from('standings_baseline')
        .select('team_id, played, points_for, points_against')
        .eq('round_id', m.round_id)
        .in('team_id', [m.home_team_id, m.away_team_id])
      const of = (id: number) => b?.find((x) => x.team_id === id)
      const bh = m.round.number === 1 ? zero : of(m.home_team_id) && toStanding(of(m.home_team_id)!)
      const bw = m.round.number === 1 ? zero : of(m.away_team_id) && toStanding(of(m.away_team_id)!)
      if (bh && bw) delta = standingsDelta({ home: bh, away: bw }, { home: h, away: w })
    }
    const patch = toMatchUpdate(
      a,
      {
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        status: m.status,
        result_source: m.result_source,
        stage: m.round.stage,
        settled: m.round.settled_at !== null,
      },
      { delta, espn: espn.get(`${m.home.espn_team_id}-${m.away.espn_team_id}`) ?? null },
    )
    if (!patch) continue
    // Shadow mode (enabled = false) still writes the live fields: display only, never a result.
    const { live_state, live_home, live_away } = patch
    const { error } = await db
      .from('matches')
      .update({
        ...(settings.enabled ? patch : { live_state, live_home, live_away }),
        live_updated_at: new Date(now).toISOString(),
      })
      .eq('id', m.id)
    if (error) await log('write', null, null, `match ${m.id}: ${error.message}`)
    written.push({ match: m.id, ...patch })
  }
  if (!settings.enabled) await log('shadow', null, remaining, JSON.stringify(written))
  return { plan, remaining, enabled: settings.enabled, written }
}

Deno.serve(async (req) => {
  const { data: token } = await db.rpc('hl_cron_token')
  if (!token || req.headers.get('x-cron-token') !== token) return new Response('Unauthorized', { status: 401 })
  try {
    return Response.json(await sync(Date.now()))
  } catch (e) {
    await log('error', null, null, String(e))
    return Response.json({ error: String(e) }, { status: 500 })
  }
})
