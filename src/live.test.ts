import { describe, expect, it } from 'vitest'
import type { Match } from './lib/supabase'
import { koReason, LIVE_MS, matchState, pickState } from './live'

const KO = Date.parse('2026-12-12T15:00:00Z') // Sat 15:00 Irish (winter, UTC+0)
const m = (p: Partial<Match> = {}): Match => ({
  id: 1, round_id: 1, home_team_id: 10, away_team_id: 20, kickoff_at: new Date(KO).toISOString(),
  home_score: null, away_score: null, winner_team_id: null, status: 'scheduled', ...p,
})
const ft = (h: number, a: number, p: Partial<Match> = {}) => m({ status: 'completed', home_score: h, away_score: a, ...p })

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
  it('not started: "locked" on match day (Irish), "later" before it', () => {
    expect(pickState(m(), 10, false, Date.parse('2026-12-12T00:30:00Z'))).toBe('locked')
    expect(pickState(m(), 10, false, Date.parse('2026-12-11T23:30:00Z'))).toBe('later')
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
