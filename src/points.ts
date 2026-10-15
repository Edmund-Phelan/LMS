import { supabase } from './lib/supabase'

/** One row of the points table: prediction + jinx points across settled rounds (rules 13/14). */
export type Standing = {
  player_id: string
  points: number
  prediction_points: number
  exact: number
  jinx: number
  alive: boolean | null
}

/** Sorted points desc, exact desc, name (UI-REDESIGN §6). Settled results are public. */
export async function loadTable(): Promise<Standing[]> {
  const [players, results, rounds] = await Promise.all([
    supabase.from('players').select('id, name').order('name'),
    supabase.from('round_results').select('player_id, prediction_points, exact_score, jinx_points'),
    supabase.from('rounds').select('id').is('settled_at', null).order('number').limit(1),
  ])
  const current = rounds.data?.[0]?.id
  const status = current ? await supabase.rpc('round_status', { r: current }) : { data: [] }
  const alive = new Map(((status.data ?? []) as { player_id: string; alive: boolean | null }[]).map((s) => [s.player_id, s.alive]))
  const rows = (players.data ?? []).map((p) => {
    const rs = (results.data ?? []).filter((r) => r.player_id === p.id)
    const prediction_points = rs.reduce((s, r) => s + r.prediction_points, 0)
    const jinx = rs.reduce((s, r) => s + r.jinx_points, 0)
    return {
      player_id: p.id,
      name: p.name as string,
      points: prediction_points + jinx,
      prediction_points,
      exact: rs.filter((r) => r.exact_score).length,
      jinx,
      alive: alive.get(p.id) ?? null,
    }
  })
  rows.sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
  return rows.map(({ name: _, ...s }) => s)
}
