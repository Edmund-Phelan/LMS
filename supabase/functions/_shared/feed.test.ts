// LIVE-FEED.md §3 step 3, against the recorded Round 1 responses in ../_fixtures (never the live API).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  espnResults,
  parseStandings,
  mapState,
  parseScore,
  planCalls,
  standingsDelta,
  toMatchUpdate,
  type ApiMatch,
  type Row,
  type Standing,
} from './feed'

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../_fixtures', name + '.json'), 'utf8'))
const day17: ApiMatch[] = fx('matches-2026-10-17').data
const sale = day17.find((m) => m.homeTeam.name === 'Sale Sharks')!
const row = (over: Partial<Row> = {}): Row => ({
  home_team_id: 1,
  away_team_id: 2,
  status: 'scheduled',
  result_source: null,
  stage: 'pool',
  settled: false,
  ...over,
})
const zero: Standing = { played: 0, pointsFor: 0, pointsAgainst: 0 }
const standing = (name: string): Standing => {
  for (const g of fx('standings').groups)
    for (const s of g.standings)
      if (s.team.name === name)
        return { played: s.gamesPlayed, pointsFor: s.scoredPoints, pointsAgainst: s.receivedPoints }
  throw new Error(name)
}
const at = (description: string, score?: string): ApiMatch => ({ ...sale, state: { description, score } })

describe('parseScore / mapState', () => {
  it('parses the score string', () => {
    expect(parseScore('36 - 36')).toEqual([36, 36])
    expect(parseScore('27 - 45')).toEqual([27, 45])
    expect(parseScore('')).toBeNull()
    expect(parseScore(undefined)).toBeNull()
    expect(parseScore('TBC')).toBeNull()
  })
  it('maps every state', () => {
    expect(mapState('Second half')).toBe('live')
    expect(mapState('Half time')).toBe('live')
    expect(mapState('Finished')).toBe('final')
    expect(mapState('Finished after extra time')).toBe('final_et')
    expect(mapState('Awarded')).toBe('awarded')
    expect(mapState('Cancelled')).toBe('postponed')
    expect(mapState('Abandoned')).toBe('abandoned')
    expect(mapState('Not started')).toBe('none')
    expect(mapState('Unknown')).toBe('none')
  })
})

describe('standingsDelta (§4)', () => {
  it('Round 1 from a zero baseline: Sale 27–47 Glasgow, the real score the match list got wrong', () => {
    expect(sale.state.score).toBe('27 - 45') // the recorded list, still wrong 19 h later
    expect(
      standingsDelta({ home: zero, away: zero }, { home: standing('Sale Sharks'), away: standing('Glasgow Warriors') }),
    ).toEqual([27, 47])
  })
  it('a later round: totals minus the baseline', () => {
    const before = {
      home: { played: 1, pointsFor: 27, pointsAgainst: 47 },
      away: { played: 1, pointsFor: 23, pointsAgainst: 48 },
    }
    const now = {
      home: { played: 2, pointsFor: 47, pointsAgainst: 57 },
      away: { played: 2, pointsFor: 33, pointsAgainst: 68 },
    }
    expect(standingsDelta(before, now)).toEqual([20, 10])
  })
  it('not ready while the standings lag, or if the two sides disagree', () => {
    expect(standingsDelta({ home: zero, away: zero }, { home: zero, away: zero })).toBeNull() // not updated yet
    const one = (f: number, a: number) => ({ played: 1, pointsFor: f, pointsAgainst: a })
    expect(standingsDelta({ home: zero, away: zero }, { home: one(27, 45), away: one(47, 27) })).toBeNull()
    expect(standingsDelta({ home: zero, away: zero }, { home: one(27, 47), away: zero })).toBeNull()
  })
})

describe('toMatchUpdate (§4)', () => {
  const espn = { final: true, score: [27, 47] as [number, number] }
  it('live: live fields only, never the official score', () => {
    expect(toMatchUpdate(at('Second half', '27 - 40'), row(), { delta: null, espn })).toEqual({
      live_state: 'Second half',
      live_home: 27,
      live_away: 40,
    })
  })
  it('pool final: the standings delta, written when ESPN agrees, whatever the list says', () => {
    expect(toMatchUpdate(sale, row(), { delta: [27, 47], espn })).toMatchObject({
      home_score: 27,
      away_score: 47,
      status: 'completed',
      result_source: 'api',
      check_state: 'match',
      live_away: 45, // the list's number stays a live field
    })
  })
  it('pool final: waits for the standings, then for ESPN; a disagreement goes to an admin', () => {
    expect(toMatchUpdate(sale, row(), { delta: null, espn })).toMatchObject({ check_state: 'pending' })
    expect(toMatchUpdate(sale, row(), { delta: [27, 47], espn: null })).toMatchObject({ check_state: 'espn_lag' })
    expect(toMatchUpdate(sale, row(), { delta: [27, 47], espn: { final: false, score: [0, 0] } })).toMatchObject({
      check_state: 'espn_lag',
    })
    const p = toMatchUpdate(sale, row(), { delta: [27, 47], espn: { final: true, score: [27, 45] } })
    expect(p).toMatchObject({ check_state: 'mismatch', needs_admin: 'mismatch' })
    expect(p).not.toHaveProperty('home_score')
  })
  it('a pool draw is written as a draw (the engine makes it a loss)', () => {
    const glos = fx('matches-2026-10-16').data[0] as ApiMatch
    expect(toMatchUpdate(glos, row(), { delta: [36, 36], espn: { final: true, score: [36, 36] } })).toMatchObject({
      home_score: 36,
      away_score: 36,
      status: 'completed',
    })
  })
  it('knockouts: list score + ESPN; the winner goes through; level = an admin decides', () => {
    const ko = row({ stage: 'qf' })
    expect(toMatchUpdate(at('Finished', '20 - 17'), ko, { espn: { final: true, score: [20, 17] } })).toMatchObject({
      winner_team_id: 1,
      home_score: 20,
    })
    expect(
      toMatchUpdate(at('Finished after extra time', '17 - 24'), ko, { espn: { final: true, score: [17, 24] } }),
    ).toMatchObject({ winner_team_id: 2 })
    expect(
      toMatchUpdate(at('Finished after extra time', '20 - 20'), ko, { espn: { final: true, score: [20, 20] } }),
    ).toMatchObject({
      winner_team_id: null,
      needs_admin: 'knockout level',
    })
  })
  it('extra time in a pool match, awarded, postponed, abandoned, not started', () => {
    const et = toMatchUpdate(at('Finished after extra time', '20 - 23'), row(), { delta: [20, 23], espn })
    expect(et).toMatchObject({ needs_admin: 'extra time in a pool match' })
    expect(et).not.toHaveProperty('home_score')
    expect(toMatchUpdate(at('Awarded', '28 - 0'), row(), {})).toMatchObject({ home_score: 28, needs_admin: 'awarded' })
    expect(toMatchUpdate(at('Postponed'), row(), {})).toMatchObject({ status: 'postponed' })
    expect(toMatchUpdate(at('Cancelled'), row(), {})).toMatchObject({ status: 'postponed' })
    expect(toMatchUpdate(at('Abandoned', '10 - 3'), row(), {})).toMatchObject({ status: 'abandoned' })
    expect(toMatchUpdate(at('Not started'), row(), {})).toBeNull()
  })
  it('an admin result, a final match, a settled round: hands off', () => {
    const admin = toMatchUpdate(sale, row({ result_source: 'admin' }), { delta: [27, 47], espn })
    expect(admin).toEqual({ live_state: 'Finished', live_home: 27, live_away: 45 })
    expect(toMatchUpdate(at('Second half', '3 - 0'), row({ status: 'completed' }), {})).not.toHaveProperty('status')
    expect(toMatchUpdate(sale, row({ settled: true }), { delta: [27, 47], espn })).toBeNull()
  })
})

describe('planCalls (§5)', () => {
  const MIN = 60_000
  const t0 = Date.parse('2026-12-12T13:00:00Z')
  const ko = (min: number, final = false) => ({ kickoff: t0 + min * MIN, final })
  it('nothing live: no call', () => {
    expect(planCalls(t0 - 60 * MIN, [ko(0)], null, 100, 10)).toEqual({ call: false, interval: null })
  })
  it('one live match: the interval spreads the spare budget over the window left', () => {
    // 130 min left, 100 - 10 spare → every 2 min (the floor)
    expect(planCalls(t0, [ko(0)], null, 100, 10)).toEqual({ call: true, interval: 2 })
    expect(planCalls(t0 + MIN, [ko(0)], t0, 100, 10)).toEqual({ call: false, interval: 2 })
  })
  it('overlapping windows: counts to the end of the last one', () => {
    // 13:00, 15:15, 17:30 and 20:00 kick-offs; at 13:00 the live time left runs to 22:10 (550 min), 90 spare → 7 min
    expect(planCalls(t0, [ko(0), ko(135), ko(270), ko(420)], null, 100, 10).interval).toBe(7)
  })
  it('budget low: slower polling, capped at 15 min; budget at the reserve or ≤ 5: stop', () => {
    expect(planCalls(t0, [ko(0), ko(420)], null, 20, 10).interval).toBe(15)
    expect(planCalls(t0, [ko(0)], null, 10, 10).call).toBe(false)
    expect(planCalls(t0, [ko(0)], null, 5, 0).call).toBe(false)
  })
  it('a match running long: a sweep every 15 min until kick-off + 4 h, then admins', () => {
    expect(planCalls(t0 + 150 * MIN, [ko(0)], t0 + 140 * MIN, 50, 10)).toEqual({ call: false, interval: 15 })
    expect(planCalls(t0 + 155 * MIN, [ko(0)], t0 + 140 * MIN, 50, 10)).toEqual({ call: true, interval: 15 })
    expect(planCalls(t0 + 241 * MIN, [ko(0)], null, 50, 10).call).toBe(false)
  })
  it('all final: no call', () => {
    expect(planCalls(t0 + 100 * MIN, [ko(0, true), ko(30, true)], null, 100, 10).call).toBe(false)
  })
})

describe('parseStandings / espnResults (recorded responses)', () => {
  it('standings: 24 teams in 4 pools, Glasgow 47 for 27 against', () => {
    const s = parseStandings(fx('standings'))
    expect(s.size).toBe(24)
    expect(new Set([...s.values()].map((r) => r.pool))).toEqual(new Set([1, 2, 3, 4]))
    expect(s.get(346290)).toMatchObject({ pool: 1, played: 1, pointsFor: 47, pointsAgainst: 27, won: 1 })
  })
  it('ESPN: Sale 27–47 Glasgow, final', () => {
    const e = espnResults(fx('espn-scoreboard-20261017'))
    expect(e.size).toBe(8)
    expect(e.get('25908-25952')).toEqual({ final: true, score: [27, 47] })
  })
})
