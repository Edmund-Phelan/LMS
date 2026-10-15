import { useEffect, useState } from 'react'
import { supabase, type Player } from './lib/supabase'
import { loadPayments, potEur } from './Pay'
import { loadTable, rankOf, type Standing } from './points'
import { Avatar } from './Profile'
import Shell, { Loading } from './Shell'

type Data = { table: Standing[]; players: Map<string, Player>; pot: number; settled: boolean; notIn: Set<string> }

async function load(): Promise<Data> {
  const [table, players, payments, settled, notIn] = await Promise.all([
    loadTable(),
    supabase.from('players').select('id, name, nickname, avatar_url, kit_colour').returns<Player[]>(),
    loadPayments(),
    supabase.from('rounds').select('id', { count: 'exact', head: true }).not('settled_at', 'is', null),
    // §22: already_out in Round 1 = never got in
    supabase
      .from('round_results')
      .select('player_id, rounds!inner(number)')
      .eq('rounds.number', 1)
      .eq('outcome', 'already_out'),
  ])
  const out = new Set((notIn.data ?? []).map((r) => r.player_id as string))
  return {
    notIn: out,
    // ponytail: stable sort keeps the points order within each group
    table: [...table].sort((a, b) => Number(out.has(a.player_id)) - Number(out.has(b.player_id))),
    players: new Map((players.data ?? []).map((p) => [p.id, p])),
    pot: potEur(payments.data ?? []),
    settled: (settled.count ?? 0) > 0,
  }
}

const TILES = [
  [5, 'Exact'],
  [3, 'Within 5'],
  [2, 'Within 10'],
  [1, 'Right winner'],
] as const

export default function TablePage({ me }: { me: string }) {
  const [data, setData] = useState<Data>()
  useEffect(() => {
    load().then(setData)
  }, [])
  if (!data)
    return (
      <Shell title="The table">
        <Loading />
      </Shell>
    )
  const cols = 'grid grid-cols-[28px_minmax(0,1fr)_52px_52px] gap-2'
  return (
    <Shell title="The table">
      <div className="screen stagger flex flex-col gap-4">
        <h1 className="disp text-[34px] font-extrabold">Points table</h1>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[18px] bg-[linear-gradient(160deg,#f2b226,#d9951a)] p-3.5 text-navy-900">
            <p className="text-[11px] font-extrabold tracking-[.12em]">LAST MAN · 80%</p>
            <p className="disp mt-0.5 text-[30px] font-extrabold">€{Math.round(data.pot * 0.8 * 100) / 100}</p>
          </div>
          <div className="rounded-[18px] bg-navy-800 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
            <p className="text-[11px] font-extrabold tracking-[.12em] text-muted">TOP OF TABLE · 20%</p>
            <p className="disp mt-0.5 text-[30px] font-extrabold">€{Math.round(data.pot * 0.2 * 100) / 100}</p>
          </div>
        </div>
        <div>
          <ol className="hairline overflow-hidden rounded-[20px] bg-navy-800">
            <li className={`${cols} px-3.5 py-2.5 text-[11px] font-bold tracking-[.1em] text-muted`} aria-hidden>
              <span>#</span>
              <span>PLAYER</span>
              <span className="text-right">EXACT</span>
              <span className="text-right">PTS</span>
            </li>
            {data.table.map((s, i) => {
              const p = data.players.get(s.player_id)
              if (!p) return null
              const out = s.alive === false
              const notIn = data.notIn.has(s.player_id)
              return (
                <li
                  key={s.player_id}
                  className={`${cols} items-center border-t border-white/6 px-3.5 py-3 ${s.player_id === me ? 'bg-gold/8' : ''} ${notIn ? 'opacity-50' : ''}`}
                >
                  <span className={`disp text-xl font-extrabold ${rankOf(data.table, i) === 1 ? 'text-gold' : ''}`}>
                    {rankOf(data.table, i)}
                  </span>
                  <span className={`flex min-w-0 items-center gap-2.5 ${out ? 'opacity-60' : ''}`}>
                    <Avatar p={p} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {p.nickname || p.name}
                        {s.player_id === me && ' (you)'}
                      </span>
                      <span
                        className={`block text-[11px] font-bold ${notIn ? 'text-muted' : out ? 'text-out-text' : 'text-in-text'}`}
                      >
                        {notIn ? 'NOT IN THIS YEAR' : out ? 'OUT · IN THE STANDS' : 'STILL IN'}
                      </span>
                    </span>
                  </span>
                  <span className="text-right font-semibold text-chalk-2 tabular-nums">{s.exact}</span>
                  <span className="text-right">
                    <span className="disp block text-[22px] leading-none font-extrabold tabular-nums">{s.points}</span>
                    {s.jinx > 0 && <span className="block text-[11px] text-muted">+{s.jinx} jinx</span>}
                  </span>
                </li>
              )
            })}
          </ol>
          {!data.settled && (
            <p className="mt-2 text-center text-xs text-muted">Points land when Round 1 is settled (Sun 18 Oct).</p>
          )}
        </div>
        <section className="hairline rounded-[20px] bg-navy-800 p-4">
          <h2 className="disp mb-2.5 text-lg font-extrabold">How points work</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {TILES.map(([n, label]) => (
              <div key={n} className={`rounded-xl px-1 py-2.5 ${n === 5 ? 'bg-gold/14' : 'bg-white/5'}`}>
                <p className={`disp text-[26px] font-extrabold ${n === 5 ? 'text-gold' : ''}`}>{n}</p>
                <p className="text-[11px] text-chalk-2">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-muted">Everyone predicts, in or out. Fewest points does the forfeit.</p>
        </section>
      </div>
    </Shell>
  )
}
