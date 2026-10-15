import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import { crestUrl, type Match, type Team } from './lib/supabase'
import { matchState, won } from './live'
import { sfx } from './sound'

/** iPhones only do a tick (hidden-switch trick, user taps only); 3 quick ticks = a thud. */
export function useThud() {
  const { vibrate } = useHaptic({ hapticDuration: 30 })
  return () => {
    vibrate()
    setTimeout(vibrate, 70)
    setTimeout(vibrate, 140)
  }
}

const day = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})
const hhmm = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit' })

/** The round's fixtures grouped by day (§3.3). Badges sit inside each card so nothing overlaps the time row. */
export function FixtureList({
  matches,
  teams,
  used,
  burned,
  picked,
  featuredId,
  locked,
  knockout = false,
  now = Date.now(),
  onPick,
}: {
  matches: Match[]
  teams: Map<number, Team>
  used: Map<number, number>
  burned?: Set<number> // §23: pending buy-back burns
  picked?: number
  featuredId: number | null
  locked: boolean
  knockout?: boolean
  now?: number
  onPick?: (teamId: number) => void
}) {
  const days = new Map<string, Match[]>()
  for (const m of matches) {
    const d = day.format(new Date(m.kickoff_at)).replace(',', '')
    days.set(d, [...(days.get(d) ?? []), m])
  }
  return (
    <section className="flex flex-col gap-3.5">
      {[...days].map(([label, ms]) => (
        <div key={label} className="flex flex-col gap-2.5">
          <h2 className="disp mt-1.5 text-[15px] font-bold tracking-[.14em] text-muted uppercase">{label}</h2>
          {ms.map((m) => {
            const state = matchState(m, now)
            const final = state === 'final'
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  {hhmm.format(new Date(m.kickoff_at))}
                  {state === 'live' && (
                    <span className="flex items-center gap-[5px] rounded-full bg-[#e5484d] px-2 py-0.5 text-[10px] font-extrabold tracking-[.08em] text-white">
                      <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
                      LIVE
                    </span>
                  )}
                  {(final || state === 'off') && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-extrabold tracking-[.08em] text-chalk-2">
                      {final ? 'FULL TIME' : m.status === 'postponed' ? 'POSTPONED' : 'ABANDONED'}
                    </span>
                  )}
                  {m.id === featuredId && (
                    <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold tracking-[.08em] text-navy-900">
                      FEATURED
                    </span>
                  )}
                </p>
                <div
                  className={`grid items-center transition-[grid-template-columns] duration-300 ${final ? 'grid-cols-[minmax(0,1fr)_46px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)]'}`}
                >
                  {[m.home_team_id, null, m.away_team_id].map((tid, i) =>
                    tid === null ? (
                      final ? (
                        <span
                          key="v"
                          aria-label={`${m.home_score}–${m.away_score}`}
                          className="disp pop flex flex-col items-center text-[22px] leading-[1.05] font-extrabold tabular-nums"
                        >
                          <span>{m.home_score}</span>
                          <span aria-hidden className="text-sm text-muted">
                            –
                          </span>
                          <span>{m.away_score}</span>
                        </span>
                      ) : (
                        <span key="v" className="disp text-center text-sm font-extrabold text-gold">
                          v
                        </span>
                      )
                    ) : (
                      <TeamCard
                        key={tid}
                        team={teams.get(tid)!}
                        home={i === 0}
                        usedIn={used.get(tid)}
                        burned={burned?.has(tid)}
                        picked={picked === tid}
                        dim={picked !== undefined && picked !== tid}
                        lost={final && !won(m, tid, knockout) && (knockout || m.home_score !== m.away_score)}
                        disabled={locked || !onPick}
                        onPick={() => onPick?.(tid)}
                      />
                    ),
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

function TeamCard({
  team: t,
  home,
  usedIn,
  burned,
  picked,
  dim,
  lost,
  disabled,
  onPick,
}: {
  team: Team
  home: boolean
  usedIn?: number
  burned?: boolean
  picked: boolean
  dim: boolean
  lost: boolean
  disabled: boolean
  onPick: () => void
}) {
  const side = home ? 'home' : 'away'
  const gone = usedIn !== undefined || burned
  return (
    <button
      type="button"
      disabled={disabled || gone}
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`${picked ? 'Your pick' : 'Pick'}: ${t.name} (${side})${burned ? ', burned' : usedIn !== undefined ? `, used in round ${usedIn}` : ''}`}
      className={`card flex h-[118px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] p-2 ${picked ? 'picked' : lost ? 'lost' : dim ? 'dim' : ''} ${gone ? 'opacity-30 grayscale' : ''}`}
      style={{ background: t.card_bg, color: t.card_text }}
    >
      {picked && (
        <span className="pop absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-navy-900 shadow-[0_2px_8px_rgba(0,0,0,.3)]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}
      <img src={crestUrl(t)} alt="" className="h-12 w-12 object-contain" />
      <span
        className={`disp max-w-full truncate text-[19px] leading-[1.05] font-extrabold ${burned ? 'line-through' : ''}`}
      >
        {t.name}
      </span>
      <span className="text-[11px] font-semibold opacity-75">
        {home ? 'Home' : 'Away'}
        {burned ? ' · burned' : usedIn !== undefined && ` · used R${usedIn}`}
      </span>
    </button>
  )
}

/**
 * Team takeover (docs/UI-REDESIGN.md §4): colours wipe in, kit stripes sweep, confetti bursts, crest drops, name
 * slams. CSS keyframes in index.css. Auto-dismiss at 1.5 s, tap to skip; reduced motion → a still frame for .8 s.
 */
export function Takeover({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const still = useReducedMotion()
  useEffect(() => {
    if (!team) return
    const id = setTimeout(onDone, still ? 800 : 1500)
    return () => clearTimeout(id)
  }, [team, still, onDone])
  if (!team) return null

  const colours =
    team.secondary.toLowerCase() === '#ffffff' ? ['#ffffff', '#f2b226'] : [team.secondary, '#ffffff', '#f2b226']
  return (
    <button
      type="button"
      key={team.id}
      onClick={onDone}
      aria-label={`You picked ${team.name}. Tap to continue.`}
      className="tk fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-hidden"
      style={{ background: team.primary, color: team.text }}
    >
      {[20, 44, 68].map((top, i) => (
        <span
          key={top}
          aria-hidden
          className="tk-stripe absolute -left-1/2 h-[70px] w-[200%] opacity-45"
          style={{ top: `${top}%`, background: team.secondary, animationDelay: `${i * 0.08}s` }}
        />
      ))}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        const r = 150 + (i % 3) * 40
        return (
          <span
            key={i}
            aria-hidden
            className="confetti absolute top-[46%] left-1/2 h-4 w-2.5 rounded-[2px]"
            style={
              {
                background: colours[i % colours.length],
                '--to': `translate(${Math.round(Math.cos(a) * r)}px,${Math.round(Math.sin(a) * r)}px) rotate(${i * 47}deg)`,
              } as CSSProperties
            }
          />
        )
      })}
      <span className="tk-shake relative flex flex-col items-center gap-[18px]">
        <span className="tk-crest flex h-[168px] w-[168px] items-center justify-center rounded-full bg-white shadow-[0_24px_60px_rgba(0,0,0,.4)]">
          <img src={crestUrl(team)} alt="" className="h-[124px] w-[124px] object-contain" />
        </span>
        <span className="tk-name disp px-5 text-center text-[52px] leading-[.95] font-extrabold tracking-[-.01em] uppercase">
          {team.name}
        </span>
      </span>
      <span className="tk-sub relative text-[15px] font-semibold">Your pick. Change it any time before the lock.</span>
    </button>
  )
}

const wkHhmm = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Pick confirmation sheet (docs/UI-REDESIGN.md §18 / §21). Nothing is saved (or cleared) until the 0.6 s hold
 * completes; "Pick another" / "Keep {team}", the backdrop, Esc or a swipe down close it with no write.
 */
export function PickSheet({
  team,
  match,
  teams,
  current,
  lastUnused,
  locked,
  round1,
  onCancel,
  onConfirm,
  onRemove,
}: {
  team: Team
  match: Match
  teams: Map<number, Team>
  current?: Team
  lastUnused: boolean
  locked: boolean
  round1: boolean
  onCancel: () => void
  onConfirm: () => void
  onRemove: () => void
}) {
  const HOLD_MS = 600 // §18: friction, so reduced motion keeps it too
  const { vibrate } = useHaptic({ hapticDuration: 30 })
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(false)
  const holdAt = useRef(0)
  const holdTimer = useRef<number>(undefined)
  const hintTimer = useRef<number>(undefined)
  const swipeY = useRef<number | null>(null)
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current)
      clearTimeout(hintTimer.current)
    },
    [],
  )
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onCancel])
  useEffect(() => {
    if (locked) {
      clearTimeout(holdTimer.current)
      setHolding(false)
    }
  }, [locked])

  const start = (remove: boolean) => {
    if (holding || locked) return
    vibrate() // light tick from the touch itself (§7: haptics only inside a user tap)
    if (!remove) sfx.unlock() // §21: remove has no sound
    holdAt.current = Date.now()
    clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      setHolding(false)
      if (remove) onRemove()
      else onConfirm()
    }, HOLD_MS)
    setHolding(true)
    setHint(false)
  }
  const end = () => {
    if (!holding) return
    clearTimeout(holdTimer.current)
    const early = Date.now() - holdAt.current < HOLD_MS
    setHolding(false)
    setHint(early)
    clearTimeout(hintTimer.current)
    if (early) hintTimer.current = window.setTimeout(() => setHint(false), 1800)
  }

  const swap = current && current.id !== team.id ? current : undefined
  const removing = current?.id === team.id // tapped your own pick: take it back (Eddie, 15 Oct)
  const home = match.home_team_id === team.id
  const [wk, time] = wkHhmm.format(new Date(match.kickoff_at)).split(' ')
  const fixture = `${teams.get(match.home_team_id)?.name} v ${teams.get(match.away_team_id)?.name} · ${wk.replace(',', '')} ${time} · ${home ? 'Home' : 'Away'}`
  const label = locked
    ? 'Picks are locked'
    : holding
      ? 'Keep holding…'
      : removing
        ? `Hold to remove ${team.name}`
        : `Hold to back ${team.name}`

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={removing ? `Keep ${team.name}` : 'Pick another'}
        onClick={onCancel}
        className="backdrop absolute inset-0 cursor-pointer bg-[rgba(3,7,24,.66)]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={removing ? 'Remove your pick' : swap ? 'Swap your pick' : `Back ${team.name}`}
        onTouchStart={(e) => (swipeY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (swipeY.current !== null && e.changedTouches[0].clientY - swipeY.current > 80) onCancel()
          swipeY.current = null
        }}
        className={`${removing ? '' : 'sheet '}absolute inset-x-0 bottom-0 mx-auto max-w-[480px] overflow-hidden rounded-t-[28px] bg-navy-800 shadow-[0_-20px_60px_rgba(0,0,0,.45)]`}
      >
        <div className="relative h-28 overflow-hidden" style={{ background: team.primary }}>
          <span
            aria-hidden
            className="absolute top-[30px] -left-[20%] h-10 w-[140%] -rotate-[8deg] opacity-35"
            style={{ background: team.secondary }}
          />
          <span aria-hidden className="absolute top-2.5 left-1/2 -ml-5 h-[5px] w-10 rounded-[3px] bg-white/50" />
        </div>
        <div className="relative -mt-[52px] flex flex-col items-center gap-1.5 px-[22px] pb-[calc(26px+env(safe-area-inset-bottom))] text-center">
          <span
            className={`${removing ? '' : 'sheet-crest '}flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-[0_14px_34px_rgba(0,0,0,.35)]`}
          >
            <img src={crestUrl(team)} alt="" className="h-[70px] w-[70px] object-contain" />
          </span>
          <span className="disp mt-2 text-[13px] font-bold tracking-[.2em] text-gold">
            {removing ? 'YOUR PICK' : swap ? 'CHANGE YOUR PICK?' : 'BACK THIS TEAM?'}
          </span>
          <span className="disp text-[34px] leading-[.95] font-extrabold">
            {removing ? `Remove ${team.name}?` : swap ? `Swap ${swap.name} for ${team.name}?` : team.name}
          </span>
          <span className="text-sm text-muted">{fixture}</span>

          <div className="mt-3.5 mb-1.5 flex w-full flex-col gap-2 text-left">
            <span className="flex items-start gap-2.5 rounded-[14px] bg-[rgba(255,178,62,.1)] px-3.5 py-3 text-sm leading-[1.35] font-semibold text-[#ffcf7a]">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="mt-px shrink-0"
              >
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <span>
                {removing
                  ? round1
                    ? 'No pick in Round 1 means no entry. Pick again before the lock.'
                    : 'No pick by the lock gets you a random team you haven’t used.'
                  : `You can only use ${team.name} once all season.${lastUnused ? ' It’s your last unused team.' : ''}`}
              </span>
            </span>
            {swap && (
              <span className="flex items-center gap-2.5 rounded-[14px] bg-white/[.06] px-3.5 py-2.5 text-sm text-[#d7dcec]">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white">
                  <img src={crestUrl(swap)} alt="" className="h-[19px] w-[19px] object-contain" />
                </span>
                {swap.name} goes back in your pool.
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={locked}
            onPointerDown={(e) => {
              e.preventDefault()
              start(removing)
            }}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return
              e.preventDefault()
              if (!e.repeat) start(removing)
            }}
            onKeyUp={(e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return
              e.preventDefault()
              end()
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={label}
            className={`relative h-14 w-full cursor-pointer touch-none overflow-hidden rounded-2xl select-none [-webkit-touch-callout:none] disabled:cursor-default disabled:opacity-40 ${
              removing
                ? 'bg-[rgba(229,72,77,.2)] text-white shadow-[inset_0_0_0_1px_rgba(255,138,138,.55)]'
                : `hold-btn bg-[rgba(242,178,38,.22)] text-navy-900 ${holding ? 'holding' : ''}`
            }`}
          >
            {!removing && <span aria-hidden className="absolute inset-0 bg-gold opacity-55" />}
            {holding && (
              <span
                aria-hidden
                className={`hold-fill absolute inset-0 origin-left ${removing ? 'bg-[#e5484d]' : 'bg-gold'}`}
                style={{ animationDuration: `${HOLD_MS}ms`, '--hold': `${HOLD_MS}ms` } as CSSProperties}
              />
            )}
            <span className="disp relative flex items-center justify-center gap-2 text-xl font-extrabold tracking-[.02em]">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 11V6a2 2 0 0 1 4 0v5" />
                <path d="M13 10.5V9a2 2 0 0 1 4 0v4.5" />
                <path d="M17 12a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L4 16a2 2 0 0 1 3.2-2.4L9 15.5V11" />
              </svg>
              {label}
            </span>
          </button>
          {hint && (
            <span className={`${removing ? '' : 'nudge '}text-[13px] font-semibold text-[#ffcf7a]`}>
              Keep holding to {removing ? 'remove' : 'confirm'}
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="press mt-2 h-[50px] w-full rounded-2xl border border-white/[.18] text-base font-bold text-chalk"
          >
            {removing ? `Keep ${team.name}` : 'Pick another'}
          </button>
        </div>
      </section>
    </div>
  )
}
