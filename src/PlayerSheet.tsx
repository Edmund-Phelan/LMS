import { useEffect, useRef, useState, type ReactNode } from 'react'
import { crestUrl, supabase, type Match, type Pick, type Player, type Round, type Team } from './lib/supabase'
import { entryOf, loadPayments, type PaymentRow } from './Pay'
import { loadTable, rankOf, type Standing } from './points'
import { Avatar } from './Profile'
import { Icon } from './Shell'
import { predictionRows, road, type Prediction, type Result } from './profileData'

// Player profile sheet (docs/UI-REDESIGN.md §20). Read-only: only rows RLS already lets every player read
// (picks and predictions come back for locked rounds only), no sound, no haptic.

type Data = {
  rounds: Round[]
  teams: Map<number, Team>
  matches: Match[]
  picks: Pick[]
  predictions: Prediction[]
  results: Result[]
  table: Standing[]
  payments: PaymentRow[]
}

async function load(id: string): Promise<Data> {
  const [rounds, teams, matches, picks, predictions, results, table, payments] = await Promise.all([
    supabase.from('rounds').select('*').order('number').returns<Round[]>(),
    supabase.from('teams').select('*').returns<Team[]>(),
    supabase.from('matches').select('*').returns<Match[]>(),
    supabase.from('picks').select('round_id, player_id, team_id, is_auto').eq('player_id', id).returns<Pick[]>(),
    supabase.from('predictions').select('round_id, home_score, away_score').eq('player_id', id).returns<Prediction[]>(),
    supabase
      .from('round_results')
      .select('round_id, outcome, prediction_points, exact_score')
      .eq('player_id', id)
      .returns<Result[]>(),
    loadTable(),
    loadPayments(),
  ])
  return {
    rounds: rounds.data ?? [],
    teams: new Map((teams.data ?? []).map((t) => [t.id, t])),
    matches: matches.data ?? [],
    picks: picks.data ?? [],
    predictions: predictions.data ?? [],
    results: results.data ?? [],
    table: table,
    payments: payments.data ?? [],
  }
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Points count up from 0 over .6 s (ease-out cubic), starting at .25 s. */
function useCountUp(target: number | undefined) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target === undefined) return
    if (reduced()) return void setN(target)
    let raf = 0
    const t0 = performance.now() + 250
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 600))
      setN(Math.round(target * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return n
}

const hiddenFmt = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function Pill({ children, colour, bg }: { children: ReactNode; colour: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: bg, color: colour }}
    >
      {children}
    </span>
  )
}

export default function PlayerSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const [data, setData] = useState<Data>()
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const sheet = useRef<HTMLElement>(null)
  useEffect(() => {
    load(player.id).then(setData)
  }, [player.id])
  const close = () => setClosing(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setClosing(true)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const i = data?.table.findIndex((s) => s.player_id === player.id) ?? -1
  const mine = data?.table[i]
  const points = useCountUp(data ? (mine?.points ?? 0) : undefined)

  let body: ReactNode = null
  if (data) {
    const r1 = data.rounds[0]
    const notIn = data.results.some((r) => r.round_id === r1?.id && r.outcome === 'already_out')
    const numberOf = new Map(data.rounds.map((r) => [r.id, r.number]))
    const outs = data.results.filter((r) => r.outcome === 'out').map((r) => numberOf.get(r.round_id)!)
    const alive = mine?.alive === true
    const boughtBack =
      alive && data.payments.some((p) => p.player_id === player.id && p.kind === 'buyback' && p.status === 'confirmed')
    const entry = entryOf(data.payments, player.id)?.status
    const now = Date.now()
    const tiles = road(data.rounds, data.picks, data.results, data.matches, data.teams, alive, now)
    const current = data.rounds.find((r) => !r.settled_at)
    const postponed = new Set(data.results.filter((r) => r.outcome === 'survived_postponed').map((r) => r.round_id))
    const lockOf = new Map(data.rounds.map((r) => [r.id, Date.parse(r.lock_at)]))
    const used = new Set(
      data.picks
        .filter((p) => !postponed.has(p.round_id) && now >= (lockOf.get(p.round_id) ?? Infinity))
        .map((p) => p.team_id),
    ).size
    const preds = predictionRows(data.rounds, data.predictions, data.results, data.matches, data.teams)
    body = (
      <>
        <div className="flex items-center gap-4 pt-1">
          <span className="av-pop rounded-full shadow-[0_14px_30px_rgba(0,0,0,.4)]">
            <Avatar p={player} size={76} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="disp truncate text-[32px] leading-[.95] font-extrabold">{player.nickname || player.name}</p>
            <p className="text-sm text-chalk-2">
              {player.nickname && player.nickname !== player.name ? player.name : 'No nickname'}
              {player.is_admin && ' · Admin'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {notIn ? (
                <Pill colour="#a8b3d1" bg="rgba(255,255,255,.08)">
                  Not in this year
                </Pill>
              ) : boughtBack ? (
                <Pill colour="#f2b226" bg="rgba(242,178,38,.18)">
                  Bought back
                </Pill>
              ) : !alive && outs.length ? (
                <Pill colour="#ff8a8a" bg="rgba(229,72,77,.16)">
                  <span aria-hidden className="h-[11px] w-2 rounded-[2px] bg-[#e5484d]" />
                  Out · Round {Math.max(...outs)}
                </Pill>
              ) : (
                <Pill colour="#6fe3a1" bg="rgba(60,207,122,.14)">
                  <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-in" />
                  Still standing
                </Pill>
              )}
              {entry === 'confirmed' ? (
                <Pill colour="#cdd5ea" bg="rgba(255,255,255,.07)">
                  {Icon.check(12, 3)}Entry paid
                </Pill>
              ) : (
                <Pill colour="#ffb35c" bg="rgba(255,179,92,.14)">
                  {entry === 'claimed' ? 'Payment pending' : 'Not paid'}
                </Pill>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [points, 'Points', true],
              [i < 0 ? '–' : `#${rankOf(data.table, i)}`, `of ${data.table.length} on the table`],
              [mine?.exact ?? 0, 'Exact scores'],
            ] as const
          ).map(([v, l, gold]) => (
            <div key={l} className="rounded-2xl bg-navy-900 px-1.5 py-3 text-center">
              <p className={`disp text-[32px] leading-[1.05] font-extrabold tabular-nums ${gold ? 'text-gold' : ''}`}>
                {v}
              </p>
              <p className="text-xs text-chalk-2">{l}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="disp text-lg font-extrabold">Their road</h2>
            <span className="text-xs text-muted">{used} of 24 teams used</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {tiles.map((t, k) => {
              const delay = { animationDelay: `${0.3 + k * 0.07}s` }
              const base =
                'tile flex h-[106px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-[14px] px-1 py-2 text-center'
              if (t.kind === 'pick')
                return (
                  <div
                    key={k}
                    className={base}
                    style={{
                      ...delay,
                      ...(t.out
                        ? { background: '#3a1020', color: '#ff8a8a', boxShadow: 'inset 0 0 0 2px #e5484d' }
                        : { background: t.team.card_bg, color: t.team.card_text }),
                    }}
                  >
                    <span className="text-[10px] font-extrabold tracking-[.1em] opacity-85">{t.label}</span>
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white">
                      <img
                        src={crestUrl(t.team)}
                        alt=""
                        className={`h-[25px] w-[25px] object-contain ${t.out ? 'grayscale' : ''}`}
                      />
                    </span>
                    <span className="disp max-w-full truncate text-sm leading-[1.05] font-extrabold">
                      {t.team.name}
                    </span>
                    <span className="text-[10px] leading-[1.15] font-bold opacity-85">{t.line}</span>
                  </div>
                )
              return (
                <div key={k} className={`${base} border border-dashed border-white/18 text-muted`} style={delay}>
                  <span className="text-[10px] font-extrabold tracking-[.1em] opacity-85">{t.label}</span>
                  {t.kind === 'hidden' && Icon.lock(22, 2)}
                  <span className="text-[10px] leading-[1.15] font-bold">
                    {t.kind === 'hidden'
                      ? `Hidden till ${hiddenFmt.format(new Date(current!.lock_at)).replace(',', '')}`
                      : t.kind === 'stands'
                        ? 'In the stands'
                        : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <h2 className="disp text-lg font-extrabold">Featured-match predictions</h2>
            {(mine?.jinx ?? 0) > 0 && <span className="text-xs text-muted">Jinx points: {mine!.jinx}</span>}
          </div>
          {preds.length ? (
            <div className="overflow-hidden rounded-2xl bg-navy-900">
              {preds.map((q) => (
                <div
                  key={q.label}
                  className="flex items-center gap-2.5 border-t border-white/6 px-3 py-2.5 first:border-0"
                >
                  <span className="disp w-[26px] text-[15px] font-extrabold text-muted">{q.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{q.fixture}</span>
                    <span className="block text-xs text-muted">
                      Said {q.said} · finished {q.finished}
                    </span>
                  </span>
                  <span className={`disp text-lg font-extrabold ${q.points ? 'text-gold' : 'text-muted'}`}>
                    {q.points}
                    {q.exact && ' ★'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Nothing settled yet.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <button
        type="button"
        aria-label="Close profile"
        onClick={close}
        className={`absolute inset-0 bg-[rgba(3,6,20,.62)] ${closing ? 'fade-out' : 'fade-in'}`}
      />
      <section
        ref={sheet}
        role="dialog"
        aria-modal
        aria-label={`${player.nickname || player.name}'s profile`}
        className={`scroll absolute inset-x-0 bottom-0 mx-auto h-[86vh] max-w-[480px] overflow-y-auto rounded-t-[28px] bg-navy-800 px-[18px] pt-2.5 pb-[calc(26px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,.5)] ${closing ? 'psheet-out' : 'psheet-in'}`}
        style={drag ? { transform: `translateY(${drag}px)`, animation: 'none' } : undefined}
        onAnimationEnd={(e) => e.target === e.currentTarget && closing && onClose()}
        onTouchStart={(e) => {
          start.current = sheet.current!.scrollTop <= 0 ? e.touches[0].clientY : null
        }}
        onTouchMove={(e) => start.current !== null && setDrag(Math.max(0, e.touches[0].clientY - start.current))}
        onTouchEnd={() => {
          start.current = null
          if (drag > 80) close()
          setDrag(0)
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute top-2.5 right-2.5 flex h-11 w-11 items-center justify-center text-muted"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="prise flex flex-col gap-3.5">
          <span aria-hidden className="h-[5px] w-10 self-center rounded-[3px] bg-white/30" />
          {body}
        </div>
      </section>
    </div>
  )
}
