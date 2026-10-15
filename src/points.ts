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

/** Shared rank: players level on points and exact scores share a place ("1, 2, 2, 4"). */
export const rankOf = (table: Standing[], i: number) =>
  table.findIndex((s) => s.points === table[i].points && s.exact === table[i].exact) + 1
