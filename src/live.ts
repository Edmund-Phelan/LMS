import type { Match } from './lib/supabase'

// Spec §16 + LIVE-FEED.md §3 step 6: live scores from the feed (live_*) while it's fresh; without it, "live" comes
// from the clock and scores only from a result. Highlightly has no match minute, so the label is the state.
export const LIVE_MS = 100 * 60_000 // kick-off → ~full time (80 min + half-time + stoppages)
export const STALE_MS = 20 * 60_000 // feed older than this → back to the clock

export type MatchState = 'upcoming' | 'live' | 'waiting' | 'final' | 'off'

const LIVE_LABEL: Record<string, string> = {
  'First half': '1ST HALF',
  'Half time': 'HT',
  'Second half': '2ND HALF',
  'Extra time': 'EXTRA TIME',
  'Break time': 'BREAK',
  Penalties: 'KICKS',
  Suspended: 'SUSPENDED',
  Interrupted: 'STOPPED',
}

/**
 * The feed's score: in play and fresh → { label: '2ND HALF', … }; full time → final: true (shown "being checked":
 * the list's score is live only, the result comes from the standings + ESPN check or an admin, LIVE-FEED.md §4).
 */
export function liveScore(m: Match, now: number) {
  if (m.status !== 'scheduled' || m.live_home == null || m.live_away == null || !m.live_updated_at) return null
  const final = /^Finished/.test(m.live_state ?? '')
  const label = final ? 'FULL TIME' : m.live_state ? LIVE_LABEL[m.live_state] : undefined
  const at = Date.parse(m.live_updated_at)
  if (!label || (!final && now - at > STALE_MS)) return null
  return { label, home: m.live_home, away: m.live_away, at, final }
}

export function matchState(m: Match, now: number): MatchState {
  if (m.status === 'postponed' || m.status === 'abandoned') return 'off'
  if (m.status === 'completed' && m.home_score !== null && m.away_score !== null) return 'final'
  const ls = liveScore(m, now)
  if (ls) return ls.final ? 'waiting' : 'live'
  const k = Date.parse(m.kickoff_at)
  return now < k ? 'upcoming' : now < k + LIVE_MS ? 'live' : 'waiting'
}

/** An official result is in (or the match is off): what the settle needs for every match. */
export const hasResult = (m: Match) =>
  m.status === 'postponed' || m.status === 'abandoned' || (m.status === 'completed' && m.home_score !== null)

/** Did `teamId` win a final match? Rule 6: pool draw = loss; knockouts = winner_team_id (an admin always sets it). */
export function won(m: Match, teamId: number, knockout: boolean) {
  if (knockout) return m.winner_team_id === teamId
  const [mine, theirs] = teamId === m.home_team_id ? [m.home_score!, m.away_score!] : [m.away_score!, m.home_score!]
  return mine > theirs
}

/** A pick after the lock, for "Your pick" and the squad chips. Through/out are provisional until settle. */
export type PickState = 'locked' | 'live' | 'waiting' | 'through' | 'out' | 'back'

export function pickState(m: Match, teamId: number, knockout: boolean, now: number): PickState {
  const s = matchState(m, now)
  if (s === 'off') return 'back'
  if (s === 'final') return won(m, teamId, knockout) ? 'through' : 'out'
  if (s === 'upcoming') return 'locked' // any day: every pick reads "Locked in" until kick-off (Eddie, 17 Oct)
  return s
}

/** Why a final match knocked `teamId`'s picker out (§17): "a draw is a loss", "lost by 7". */
export function koReason(m: Match, teamId: number, knockout: boolean) {
  const margin = Math.abs(m.home_score! - m.away_score!)
  if (margin === 0) return knockout ? 'out on the kicking competition' : 'a draw is a loss'
  return won(m, teamId, knockout) ? 'through' : `lost by ${margin}`
}
