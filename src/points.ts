import { supabase } from './lib/supabase'

/** One row of points_table(): prediction + jinx points across settled rounds (rules 13/14). */
export type Standing = {
  player_id: string
  points: number
  prediction_points: number
  exact: number
  jinx: number
  alive: boolean | null
}

/** Sorted points desc, exact desc, name (UI-REDESIGN §6). */
export const loadTable = async () => ((await supabase.rpc('points_table')).data ?? []) as Standing[]
