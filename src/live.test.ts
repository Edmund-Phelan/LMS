import { describe, expect, it } from 'vitest'
import type { Match } from './lib/supabase'
import { koReason, liveScore, LIVE_MS, matchState, pickState, STALE_MS } from './live'

const KO = Date.parse('2026-12-12T15:00:00Z') // Sat 15:00 Irish (winter, UTC+0)
const m = (p: Partial<Match> = {}): Match => ({
  id: 1,
  round_id: 1,
  home_team_id: 10,
  away_team_id: 20,
  kickoff_at: new Date(KO).toISOString(),
  home_score: null,
  away_score: null,
  winner_team_id: null,
  status: 'scheduled',
  ...p,
})
const ft = (h: number, a: number, p: Partial<Match> = {}) =>
  m({ status: 'completed', home_score: h, away_score: a, ...p })

describe('matchState', () => {
  it('is upcoming, live for 100 min, then waiting for an admin', () => {
    expect(matchState(m(), KO - 1)).toBe('upcoming')
    expect(matchState(m(), KO)).toBe('live')
    expect(matchState(m(), KO + LIVE_MS - 1)).toBe('live')
    expect(matchState(m(), KO + LIVE_MS)).toBe('waiting')
  })
  it('is final only with both scores, whatever the clock', () => {
    expect(matchState(ft(20, 13), KO + 60_000)).toBe('final')
    expect(matchState(m({ status: 'completed' }), KO + LIVE_MS)).toBe('waiting')
    expect(matchState(m({ status: 'postponed' }), KO - 1)).toBe('off')
    expect(matchState(m({ status: 'abandoned' }), KO + 1)).toBe('off')
  })
})

describe('pickState', () => {
  const later = KO + 3 * 3600_000
  it('pool: win through, loss or draw out', () => {
    expect(pickState(ft(20, 13), 10, false, later)).toBe('through')
    expect(pickState(ft(20, 13), 20, false, later)).toBe('out')
    expect(pickState(ft(13, 13), 10, false, later)).toBe('out')
    expect(pickState(ft(13, 13), 20, false, later)).toBe('out')
  })
  it('knockout: level score goes to winner_team_id', () => {
    expect(pickState(ft(20, 20, { winner_team_id: 20 }), 20, true, later)).toBe('through')
    expect(pickState(ft(20, 20, { winner_team_id: 20 }), 10, true, later)).toBe('out')
  })
  it('postponed gives the team back', () => {
    expect(pickState(m({ status: 'postponed' }), 10, false, later)).toBe('back')
  })
  it('not started: "locked", on match day or before it', () => {
    expect(pickState(m(), 10, false, Date.parse('2026-12-12T00:30:00Z'))).toBe('locked')
    expect(pickState(m(), 10, false, Date.parse('2026-12-11T23:30:00Z'))).toBe('locked')
    expect(pickState(m(), 10, false, KO + 5 * 60_000)).toBe('live')
  })
})

describe('koReason', () => {
  it('names a draw, a margin and a kicking competition', () => {
    expect(koReason(ft(20, 20), 10, false)).toBe('a draw is a loss')
    expect(koReason(ft(13, 20), 10, false)).toBe('lost by 7')
    expect(koReason(ft(20, 13), 20, false)).toBe('lost by 7')
    expect(koReason(ft(20, 20, { winner_team_id: 20 }), 10, true)).toBe('out on the kicking competition')
  })
})

describe('live feed (LIVE-FEED.md step 6)', () => {
  const at = KO + 50 * 60_000
  const feed = (state: string, h: number, a: number, updated = at, p: Partial<Match> = {}) =>
    m({ live_state: state, live_home: h, live_away: a, live_updated_at: new Date(updated).toISOString(), ...p })
  it('a fresh in-play score is live, with the state as the label', () => {
    expect(liveScore(feed('Second half', 20, 17), at + 60_000)).toMatchObject({
      label: "2ND · ~41'",
      home: 20,
      away: 17,
    })
    expect(liveScore(feed('Half time', 13, 10), at)).toMatchObject({ label: 'HT' })
    // Past the clock's 100 min, the feed still says it's on: live, not "Result due".
    expect(matchState(feed('Second half', 20, 17, KO + LIVE_MS + 60_000), KO + LIVE_MS + 120_000)).toBe('live')
  })
  it('the minute is an estimate from kick-off, held at 40 and 80 while the feed catches up', () => {
    const min = (n: number) => KO + n * 60_000
    const label = (state: string, n: number) => liveScore(feed(state, 0, 0, min(n)), min(n))?.label
    expect(label('First half', 0)).toBe("1ST · ~1'")
    expect(label('First half', 22)).toBe("1ST · ~23'")
    expect(label('First half', 52)).toBe("1ST · ~40'")
    expect(label('Second half', 55)).toBe("2ND · ~41'")
    expect(label('Second half', 75)).toBe("2ND · ~56'")
    expect(label('Second half', 130)).toBe("2ND · ~80'")
    expect(label('Extra time', 130)).toBe('EXTRA TIME')
  })
  it('a stale feed falls back to the clock', () => {
    expect(liveScore(feed('Second half', 20, 17), at + STALE_MS + 1)).toBeNull()
    expect(matchState(feed('Second half', 20, 17, KO), KO + LIVE_MS + STALE_MS)).toBe('waiting')
  })
  it('the feed’s full time is "being checked", never a result: no Through/Out until the official score', () => {
    const fin = feed('Finished', 27, 45)
    expect(liveScore(fin, at + 3_600_000)).toMatchObject({ final: true, home: 27, away: 45 })
    expect(matchState(fin, at)).toBe('waiting')
    expect(pickState(fin, 20, false, at)).toBe('waiting')
  })
  it('an official result wins over the feed', () => {
    const done = feed('Finished', 27, 45, at, { status: 'completed', home_score: 27, away_score: 47 })
    expect(liveScore(done, at)).toBeNull()
    expect(matchState(done, at)).toBe('final')
  })
  it('not started, or no score yet: nothing from the feed', () => {
    expect(liveScore(feed('Not started', 0, 0), at)).toBeNull()
    expect(liveScore(m({ live_state: 'First half', live_updated_at: new Date(at).toISOString() }), at)).toBeNull()
  })
})
