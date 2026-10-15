import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import Jersey from './Jersey'
import { cardStyle, crestUrl, irishTime, type Match, type Team } from './lib/supabase'

/** iPhones only do a tick (hidden-switch trick, user taps only); 3 quick ticks = a thud. */
export function useThud() {
  const { vibrate } = useHaptic({ hapticDuration: 30 })
  return () => {
    vibrate()
    setTimeout(vibrate, 70)
    setTimeout(vibrate, 140)
  }
}

export function FixtureList({
  matches,
  teams,
  used,
  picked,
  onPick,
}: {
  matches: Match[]
  teams: Map<number, Team>
  used: Map<number, number>
  picked?: number
  onPick: (teamId: number) => void
}) {
  return (
    <ul className="flex flex-col gap-3">
      {matches.map((m) => (
        <li key={m.id}>
          <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase">{irishTime(m.kickoff_at)}</p>
          <div className="flex items-stretch gap-2">
            {[m.home_team_id, m.away_team_id].map((tid, i) => {
              const t = teams.get(tid)!
              const usedIn = used.get(tid)
              const chosen = picked === tid
              return (
                <button
                  key={tid}
                  disabled={usedIn !== undefined}
                  onClick={() => onPick(tid)}
                  aria-pressed={chosen}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl p-3 text-center transition active:scale-95 disabled:opacity-30 disabled:grayscale ${chosen ? 'ring-4 ring-amber-400 ring-offset-2' : ''}`}
                  style={cardStyle(t)}
                >
                  {chosen && (
                    <span className="absolute -top-2 rounded-full bg-amber-400 px-2 text-[10px] font-bold text-black">
                      YOUR PICK
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <img src={crestUrl(t)} alt="" className="h-12 w-12 object-contain" />
                    <Jersey kit={t.kit} size={40} label={t.name} />
                  </div>
                  <span className="w-full truncate font-semibold">{t.name}</span>
                  <span className="text-xs opacity-75">
                    {i === 0 ? 'Home' : 'Away'}
                    {usedIn !== undefined && ` · used R${usedIn}`}
                  </span>
                </button>
              )
            })}
          </div>
        </li>
      ))}
    </ul>
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

  const stripe = team?.kit.colours[1] ?? team?.secondary
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
            <Jersey kit={team.kit} size={90} label={team.name} />
            <p className="mt-2 text-3xl font-black tracking-tight uppercase">{team.name}</p>
            <p className="text-sm opacity-80">Your pick. Change it any time before the lock.</p>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
