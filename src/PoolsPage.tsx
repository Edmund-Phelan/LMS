import { useEffect, useState } from 'react'
import standings from './data/standings.json'
import teamsJson from './data/teams.json'
import { lockLabel, supabase } from './lib/supabase'
import Shell from './Shell'

// Pools tab (docs/UI-REDESIGN.md §15). No feed: standings.json is updated every Monday (skill update-standings) and
// shown in the order it was published; the app never re-ranks a pool.
type Row = (typeof standings.pools)[number][number]
const TEAM = new Map(teamsJson.map((t) => [t.slug, t]))
const crest = (slug: string) => import.meta.env.BASE_URL + TEAM.get(slug)!.crest
const name = (slug: string) => TEAM.get(slug)!.name
const pd = (r: Row) => r.pf - r.pa

const played = standings.pools.some((p) => p.some((r) => r.p > 0))
// Every non-top-3 team, across pools, by points then wins (§15's format). ponytail: further ties keep pool order;
// EPCR's full tiebreak isn't modelled, so the cut line is a guide until EPCR publishes the last 16.
const rest = standings.pools
  .flatMap((p, i) => p.slice(3).map((r) => ({ ...r, pool: i + 1 })))
  .sort((a, b) => b.pts - a.pts || b.w - a.w)
const wild = new Set(played ? rest.slice(0, 4).map((r) => r.slug) : [])

/** My latest pick's team slug, and whether that team knocked me out. */
async function loadMyPick(me: string) {
  const [picks, rounds, teams, results] = await Promise.all([
    supabase.from('picks').select('round_id, team_id').eq('player_id', me),
    supabase.from('rounds').select('id, number'),
    supabase.from('teams').select('id, slug'),
    supabase.from('round_results').select('round_id, outcome').eq('player_id', me),
  ])
  const num = new Map((rounds.data ?? []).map((r) => [r.id, r.number]))
  const last = (picks.data ?? []).sort((a, b) => (num.get(b.round_id) ?? 0) - (num.get(a.round_id) ?? 0))[0]
  if (!last) return null
  return {
    slug: (teams.data ?? []).find((t) => t.id === last.team_id)?.slug,
    out: (results.data ?? []).some((r) => r.round_id === last.round_id && r.outcome === 'out'),
  }
}

const COLS = 'grid grid-cols-[26px_minmax(0,1fr)_24px_24px_24px_36px_34px] gap-1'

export default function PoolsPage({ me }: { me: string }) {
  const [mine, setMine] = useState<{ slug?: string; out: boolean } | null>(null)
  const [pool, setPool] = useState<number>()
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    loadMyPick(me).then(setMine)
  }, [me])
  const myPool = standings.pools.findIndex((p) => p.some((r) => r.slug === mine?.slug))
  const cur = pool ?? Math.max(0, myPool)

  return (
    <Shell title="Champions Cup pools">
      <div className="screen stagger flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="disp text-[34px] font-extrabold">Pools</h1>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-in" />
            {played ? `Updated ${lockLabel(standings.updated, ', ')}` : 'Updates every Monday'}
          </span>
        </div>
        {!played && (
          <p className="rounded-[14px] bg-blue/12 px-3.5 py-3 text-[13px] font-semibold text-blue-text">
            Season starts Fri 16 Oct. Tables fill in on the Monday after each round.
          </p>
        )}

        <div role="tablist" aria-label="Pool" className="grid grid-cols-4 gap-1 rounded-[14px] bg-white/5 p-1">
          {standings.pools.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={cur === i}
              onClick={() => (setPool(i), setOpen(null))}
              className={`press h-10 rounded-[10px] text-sm font-extrabold transition-colors duration-250 ${cur === i ? 'bg-gold text-navy-900' : 'text-chalk-2'}`}
            >
              Pool {i + 1}
            </button>
          ))}
        </div>

        <section className="hairline overflow-hidden rounded-[20px] bg-navy-800">
          <div className={`${COLS} px-3 py-2.5 text-[11px] font-bold tracking-[.06em] text-muted`} aria-hidden>
            <span>#</span>
            <span>TEAM</span>
            <span className="text-center">P</span>
            <span className="text-center">W</span>
            <span className="text-center">L</span>
            <span className="text-right">PD</span>
            <span className="text-right">PTS</span>
          </div>
          {standings.pools[cur].map((r, i) => {
            const top = played && i < 3
            const wc = wild.has(r.slug)
            const isPick = mine?.slug === r.slug
            const isOpen = open === r.slug
            return (
              <div key={r.slug} className={`relative border-t border-white/6 ${isPick ? 'bg-gold/9' : ''}`}>
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-[3px] ${top ? 'bg-in' : wc ? 'bg-blue' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.slug)}
                  aria-expanded={isOpen}
                  className={`press ${COLS} w-full items-center px-3 py-2.5 text-left`}
                >
                  <span
                    className={`disp text-[17px] font-extrabold ${top ? 'text-in-text' : wc ? 'text-blue-text' : ''}`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white">
                      <img src={crest(r.slug)} alt="" className="h-5 w-5 object-contain" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{name(r.slug)}</span>
                      {isPick && (
                        <span
                          className={`block text-[10px] font-extrabold tracking-[.06em] ${mine.out ? 'text-out-text' : 'text-gold'}`}
                        >
                          {mine.out ? 'KNOCKED YOU OUT' : 'YOUR PICK'}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-center text-sm text-chalk-2">{r.p}</span>
                  <span className="text-center text-sm text-chalk-2">{r.w}</span>
                  <span className="text-center text-sm text-chalk-2">{r.l}</span>
                  <span className="text-right text-sm text-chalk-2 tabular-nums">
                    {pd(r) > 0 ? '+' : ''}
                    {pd(r)}
                  </span>
                  <span className="disp text-right text-[19px] font-extrabold tabular-nums">{r.pts}</span>
                </button>
                {isOpen && (
                  <div className="pop grid grid-cols-5 gap-1.5 pr-3 pb-3 pl-[46px]">
                    {(
                      [
                        ['Drawn', r.d],
                        ['For', r.pf],
                        ['Against', r.pa],
                        ['Try BP', r.tbp],
                        ['Losing BP', r.lbp],
                      ] as const
                    ).map(([k, v]) => (
                      <span key={k} className="rounded-[10px] bg-white/5 px-0.5 py-1.5 text-center">
                        <span className="disp block text-[17px] font-extrabold">{v}</span>
                        <span className="block text-[10px] text-muted">{k}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <div className="flex gap-3.5 px-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-in" />
            Top 3 → last 16
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-blue" />
            Best 4 of the rest
          </span>
        </div>

        <section className="hairline flex flex-col gap-2 rounded-[20px] bg-navy-800 p-3.5">
          <h2 className="disp text-lg font-extrabold">Race for the last four places</h2>
          <p className="text-xs text-muted">
            Every team outside a pool’s top 3, ranked across all pools by points, then wins.
          </p>
          <ol>
            {rest.slice(0, 6).map((r, i) => (
              <li
                key={r.slug}
                className={`flex items-center gap-2.5 py-1.5 ${i === 4 ? 'border-t-2 border-dashed border-white/20' : i ? 'border-t border-white/6' : ''}`}
              >
                <span
                  className={`disp w-[18px] text-[15px] font-extrabold ${played && i < 4 ? 'text-blue-text' : 'text-muted'}`}
                >
                  {i + 1}
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
                  <img src={crest(r.slug)} alt="" className="h-[18px] w-[18px] object-contain" />
                </span>
                <span className="flex-1 text-sm font-semibold">
                  {name(r.slug)} <span className="text-[11px] text-muted">P{r.pool}</span>
                </span>
                <span className="disp text-[17px] font-extrabold tabular-nums">{r.pts}</span>
              </li>
            ))}
          </ol>
        </section>
        <p className="text-center text-xs text-muted">
          Tap a team for points for/against and bonus points. Level on points: most wins goes higher.
        </p>
      </div>
    </Shell>
  )
}
