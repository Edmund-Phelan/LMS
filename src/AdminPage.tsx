import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import * as E from './engine/engine'
import {
  load,
  must,
  notCounted,
  runEngine,
  settleArgs,
  shuffle,
  toMatch,
  toResult,
  toRound,
  type Data,
  type Preview,
} from './adminData'
import { crestUrl, lockLabel, supabase, type Match, type Team } from './lib/supabase'
import { hasResult } from './live'
import { potEur, type PaymentRow } from './Pay'
import { Avatar } from './Profile'
import { Icon, Loading, Pushed } from './Shell'
import { sfx } from './sound'

// Admin (docs/UI-REDESIGN.md §9): Open → Locked → Results → Settle. Same logic as before; the engine runs here in
// the browser and settle_round() writes its output in one transaction. No window.confirm: destructive or
// one-shot actions are hold-to-confirm, rejects use a bottom sheet.

type Run = (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>
type Names = { data: Data; name: (id: string) => string; team: (id: number) => Team }
const STEPS = ['Open', 'Locked', 'Results', 'Settle'] as const

export default function AdminPage() {
  const param = useParams().number
  const [data, setData] = useState<Data | null | undefined>()
  const [squad, setSquad] = useState<{ player_id: string; has_pick: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null) // survives the settle step remounting
  const number = Number(param)
  const [picked, setStep] = useState<{ round: number; step: number } | null>(null) // null = the round's own stage
  const reload = useCallback(
    () =>
      load(number)
        .then(async (d) => {
          setData(d)
          if (d) setSquad(((await supabase.rpc('round_pick_status', { r: d.round.id })).data ?? []) as typeof squad)
        })
        .catch((e: Error) => setError(e.message)),
    [number],
  )
  useEffect(() => {
    if (param) reload()
  }, [param, reload])

  if (!param) return <CurrentAdminRound />
  if (data === undefined)
    return (
      <Pushed title={`Round ${number}`} eyebrow="Admin" eyebrowGold>
        {error ? <p className="p-6 text-out-text">{error}</p> : <Loading />}
      </Pushed>
    )
  if (data === null || !data.me?.is_admin)
    return (
      <Pushed title={`Round ${number}`} eyebrow="Admin" eyebrowGold>
        <p className="p-6 text-muted">{data === null ? 'No such round.' : 'Admins only.'}</p>
      </Pushed>
    )

  const { round } = data
  const name = (id: string) => {
    const p = data.players.find((p) => p.id === id)
    return p?.nickname || p?.name || '?'
  }
  const team = (id: number) => data.teams.get(id)!
  const run: Run = async (p) => {
    setError(null)
    const { error } = await p
    if (error) setError(error.message)
    await reload()
    return !error
  }
  const locked = Date.now() >= Date.parse(round.lock_at) // display only; the server checks
  const allIn = data.matches.length > 0 && data.matches.every(hasResult)
  const auto = round.settled_at ? 3 : !locked ? 0 : allIn ? 3 : data.matches.some(hasResult) ? 2 : 1
  const cur = picked?.round === number ? picked.step : auto
  const names = { data, name, team }

  return (
    <Pushed
      title={round.name}
      eyebrow="Admin"
      eyebrowGold
      right={
        <span className="rounded-full bg-white/6 px-2.5 py-[5px] text-xs font-semibold whitespace-nowrap text-muted">
          Pot €{potEur(data.paymentRows)}
        </span>
      }
    >
      <Stepper cur={cur} done={round.settled_at ? 4 : auto} onStep={(step) => setStep({ round: number, step })} />
      {error && (
        <p role="alert" className="mb-3 rounded-2xl bg-out-text/15 p-3 text-out-text">
          {error}
        </p>
      )}
      <div key={cur} className="screen stagger flex flex-col gap-3.5">
        {cur === 0 && <OpenStep {...names} squad={squad} run={run} />}
        {cur === 1 && <LockedStep {...names} />}
        {cur === 2 && (
          <ResultsStep
            {...names}
            onSaved={(id, patch) =>
              setData((d) => d && { ...d, matches: d.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
            }
            onDone={() => setStep({ round: number, step: 3 })}
          />
        )}
        {notice && <p className="pop rounded-[14px] bg-in/12 p-3 text-center font-bold text-in-text">{notice}</p>}
        {cur === 3 && (
          <SettleStep
            // A payment confirmed from the preview remounts it: a fresh preview and draw on the new data.
            key={`${round.settled_at ?? 'open'}-${data.paymentRows.filter((p) => p.status === 'confirmed').length}`}
            {...names}
            number={number}
            reload={reload}
            notify={setNotice}
          />
        )}
      </div>
      <nav className="mt-6 flex justify-between text-sm font-semibold text-muted">
        {number > 1 ? (
          <Link to={`/admin/${number - 1}`} replace className="min-h-11 py-3">
            ‹ Round {number - 1}
          </Link>
        ) : (
          <span />
        )}
        <Link to={`/admin/${number + 1}`} replace className="min-h-11 py-3">
          Round {number + 1} ›
        </Link>
      </nav>
    </Pushed>
  )
}

function CurrentAdminRound() {
  const [n, setN] = useState<number | null>()
  useEffect(() => {
    supabase
      .from('rounds')
      .select('number')
      .is('settled_at', null)
      .order('number')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setN(data?.number ?? null))
  }, [])
  if (n === undefined) return <Loading />
  if (n === null) return <p className="p-6">Every round is settled.</p>
  return <Navigate to={`/admin/${n}`} replace />
}

function Stepper({ cur, done, onStep }: { cur: number; done: number; onStep: (i: number) => void }) {
  return (
    <nav aria-label="Round stage" className="px-1 pt-1.5 pb-4">
      <div className="relative grid grid-cols-4">
        <div aria-hidden className="absolute top-[15px] right-[12.5%] left-[12.5%] h-[3px] rounded-sm bg-white/10">
          <div
            className="h-full rounded-sm bg-gold transition-[width] duration-600 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{ width: `${(Math.min(done, 3) / 3) * 100}%` }}
          />
        </div>
        {STEPS.map((label, i) => {
          const on = i <= done || i === cur
          return (
            <button
              key={label}
              type="button"
              onClick={() => onStep(i)}
              aria-current={i === cur ? 'step' : undefined}
              className="relative flex min-h-11 flex-col items-center gap-1.5"
            >
              <span
                className="disp flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-extrabold transition-[background,color,transform] duration-300"
                style={{
                  background: on ? '#f2b226' : '#1c2d63',
                  color: on ? '#0b1742' : '#a8b3d1',
                  transform: i === cur ? 'scale(1.12)' : 'none',
                  boxShadow: i === cur ? '0 0 0 4px rgba(242,178,38,.25)' : 'none',
                }}
              >
                {i < done && i !== cur ? Icon.check(14, 3.4) : i + 1}
              </span>
              <span className={`text-xs font-bold ${i === cur ? 'text-gold' : 'text-muted'}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

const Panel = ({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) => (
  <section className="hairline flex flex-col gap-3 rounded-[20px] bg-navy-800 p-4">
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="disp text-[22px] font-extrabold">{title}</h2>
      {right && <span className="text-[13px] text-muted">{right}</span>}
    </div>
    {children}
  </section>
)

/** Hold-to-confirm (§9): the fill grows over 1.1 s while held; letting go early cancels. */
function HoldButton({
  label,
  onDone,
  danger,
  disabled,
}: {
  label: string
  onDone: () => void
  danger?: boolean
  disabled?: boolean
}) {
  const [held, setHeld] = useState(false)
  const timer = useRef<number>(undefined)
  const start = () => {
    if (disabled) return
    setHeld(true)
    timer.current = window.setTimeout(() => {
      setHeld(false)
      onDone()
    }, 1100)
  }
  const stop = () => {
    clearTimeout(timer.current)
    setHeld(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const fill = danger ? '#ff8a8a' : '#f2b226'
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${label} (press and hold)`}
      className={`relative h-14 touch-none overflow-hidden rounded-2xl font-extrabold select-none disabled:opacity-40 ${danger ? 'border border-out-text/50 text-out-text' : 'bg-[#3b2f12] text-chalk'}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: held ? '100%' : '0%', background: fill, transition: held ? 'width 1.1s linear' : 'none' }}
      />
      <span className="relative" style={{ color: held ? '#0b1742' : undefined, transition: 'color .3s' }}>
        {held ? 'Keep holding…' : label}
      </span>
    </button>
  )
}

function CopyButton({ text, label, done, gold }: { text: string; label: string; done: string; gold?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          /* clipboard blocked: nothing to show */
        }
      }}
      className={`press flex h-[50px] items-center justify-center gap-2 rounded-[14px] font-bold ${copied ? 'bg-in/15 text-in-text' : gold ? 'bg-gold text-navy-900' : 'border border-white/16'}`}
    >
      {copied ? (
        Icon.check(17, 3)
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? done : label}
    </button>
  )
}

const Crest = ({ t, size = 44 }: { t: Team; size?: number }) => (
  <span
    className="flex shrink-0 items-center justify-center rounded-full bg-white"
    style={{ width: size, height: size }}
  >
    <img src={crestUrl(t)} alt="" style={{ width: size * 0.72, height: size * 0.72 }} className="object-contain" />
  </span>
)

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
const hour = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})
/** "Fri 8pm" for the WhatsApp nudge (en-IE would say "8 p.m."). */
function shortLock(iso: string) {
  const parts = hour.formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')!.value)
  return `${parts.find((p) => p.type === 'weekday')!.value} ${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
}
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )

// ---------- 1. Open ----------

function OpenStep({
  data,
  name,
  team,
  squad,
  run,
}: Names & { squad: { player_id: string; has_pick: boolean }[]; run: Run }) {
  const { round } = data
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [marking, setMarking] = useState<string | null>(null) // armed "Mark paid" (second tap records it)
  const claims = data.paymentRows.filter((p) => p.status === 'claimed')
  // Paid on Revolut but never tapped "I've paid" (Eddie, 15 Oct): no entry row at all.
  const noEntry = data.players.filter((p) => !data.paymentRows.some((r) => r.player_id === p.id && r.kind === 'entry'))
  const paid = new Set(
    data.paymentRows.filter((p) => p.kind === 'entry' && p.status === 'confirmed').map((p) => p.player_id),
  )
  const picked = new Set(squad.filter((s) => s.has_pick).map((s) => s.player_id))
  const notPicked = squad.filter((s) => !s.has_pick).map((s) => name(s.player_id))
  const featured = data.matches.find((m) => m.id === round.featured_match_id)
  const first = data.matches[0]
  const nudge =
    `LMS Round ${round.number}: picks lock ${shortLock(round.lock_at)}. Still to pick: ${notPicked.join(', ') || 'nobody'}.` +
    (round.number === 1 ? ' No pick, no entry.' : '')

  return (
    <>
      <OpenBanner data={data} name={name} run={run} />
      <Panel title="Payments" right={`${paid.size} of ${data.players.length} paid`}>
        {claims.length === 0 && !confirmed && <p className="text-sm text-muted">No claims waiting.</p>}
        {claims.map((c) => {
          const p = data.players.find((p) => p.id === c.player_id)!
          return (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-[14px] bg-gold/8 p-3 shadow-[inset_0_0_0_1px_rgba(242,178,38,.3)]"
            >
              <Avatar p={p} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block leading-tight font-semibold">{name(p.id)} says they’ve paid</span>
                <span className="block text-xs text-muted">
                  €{Number(c.amount_eur)} {c.kind === 'buyback' ? 'buy-back' : 'entry'} · {ago(c.claimed_at)} · check
                  Revolut
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRejecting(c)}
                aria-label={`Reject ${name(p.id)}'s claim`}
                className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/16 text-out-text"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <button
                type="button"
                onClick={async () => {
                  sfx.confirmPayment()
                  if (await run(supabase.rpc('confirm_payment', { p_id: c.id }))) setConfirmed(name(p.id))
                }}
                className="press h-10 shrink-0 rounded-xl bg-gold px-3.5 font-extrabold text-navy-900"
              >
                Confirm
              </button>
            </div>
          )
        })}
        {noEntry.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold tracking-[.08em] text-muted uppercase">
              Not paid · paid you anyway? Mark it
            </p>
            {noEntry.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5">
                <Avatar p={p} size={32} />
                <span className="min-w-0 flex-1 truncate font-semibold">{name(p.id)}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (marking !== p.id) return setMarking(p.id) // first tap arms it: confirmed can't be undone
                    setMarking(null)
                    sfx.confirmPayment()
                    if (await run(supabase.rpc('mark_paid', { p_player: p.id }))) setConfirmed(name(p.id))
                  }}
                  className={`press h-9 shrink-0 rounded-xl px-3 text-sm font-extrabold ${marking === p.id ? 'bg-gold text-navy-900' : 'border border-white/16 text-chalk'}`}
                >
                  {marking === p.id ? `Tap again: ${name(p.id)} paid €10` : 'Mark paid'}
                </button>
              </div>
            ))}
          </div>
        )}
        {confirmed && (
          <p className="pop rounded-[14px] bg-in/12 p-3 text-center font-bold text-in-text">
            {confirmed} confirmed. Paid mark is live for everyone.
          </p>
        )}
      </Panel>

      <Panel title="Picks" right={`${picked.size} of ${squad.length} picked`}>
        <div className="grid grid-cols-6 gap-x-1.5 gap-y-3">
          {squad.map((s) => {
            const p = data.players.find((p) => p.id === s.player_id)!
            return (
              <span key={p.id} className="flex flex-col items-center gap-1">
                <span className="relative" style={{ opacity: s.has_pick ? 1 : 0.55 }}>
                  <Avatar p={p} size={40} />
                  {s.has_pick && (
                    <span className="absolute -right-1 -bottom-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue text-navy-900 shadow-[0_0_0_2px_#14224f]">
                      {Icon.check(10, 4)}
                    </span>
                  )}
                </span>
                <span className="max-w-[52px] truncate text-[11px] text-muted">{name(p.id)}</span>
              </span>
            )
          })}
        </div>
        <p className="text-xs text-muted">Teams are hidden from admins too until {lockLabel(round.lock_at)}.</p>
        <CopyButton text={nudge} label="Copy WhatsApp nudge" done="Copied. Paste it in the group" />
      </Panel>

      <Panel title="Featured match">
        {featured ? (
          <div className="flex items-center gap-2.5">
            <Crest t={team(featured.home_team_id)} />
            <span className="disp text-lg font-extrabold text-gold">v</span>
            <Crest t={team(featured.away_team_id)} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">
                {team(featured.home_team_id).name} v {team(featured.away_team_id).name}
              </span>
              <span className="block text-xs text-muted">
                Drawn {round.featured_drawn_at ? lockLabel(round.featured_drawn_at, ', ') : ''} · no re-draws
              </span>
            </span>
          </div>
        ) : (
          <HoldButton
            label="Draw featured match"
            onDone={() => run(supabase.rpc('draw_featured_match', { p_round_id: round.id }))}
          />
        )}
      </Panel>

      <section className="flex items-center gap-3 rounded-[20px] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
        <span className="text-muted">{Icon.clock}</span>
        <span className="flex-1">
          <span className="block font-semibold">Lock: {lockLabel(round.lock_at, ', ')}</span>
          {first && (
            <span className="block text-xs text-muted">
              {team(first.home_team_id).name} v {team(first.away_team_id).name} kick-off
            </span>
          )}
        </span>
      </section>

      {rejecting && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50"
          role="dialog"
          aria-label="Reject claim"
          onClick={() => setRejecting(null)}
        >
          <div
            className="open-in mx-auto flex w-full max-w-[480px] flex-col gap-3 rounded-t-3xl bg-navy-800 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="disp text-2xl font-extrabold">Reject {name(rejecting.player_id)}’s claim?</h2>
            <p className="text-sm text-muted">Only if the money isn’t on Revolut. They can claim again.</p>
            <button
              type="button"
              onClick={async () => {
                const c = rejecting
                setRejecting(null)
                await run(supabase.from('payments').delete().eq('id', c.id))
              }}
              className="press h-[50px] rounded-[14px] bg-out-text font-bold text-navy-900"
            >
              Reject claim
            </button>
            <button
              type="button"
              onClick={() => setRejecting(null)}
              className="press h-[50px] rounded-[14px] border border-white/16 font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Q1/Q2: when the fixtures are in, store the clean slate flag and show who's out with no teams left. */
function OpenBanner({ data, name, run }: Pick<Names, 'data' | 'name'> & { run: Run }) {
  const { round, prev } = data
  if (round.settled_at) return null
  let o: ReturnType<typeof E.openRound> | undefined
  let problem: string | undefined
  if (prev && !prev.settled_at) problem = `Settle ${prev.name} first.`
  else {
    try {
      o = E.openRound(data.history, toRound(round), data.matches.map(toMatch))
    } catch (e) {
      problem = (e as Error).message
    }
  }
  if (o && !o.cleanSlate && !o.noTeamsLeft.length && !round.clean_slate) return null
  return (
    <section className="flex flex-col gap-2 rounded-[20px] bg-warn/10 p-4 shadow-[inset_0_0_0_1px_rgba(255,179,92,.35)]">
      <p className="text-sm text-chalk">
        {problem ??
          (o!.cleanSlate
            ? 'Everyone still in has no team left: clean slate for all of them.'
            : o!.noTeamsLeft.length
              ? `Out, no teams left: ${o!.noTeamsLeft.map(name).join(', ')}.`
              : 'Everyone still in has a team to pick.')}
      </p>
      {o && o.cleanSlate !== round.clean_slate && (
        <button
          type="button"
          onClick={() => run(supabase.from('rounds').update({ clean_slate: o.cleanSlate }).eq('id', round.id))}
          className="press h-11 rounded-xl bg-gold font-bold text-navy-900"
        >
          Save: clean slate {o.cleanSlate ? 'on' : 'off'}
        </button>
      )}
    </section>
  )
}

// ---------- 2. Locked ----------

/** A team colour that shows on navy: the primary, unless it's too dark, then the secondary. */
function visible(t: Team) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  }
  return lum(t.primary) < 0.2 ? t.secondary : t.primary
}

function LockedStep({ data, name, team }: Names) {
  const { round } = data
  const picks = data.roundPicks
  const pickedIds = new Set(picks.map((p) => p.playerId))
  const paid = new Set(
    data.payments.filter((p) => p.kind === 'entry' && p.status === 'confirmed').map((p) => p.playerId),
  )
  const notIn = data.players
    .filter((p) => !pickedIds.has(p.id) || (round.number === 1 && !paid.has(p.id)))
    .map((p) => name(p.id))
  const counts = new Map<number, number>()
  for (const p of picks) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1)
  const spread = [...counts].sort((a, b) => b[1] - a[1] || team(a[0]).name.localeCompare(team(b[0]).name))
  const max = spread[0]?.[1] ?? 1
  const reveal =
    `LMS Round ${round.number} picks:\n` + picks.map((p) => `${name(p.playerId)}: ${team(p.teamId).name}`).join('\n')
  const locked = Date.now() >= Date.parse(round.lock_at)

  if (!locked)
    return (
      <p className="rounded-[20px] p-6 text-center text-muted shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
        Picks lock {lockLabel(round.lock_at)}. Nothing to see until then, admins included.
      </p>
    )
  return (
    <>
      <section className="stripes flex flex-col items-center gap-1.5 rounded-[20px] p-[18px] text-center">
        <span className="text-gold">{Icon.lock(30)}</span>
        <p className="disp text-[28px] font-extrabold">Picks locked at {hhmm(round.lock_at)}</p>
        <p className="text-[13px] opacity-85">
          {picks.length} picks in · {notIn.length ? `${notIn.join(', ')} not in` : 'everyone’s in'}
        </p>
      </section>
      <Panel title="How the picks fell">
        {spread.map(([tid, n]) => {
          const t = team(tid)
          return (
            <div key={tid} className="flex items-center gap-2.5">
              <Crest t={t} size={32} />
              <span className="w-[100px] truncate text-sm font-semibold">{t.name}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-[5px] bg-white/6">
                <span
                  className="block h-full rounded-[5px] transition-[width] duration-600"
                  style={{ width: `${(n / max) * 100}%`, background: visible(t) }}
                />
              </span>
              <span className="disp w-5 text-right text-lg font-extrabold">{n}</span>
            </div>
          )
        })}
        <p className="text-xs text-muted">
          Most picked decides buy-back burns. Ties broken by the stored random draw at settle.
        </p>
      </Panel>
      <CopyButton text={reveal} label="Copy the reveal for WhatsApp" done="Copied. Paste it in the group" gold />
    </>
  )
}

// ---------- 3. Results ----------

type MatchPatch = Pick<Match, 'status' | 'home_score' | 'away_score' | 'winner_team_id'>

function ResultsStep({
  data,
  team,
  onSaved,
  onDone,
}: Names & { onSaved: (id: number, patch: MatchPatch) => void; onDone: () => void }) {
  const done = data.matches.filter(hasResult).length
  const n = data.matches.length
  return (
    <>
      <div className="flex items-center gap-2.5">
        <h2 className="disp flex-1 text-[22px] font-extrabold">Results</h2>
        <span className={`text-[13px] font-semibold ${done === n ? 'text-in-text' : 'text-muted'}`}>
          Results in: {done}/{n}
        </span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-[3px] bg-white/8">
        <div
          className="h-full bg-gold transition-[width] duration-600"
          style={{ width: `${n ? (done / n) * 100 : 0}%` }}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {data.matches.map((m) => (
          <MatchCard
            key={m.id}
            m={m}
            home={team(m.home_team_id)}
            away={team(m.away_team_id)}
            knockout={data.round.stage !== 'pool'}
            locked={!!data.round.settled_at}
            onSaved={(patch) => onSaved(m.id, patch)}
          />
        ))}
      </ul>
      {data.round.settled_at && <p className="text-center text-xs text-muted">Settled. Unsettle to change a result.</p>}
      <button
        type="button"
        onClick={onDone}
        disabled={done < n}
        className="press h-[52px] rounded-[14px] bg-gold text-base font-extrabold text-navy-900 disabled:opacity-40"
      >
        {done < n ? `Preview settle once all ${n} are in` : 'Preview settle'}
      </button>
    </>
  )
}

const SEG = [
  ['completed', 'FT'],
  ['postponed', 'P-P'],
  ['abandoned', 'ABD'],
] as const

/** One match: FT | P-P | ABD + scores, autosaved on blur / status tap. */
function MatchCard({
  m,
  home,
  away,
  knockout,
  locked,
  onSaved,
}: {
  m: Match
  home: Team
  away: Team
  knockout: boolean
  locked: boolean
  onSaved: (patch: MatchPatch) => void
}) {
  const [status, setStatus] = useState(m.status)
  const [h, setH] = useState(m.home_score?.toString() ?? '')
  const [a, setA] = useState(m.away_score?.toString() ?? '')
  const [winner, setWinner] = useState(m.winner_team_id)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const timer = useRef<number>(undefined)
  const completed = status === 'completed'

  function save(next: { status: Match['status']; h: string; a: string; winner: number | null }) {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      const ft = next.status === 'completed'
      const [hs, as] = [Number(next.h), Number(next.a)]
      if (ft && (!/^\d+$/.test(next.h) || !/^\d+$/.test(next.a))) return // wait for both scores
      // Knockouts: once level-or-not is known, the team going through is filled in (or required when level).
      const w = ft && knockout ? (hs === as ? next.winner : hs > as ? m.home_team_id : m.away_team_id) : null
      if (ft && knockout && hs === as && !w) return setProblem('Level: pick who went through.')
      if (ft && knockout && hs !== as && next.winner && next.winner !== w)
        return setProblem('The winner must be the team with the higher score.')
      setProblem(null)
      const patch = { status: next.status, home_score: ft ? hs : null, away_score: ft ? as : null, winner_team_id: w }
      setState('saving')
      const { error } = await supabase.from('matches').update(patch).eq('id', m.id)
      if (error) {
        setState('error')
        setProblem(error.message)
      } else {
        setState('saved')
        if (w !== next.winner) setWinner(w)
        onSaved(patch)
      }
    }, 350)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const complete = status === 'postponed' || status === 'abandoned' || (completed && /^\d+$/.test(h) && /^\d+$/.test(a))
  const input =
    'disp h-11 w-11 rounded-xl border border-white/14 bg-navy-900 text-center text-[22px] font-extrabold outline-none transition-[border-color,box-shadow] focus:border-gold focus:shadow-[0_0_0_3px_rgba(242,178,38,.25)] disabled:opacity-35'
  const side = (t: Team, right?: boolean) => (
    <span className={`flex min-w-0 items-center gap-1.5 ${right ? 'justify-end' : ''}`}>
      {right && <span className="truncate text-right text-[13px] font-semibold">{t.name}</span>}
      <img src={crestUrl(t)} alt="" className="h-[26px] w-[26px] shrink-0 rounded-full bg-white object-contain p-0.5" />
      {!right && <span className="truncate text-[13px] font-semibold">{t.name}</span>}
    </span>
  )
  return (
    <li
      className="flex flex-col gap-2 rounded-2xl bg-navy-800 px-3 py-2.5 transition-shadow duration-300"
      style={{ boxShadow: `inset 0 0 0 1px ${complete ? 'rgba(60,207,122,.55)' : 'rgba(255,255,255,.06)'}` }}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11px] font-bold text-muted">
          {lockLabel(m.kickoff_at)}
          <span className="ml-2" aria-live="polite">
            {state === 'saving' && 'saving…'}
            {state === 'saved' && <span className="text-in-text">✓ saved</span>}
          </span>
        </span>
        {SEG.map(([s, label]) => (
          <button
            key={s}
            type="button"
            disabled={locked}
            aria-pressed={status === s}
            onClick={() => {
              const next = status === s ? 'scheduled' : s
              setStatus(next)
              save({ status: next, h, a, winner })
            }}
            className={`press h-7 rounded-lg px-2.5 text-[11px] font-extrabold ${status === s ? 'bg-gold text-navy-900' : 'bg-white/7 text-chalk-2'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_44px_10px_44px_minmax(0,1fr)] items-center gap-1.5">
        {side(home)}
        <input
          className={input}
          inputMode="numeric"
          aria-label={`${home.name} score`}
          value={h}
          disabled={locked || !completed}
          onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={() => save({ status, h, a, winner })}
        />
        <span className="text-center text-muted">–</span>
        <input
          className={input}
          inputMode="numeric"
          aria-label={`${away.name} score`}
          value={a}
          disabled={locked || !completed}
          onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={() => save({ status, h, a, winner })}
        />
        {side(away, true)}
      </div>
      {knockout && completed && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-muted">Went through</span>
          {[home, away].map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={locked}
              aria-pressed={winner === t.id}
              onClick={() => {
                setWinner(t.id)
                save({ status, h, a, winner: t.id })
              }}
              className={`press h-8 flex-1 truncate rounded-lg px-2 font-bold ${winner === t.id ? 'bg-gold text-navy-900' : 'bg-white/7'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {problem && <p className="text-xs font-semibold text-out-text">{problem}</p>}
    </li>
  )
}

// ---------- 4. Settle ----------

const CHIP: Record<E.Outcome, [string, string, string]> = {
  through: ['THROUGH', 'rgba(60,207,122,.16)', '#6fe3a1'],
  out: ['OUT', 'rgba(255,138,138,.16)', '#ff8a8a'],
  survived_postponed: ['SURVIVES (P-P)', 'rgba(94,154,211,.18)', '#9cc3ec'],
  clean_slate: ['CLEAN SLATE', 'rgba(242,178,38,.16)', '#f2b226'],
  reinstated: ['BACK IN', 'rgba(242,178,38,.16)', '#f2b226'],
  already_out: ['ALREADY OUT', 'rgba(255,255,255,.06)', '#a8b3d1'],
}

function detail(data: Data, team: (id: number) => Team, pick: E.Pick | undefined, paid: boolean) {
  if (!pick) return 'No pick'
  const t = team(pick.teamId)
  const m = data.matches.find((m) => m.home_team_id === pick.teamId || m.away_team_id === pick.teamId)
  const tag = pick.isAuto ? ' (auto)' : pick.isResurrection ? ' (resurrection)' : ''
  if (!m) return t.name + tag
  if (m.status === 'postponed' || m.status === 'abandoned') return `${t.name}${tag} · ${m.status}, team back`
  if (m.home_score === null || m.away_score === null) return `${t.name}${tag} · no result yet`
  const home = m.home_team_id === pick.teamId
  const [us, them] = home ? [m.home_score, m.away_score] : [m.away_score, m.home_score]
  const where = home ? 'home' : 'away'
  const res =
    us > them
      ? `won ${us}–${them} ${where}`
      : us < them
        ? `lost ${us}–${them} ${where}`
        : data.round.stage === 'pool'
          ? `drew ${us}–${them} (a draw is a loss)`
          : `drew ${us}–${them}, ${m.winner_team_id === pick.teamId ? 'went through' : 'went out'}`
  return `${t.name}${tag} · ${res}${!paid && data.round.number === 1 ? ' · not paid' : ''}`
}

function Outcomes({
  data,
  name,
  team,
  results,
  burns,
  burnOrder,
}: Names & { results: E.RoundResult[]; burns: E.BurnedTeam[]; burnOrder: number[] }) {
  const paid = new Set(
    data.payments.filter((p) => p.kind === 'entry' && p.status === 'confirmed').map((p) => p.playerId),
  )
  return (
    <>
      <ul className="hairline overflow-hidden rounded-[18px] bg-navy-800">
        {results.map((r) => {
          const pick = data.roundPicks.find((p) => p.playerId === r.playerId)
          const [label, bg, fg] = CHIP[r.outcome]
          return (
            <li
              key={r.playerId}
              className="flex items-center gap-2.5 border-t border-white/6 px-3.5 py-[11px] first:border-0"
            >
              {pick ? (
                <Crest t={team(pick.teamId)} size={30} />
              ) : (
                <span className="h-[30px] w-[30px] shrink-0 rounded-full border border-dashed border-white/25" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{name(r.playerId)}</span>
                <span className="block truncate text-xs text-muted">
                  {detail(data, team, pick, paid.has(r.playerId))}
                  {r.predictionPoints > 0 &&
                    ` · ${r.predictionPoints} pt${r.predictionPoints > 1 ? 's' : ''}${r.exactScore ? ' ★' : ''}`}
                  {r.jinxPoints > 0 && ` · jinx +${r.jinxPoints}`}
                </span>
              </span>
              <span
                className="shrink-0 rounded-full px-[9px] py-1 text-[11px] font-extrabold"
                style={{ background: bg, color: fg }}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ul>
      {burns.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-chalk-2">
          {burns.map((b) => (
            <li key={`${b.playerId}-${b.teamId}`}>
              {name(b.playerId)} loses {team(b.teamId).name} (
              {b.reason === 'buyback_penalty' ? 'buy-back' : 'resurrection'})
            </li>
          ))}
        </ul>
      )}
      {burnOrder.length > 0 && (
        <p className="text-xs text-muted">Burn order: {burnOrder.map((t) => team(t).name).join(' › ')}</p>
      )}
    </>
  )
}

function SettleStep({
  data,
  name,
  team,
  number,
  reload,
  notify,
}: Names & { number: number; reload: () => Promise<void>; notify: (msg: string | null) => void }) {
  const { round } = data
  // One tiebreak draw per visit to this step (the component remounts on each visit and on settle/unsettle).
  const [first] = useState(() => {
    if (round.settled_at) return { preview: null, error: null }
    try {
      // UI only; settle_round checks the server clock.
      if (Date.now() < Date.parse(round.lock_at)) throw new Error('Picks are still open. Settle after the lock.')
      return { preview: runEngine(data, shuffle([...data.teams.keys()])), error: null }
    } catch (e) {
      return { preview: null, error: (e as Error).message }
    }
  })
  const preview: Preview | null = first.preview
  const [error, setError] = useState<string | null>(first.error)
  const [busy, setBusy] = useState(false)

  async function settle(p: Preview) {
    setBusy(true)
    setError(null)
    try {
      // Re-run on fresh data with the same draw: if anything changed since the preview, stop.
      const fresh = await load(number)
      if (!fresh || JSON.stringify(runEngine(fresh, p.draw)) !== JSON.stringify(p))
        throw new Error('Something changed since the preview. Go back a step and preview again.')
      must(await supabase.rpc('settle_round', settleArgs(round.id, p)))
      sfx.fullTime()
      notify(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function unsettle() {
    const { data: res, error } = await supabase.rpc('unsettle_round', { p_round_id: round.id })
    if (error) return setError(error.message)
    const { picks, jinxes } = res as { picks: number; jinxes: number }
    notify(
      picks || jinxes
        ? `Unsettled. Cleared ${picks} pick(s) and ${jinxes} jinx(es) for the next round: tell the group to pick again.`
        : 'Unsettled. Fix the result, then settle again.',
    )
    await reload()
  }

  if (round.settled_at) {
    const results = data.roundResults.map(toResult)
    const through = results.filter((r) =>
      ['through', 'survived_postponed', 'clean_slate', 'reinstated'].includes(r.outcome),
    )
    const out = results.filter((r) => r.outcome === 'out')
    const resultsText =
      `LMS Round ${round.number} results:\nThrough (${through.length}): ${through.map((r) => name(r.playerId)).join(', ') || 'nobody'}\n` +
      `Out (${out.length}): ${out.map((r) => name(r.playerId)).join(', ') || 'nobody'}`
    return (
      <>
        <section className="stripes boom flex flex-col items-center gap-2 rounded-3xl px-[18px] py-7 text-center">
          <span className="text-gold">{Icon.check(44, 2.2)}</span>
          <p className="disp text-[34px] leading-none font-extrabold">{round.name} settled</p>
          <p className="text-sm opacity-85">
            {through.length} through · {out.length} out · Round {round.number + 1} is open
          </p>
        </section>
        <CopyButton text={resultsText} label="Copy results for WhatsApp" done="Copied. Paste it in the group" gold />
        <Outcomes
          data={data}
          name={name}
          team={team}
          results={results}
          burns={data.roundBurns.map((b) => ({
            playerId: b.player_id,
            teamId: b.team_id,
            roundId: b.round_id,
            reason: b.reason,
          }))}
          burnOrder={round.tiebreak ? E.burnOrder(data.roundPicks, round.tiebreak) : []}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-out-text/15 p-3 text-out-text">
            {error}
          </p>
        )}
        <HoldButton label="Unsettle (fix a result)" danger onDone={unsettle} />
      </>
    )
  }

  const throughN = preview?.roundResults.filter((r) => r.outcome !== 'out' && r.outcome !== 'already_out').length ?? 0
  const outN = preview?.roundResults.filter((r) => r.outcome === 'out').length ?? 0
  return (
    <>
      <h2 className="disp text-[22px] font-extrabold">Settle preview</h2>
      {error && (
        <p role="alert" className="rounded-2xl bg-out-text/15 p-3 text-out-text">
          {error}
        </p>
      )}
      {preview && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-in/12 p-3">
              <p className="disp text-[32px] font-extrabold text-in-text">{throughN}</p>
              <p className="text-xs text-chalk-2">through to Round {round.number + 1}</p>
            </div>
            <div className="rounded-2xl bg-[rgba(229,72,77,.14)] p-3">
              <p className="disp text-[32px] font-extrabold text-out-text">{outN}</p>
              <p className="text-xs text-chalk-2">out</p>
            </div>
          </div>
          {preview.winners && (
            <p className="pop rounded-2xl bg-gold p-3 text-center font-extrabold text-navy-900">
              Winner{preview.winners.length > 1 ? 's (split)' : ''}: {preview.winners.map(name).join(', ')}
            </p>
          )}
          <Outcomes
            data={data}
            name={name}
            team={team}
            results={preview.roundResults}
            burns={preview.newBurnedTeams}
            burnOrder={preview.burnOrder}
          />
          <NotCounted data={data} name={name} preview={preview} reload={reload} />
          <p className="text-xs text-muted">
            Featured match points are written at the same time. Settle checks every picked team’s match has a result.
          </p>
          <HoldButton
            label={busy ? 'Settling…' : `Hold to settle ${round.name}`}
            disabled={busy}
            onDone={() => settle(preview)}
          />
        </>
      )}
    </>
  )
}

/** §22: before the Round 1 settle, who won't count and why, so nobody is dropped by accident. */
function NotCounted({
  data,
  name,
  preview,
  reload,
}: Pick<Names, 'data' | 'name'> & { preview: Preview; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const rows = notCounted(data, preview)
  if (!rows.length) return null
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-warn/10 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,179,92,.35)]">
      <p className="font-bold text-warn">
        Not counted: {rows.map((r) => `${name(r.playerId)} (${r.reason})`).join(', ')}
      </p>
      {rows
        .filter((r) => r.claim)
        .map((r) => (
          <div key={r.playerId} className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 text-sm text-chalk-2">
              {name(r.playerId)} says they’ve paid · check Revolut
            </span>
            <button
              type="button"
              onClick={async () => {
                setError(null)
                sfx.confirmPayment()
                const { error } = await supabase.rpc('confirm_payment', { p_id: r.claim!.id })
                if (error) setError(error.message)
                await reload()
              }}
              className="press h-10 shrink-0 rounded-xl bg-gold px-3.5 font-extrabold text-navy-900"
            >
              Confirm
            </button>
          </div>
        ))}
      {rows.some((r) => r.reason === 'not paid') && (
        <p className="text-xs text-muted">Paid but never claimed? Mark them paid on the Open step.</p>
      )}
      {error && <p className="text-sm text-out-text">{error}</p>}
    </section>
  )
}
