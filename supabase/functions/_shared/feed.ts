// LIVE-FEED.md §3 step 3: the feed's pure logic. No I/O: hl-sync (step 4) fetches, calls these, writes the result.
// §4 is the money part: the match list's score is live only; a pool result is the standings delta, written only when
// ESPN agrees (Eddie, 18 Oct, after the list had Sale 27-45 Glasgow for a 27-47 game).

export type ApiTeam = { id: number; name: string }
export type ApiMatch = {
  id: number
  date: string
  homeTeam: ApiTeam
  awayTeam: ApiTeam
  state: { description: string; score?: string | null }
}
export type Kind = 'none' | 'live' | 'final' | 'final_et' | 'awarded' | 'postponed' | 'abandoned'

/** "36 - 36" → [36, 36] (home, away); missing or junk → null. */
export function parseScore(s?: string | null): [number, number] | null {
  const m = s?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

const KINDS: Record<string, Kind> = {
  'First half': 'live',
  'Half time': 'live',
  'Second half': 'live',
  'Extra time': 'live',
  'Break time': 'live',
  Penalties: 'live',
  Suspended: 'live',
  Interrupted: 'live',
  Finished: 'final',
  'Finished after extra time': 'final_et',
  Awarded: 'awarded',
  Postponed: 'postponed',
  Cancelled: 'postponed',
  Abandoned: 'abandoned',
}
/** Highlightly's state.description → what the feed does with it. Not started / Unknown / To be announced → none. */
export const mapState = (description: string): Kind => KINDS[description] ?? 'none'

export type Standing = { played: number; pointsFor: number; pointsAgainst: number }

/**
 * §4: a pool match's score from the standings, as [home, away]: each team's totals now minus its round baseline.
 * null until both teams have exactly one more game and the two sides agree (home scored = away conceded, and back).
 */
export function standingsDelta(
  before: { home: Standing; away: Standing },
  now: { home: Standing; away: Standing },
): [number, number] | null {
  const d = (k: 'home' | 'away') => ({
    played: now[k].played - before[k].played,
    for: now[k].pointsFor - before[k].pointsFor,
    against: now[k].pointsAgainst - before[k].pointsAgainst,
  })
  const h = d('home')
  const a = d('away')
  if (h.played !== 1 || a.played !== 1) return null
  if (h.for !== a.against || h.against !== a.for || h.for < 0 || h.against < 0) return null
  return [h.for, h.against]
}

export type Row = {
  home_team_id: number
  away_team_id: number
  status: 'scheduled' | 'completed' | 'postponed' | 'abandoned'
  result_source: 'api' | 'admin' | null
  stage: 'pool' | 'r16' | 'qf' | 'sf' | 'final'
  settled: boolean // the round is settled (or being settled): hands off
}
export type Espn = { final: boolean; score: [number, number] } | null
export type Patch = {
  live_state?: string
  live_home?: number | null
  live_away?: number | null
  home_score?: number
  away_score?: number
  status?: Row['status']
  winner_team_id?: number | null
  result_source?: 'api'
  check_state?: 'pending' | 'match' | 'espn_lag' | 'mismatch'
  needs_admin?: string | null
}

const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]

/**
 * §4 write rules for one match. `delta` = standingsDelta() for pool matches (null if not ready), `espn` = ESPN's
 * scoreboard for it. Returns null when there's nothing to write. The database guard (matches_result_guard) is the
 * second line: it refuses admin results and settled rounds whatever this returns.
 */
export function toMatchUpdate(
  api: ApiMatch,
  row: Row,
  src: { delta?: [number, number] | null; espn?: Espn },
): Patch | null {
  const kind = mapState(api.state.description)
  if (row.settled || kind === 'none') return null
  const listScore = parseScore(api.state.score)
  const live: Patch = {
    live_state: api.state.description,
    live_home: listScore?.[0] ?? null,
    live_away: listScore?.[1] ?? null,
  }
  // Admin results, and anything already final, only get live fields (never move a match backwards).
  if (row.result_source === 'admin' || row.status === 'completed' || kind === 'live') return live

  if (kind === 'postponed' || kind === 'abandoned') return { ...live, status: kind }
  const pool = row.stage === 'pool'
  if (kind === 'final_et' && pool) return { ...live, needs_admin: 'extra time in a pool match' }
  if (kind === 'awarded')
    return listScore
      ? {
          ...live,
          home_score: listScore[0],
          away_score: listScore[1],
          status: 'completed',
          result_source: 'api',
          needs_admin: 'awarded',
        }
      : { ...live, needs_admin: 'awarded' }

  // Finished (or a knockout after extra time): pool → the standings delta; knockout → the list score.
  const score = pool ? src.delta : listScore
  if (!score) return { ...live, check_state: 'pending' }
  if (!src.espn?.final) return { ...live, check_state: 'espn_lag' }
  if (!same(score, src.espn.score)) return { ...live, check_state: 'mismatch', needs_admin: 'mismatch' }
  const result: Patch = {
    ...live,
    home_score: score[0],
    away_score: score[1],
    status: 'completed',
    result_source: 'api',
    check_state: 'match',
  }
  if (pool) return result
  // Knockouts: the team that goes through; level after extra time means a kicking competition the score can't show.
  if (score[0] === score[1]) return { ...result, winner_team_id: null, needs_admin: 'knockout level' }
  return { ...result, winner_team_id: score[0] > score[1] ? row.home_team_id : row.away_team_id }
}

export type Fixture = { kickoff: number; final: boolean } // ms since epoch

const MIN = 60_000
const WINDOW = 130 * MIN // kick-off to +130 min counts as live
const OVERRUN = 4 * 60 * MIN // not final by then: leave it to admins

/**
 * §5: should hl-sync call today's /matches list now? `remaining` = the last x-ratelimit-requests-remaining,
 * `reserve` = today's still-due detail/highlights/standings/team-sheet calls + 4. Returns the poll interval in
 * minutes and whether a call is due. ponytail: the weekday scouting jobs are scheduled separately (step 7).
 */
export function planCalls(
  now: number,
  today: Fixture[],
  lastListAt: number | null,
  remaining: number,
  reserve: number,
): { call: boolean; interval: number | null } {
  const open = today.filter((m) => !m.final && m.kickoff <= now && now <= m.kickoff + OVERRUN)
  if (!open.length || remaining <= 5 || remaining <= reserve) return { call: false, interval: null }
  const inWindow = open.filter((m) => now <= m.kickoff + WINDOW)
  let interval: number
  if (inWindow.length) {
    // Minutes of live window left today (to the end of the last one, counting matches not yet kicked off too).
    const end = Math.max(...today.filter((m) => !m.final).map((m) => m.kickoff + WINDOW))
    const left = (end - now) / MIN
    interval = Math.min(15, Math.max(2, Math.ceil(left / (remaining - reserve))))
  } else interval = 15 // running long: a sweep every 15 min until kick-off + 4 h
  // The cron fires on the minute and a call lands a few seconds later, so allow 30 s or every interval runs a minute long.
  return { call: lastListAt === null || now - lastListAt >= interval * MIN - 30_000, interval }
}

export type PoolRow = Standing & {
  pool: number
  position: number
  won: number
  drawn: number
  lost: number
  points: number
}

/** /standings → Highlightly team id → row. The pool number is the "…, Group N" in the group name. */
export function parseStandings(json: { groups?: { name: string; standings: any[] }[] }): Map<number, PoolRow> {
  const out = new Map<number, PoolRow>()
  for (const g of json.groups ?? []) {
    const pool = Number(g.name.match(/Group (\d+)/)?.[1])
    if (!pool) continue
    for (const s of g.standings)
      out.set(s.team.id, {
        pool,
        position: s.position,
        played: s.gamesPlayed,
        won: s.wins,
        drawn: s.draws,
        lost: s.loses,
        pointsFor: s.scoredPoints,
        pointsAgainst: s.receivedPoints,
        points: s.points,
      })
  }
  return out
}

/** ESPN's scoreboard → "homeEspnId-awayEspnId" → its result. Unofficial and keyless: a check, never a source. */
export function espnResults(json: { events?: any[] }): Map<string, NonNullable<Espn>> {
  const out = new Map<string, NonNullable<Espn>>()
  for (const ev of json.events ?? []) {
    const cs = ev.competitions?.[0]?.competitors ?? []
    const h = cs.find((c: any) => c.homeAway === 'home')
    const a = cs.find((c: any) => c.homeAway === 'away')
    if (!h || !a) continue
    out.set(`${h.team.id}-${a.team.id}`, {
      final: ev.status?.type?.completed === true,
      score: [Number(h.score), Number(a.score)],
    })
  }
  return out
}
