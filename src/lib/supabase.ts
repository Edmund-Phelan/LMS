import { createClient } from '@supabase/supabase-js'
import type { Match as EngineMatch, Stage } from '../engine/engine'
import type { Kit } from '../Jersey'

// Anon key only. Security comes from RLS, not from hiding this key.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export type Team = {
  id: number
  slug: string
  name: string
  primary: string
  secondary: string
  text: string
  crest: string
  kit: Kit
}
export type Round = {
  id: number
  number: number
  stage: Stage
  name: string
  lock_at: string
  featured_match_id: number | null
  settled_at: string | null
  clean_slate: boolean
  tiebreak: number[] | null
}
export type Match = {
  id: number
  round_id: number
  home_team_id: number
  away_team_id: number
  kickoff_at: string
  home_score: number | null
  away_score: number | null
  winner_team_id: number | null
  status: EngineMatch['status']
}
export type Player = { id: string; name: string; nickname: string | null; is_admin?: boolean }
export type Pick = { round_id: number; player_id: string; team_id: number; is_auto: boolean; is_resurrection?: boolean }

export const crestUrl = (t: Team) => import.meta.env.BASE_URL + t.crest

const irish = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
export const irishTime = (iso: string) => irish.format(new Date(iso))
