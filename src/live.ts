import type { Match } from './lib/supabase'

// Spec §16 without a feed: "live" comes from the clock, scores only from an admin's result.
// ponytail: no live score or minute; add them back if a results API turns up (NEXT.md 5c).
export const LIVE_MS = 100 * 60_000 // kick-off → ~full time (80 min + half-time + stoppages)

export type MatchState = 'upcoming' | 'live' | 'waiting' | 'final' | 'off'

export function matchState(m: Match, now: number): MatchState {
  if (m.status === 'postponed' || m.status === 'abandoned') return 'off'
  if (m.status === 'completed' && m.home_score !== null && m.away_score !== null) return 'final'
  const k = Date.parse(m.kickoff_at)
  return now < k ? 'upcoming' : now < k + LIVE_MS ? 'live' : 'waiting'
}

/** Did `teamId` win a final match? Rule 6: pool draw = loss; knockouts = winner_team_id (an admin always sets it). */
export function won(m: Match, teamId: number, knockout: boolean) {
  if (knockout) return m.winner_team_id === teamId
  const [mine, theirs] = teamId === m.home_team_id ? [m.home_score!, m.away_score!] : [m.away_score!, m.home_score!]
  return mine > theirs
}

/** A pick after the lock, for "Your pick" and the squad chips. Through/out are provisional until settle. */
export type PickState = 'locked' | 'later' | 'live' | 'waiting' | 'through' | 'out' | 'back'

const day = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', dateStyle: 'short' })

export function pickState(m: Match, teamId: number, knockout: boolean, now: number): PickState {
  const s = matchState(m, now)
  if (s === 'off') return 'back'
  if (s === 'final') return won(m, teamId, knockout) ? 'through' : 'out'
  if (s === 'upcoming') return day.format(now) === day.format(Date.parse(m.kickoff_at)) ? 'locked' : 'later'
  return s
}

/** Why a final match knocked `teamId`'s picker out (§17): "a draw is a loss", "lost by 7". */
export function koReason(m: Match, teamId: number, knockout: boolean) {
  const margin = Math.abs(m.home_score! - m.away_score!)
  if (margin === 0) return knockout ? 'out on the kicking competition' : 'a draw is a loss'
  return won(m, teamId, knockout) ? 'through' : `lost by ${margin}`
}
