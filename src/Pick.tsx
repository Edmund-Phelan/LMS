import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import { crestUrl, type Match, type Team } from './lib/supabase'

/** iPhones only do a tick (hidden-switch trick, user taps only); 3 quick ticks = a thud. */
export function useThud() {
  const { vibrate } = useHaptic({ hapticDuration: 30 })
  return () => {
    vibrate()
    setTimeout(vibrate, 70)
    setTimeout(vibrate, 140)
  }
}

const day = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'short' })
const hhmm = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit' })

/** The round's fixtures grouped by day (§3.3). Badges sit inside each card so nothing overlaps the time row. */
export function FixtureList({
  matches,
  teams,
  used,
  picked,
  featuredId,
  locked,
  onPick,
}: {
  matches: Match[]
  teams: Map<number, Team>
  used: Map<number, number>
  picked?: number
  featuredId: number | null
  locked: boolean
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
          {ms.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                {hhmm.format(new Date(m.kickoff_at))}
                {m.id === featuredId && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold tracking-[.08em] text-navy-900">
                    FEATURED
                  </span>
                )}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-center">
                {[m.home_team_id, null, m.away_team_id].map((tid, i) =>
                  tid === null ? (
                    <span key="v" className="disp text-center text-sm font-extrabold text-gold">
                      v
                    </span>
                  ) : (
                    <TeamCard
                      key={tid}
                      team={teams.get(tid)!}
                      home={i === 0}
                      usedIn={used.get(tid)}
                      picked={picked === tid}
                      dim={picked !== undefined && picked !== tid}
                      disabled={locked || !onPick}
                      onPick={() => onPick?.(tid)}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
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
  disabled,
  onPick,
}: {
  team: Team
  home: boolean
  usedIn?: number
  picked: boolean
  dim: boolean
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
      className={`card flex h-[118px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] p-2 ${picked ? 'picked' : dim ? 'dim' : ''} ${usedIn !== undefined ? 'opacity-30 grayscale' : ''}`}
      style={{ background: t.card_bg, color: t.card_text }}
    >
      {picked && (
        <span className="pop absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-navy-900 shadow-[0_2px_8px_rgba(0,0,0,.3)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
 * Team takeover (CLAUDE.md §7): the team's colours flood the screen, kit stripes wipe across, crest drops in.
 * Under 1.5 s, tap to skip; reduced motion → a still frame.
 */
export function Takeover({ team, onDone }: { team: Team | null; onDone: () => void }) {
  const still = useReducedMotion()
  useEffect(() => {
    if (!team) return
    const id = setTimeout(onDone, still ? 800 : 1400)
    return () => clearTimeout(id)
  }, [team, still, onDone])

  const stripe = team?.secondary
  return (
    <AnimatePresence>
      {team && (
        <motion.button
          key={team.id}
          aria-label={`You picked ${team.name}. Tap to continue.`}
          onClick={onDone}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-hidden"
          style={{ background: team.primary, color: team.text }}
          initial={still ? false : { clipPath: 'circle(0% at 50% 50%)' }}
          animate={{ clipPath: 'circle(150% at 50% 50%)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {!still &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute h-16 w-[200%] -rotate-12"
                style={{ background: stripe, top: `${25 + i * 22}%`, opacity: 0.5 }}
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: 'easeInOut' }}
              />
            ))}
          <motion.div
            className="relative rounded-full bg-white p-4 shadow-2xl"
            initial={still ? false : { y: -400, scale: 1.4 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.25 }}
          >
            <img src={crestUrl(team)} alt="" className="h-32 w-32 object-contain" />
          </motion.div>
          <motion.div
            className="relative flex flex-col items-center"
            initial={still ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="mt-2 text-3xl font-black tracking-tight uppercase">{team.name}</p>
            <p className="text-sm opacity-80">Your pick. Change it any time before the lock.</p>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
