import { useEffect, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import { crestUrl, type Match, type Team } from './lib/supabase'
import { matchState, won } from './live'

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
  picked,
  dim,
  lost,
  disabled,
  onPick,
}: {
  team: Team
  home: boolean
  usedIn?: number
  picked: boolean
  dim: boolean
  lost: boolean
  disabled: boolean
  onPick: () => void
}) {
  const side = home ? 'home' : 'away'
  return (
    <button
      type="button"
      disabled={disabled || usedIn !== undefined}
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`${picked ? 'Your pick' : 'Pick'}: ${t.name} (${side})${usedIn !== undefined ? `, used in round ${usedIn}` : ''}`}
      className={`card flex h-[118px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] p-2 ${picked ? 'picked' : lost ? 'lost' : dim ? 'dim' : ''} ${usedIn !== undefined ? 'opacity-30 grayscale' : ''}`}
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
      <span className="disp max-w-full truncate text-[19px] leading-[1.05] font-extrabold">{t.name}</span>
      <span className="text-[11px] font-semibold opacity-75">
        {home ? 'Home' : 'Away'}
        {usedIn !== undefined && ` · used R${usedIn}`}
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
