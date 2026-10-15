import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import { crestUrl, type Match, type Team } from './lib/supabase'

// Featured-match raffle reveal (NEXT.md packet 4): theatre over the draw already stored on the round.
// The client never picks. Sealed card → tap → crests shuffle with ticks → land on the drawn match.
// Under 1.5 s, tap again to skip; reduced motion goes straight to the result.

const seenKey = (roundId: number) => `raffle-seen-${roundId}`
function seen(roundId: number) {
  try {
    return localStorage.getItem(seenKey(roundId)) === '1'
  } catch {
    return false
  }
}

export default function Raffle({
  roundId,
  featured,
  matches,
  teams,
  children,
}: {
  roundId: number
  featured: Match
  matches: Match[]
  teams: Map<number, Team>
  /** Shown once the raffle is open (the prediction form names the match). */
  children?: ReactNode
}) {
  const still = useReducedMotion()
  const { vibrate } = useHaptic({ hapticDuration: 20 })
  const [stage, setStage] = useState<'sealed' | 'shuffle' | 'done'>(() => (seen(roundId) ? 'done' : 'sealed'))
  const [i, setI] = useState(0)
  const timers = useRef<number[]>([])
  const pool = matches.flatMap((m) => [m.home_team_id, m.away_team_id])

  const finish = () => {
    timers.current.forEach(clearTimeout)
    setStage('done')
    try {
      localStorage.setItem(seenKey(roundId), '1')
    } catch {
      /* shows sealed again next time; harmless */
    }
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const open = () => {
    vibrate() // from the tap: iOS only allows haptics inside a user gesture
    if (still) return finish()
    setStage('shuffle')
    // Slowing shuffle: ~1.1 s of crest flicks, a tick on each, then land.
    let t = 0
    for (let k = 0; k < 12; k++) {
      t += 40 + k * 9
      timers.current.push(
        window.setTimeout(() => {
          setI(k)
          vibrate()
        }, t),
      )
    }
    timers.current.push(
      window.setTimeout(() => {
        vibrate()
        setTimeout(vibrate, 70)
        finish()
      }, t + 120),
    )
  }

  const home = teams.get(featured.home_team_id)!
  const away = teams.get(featured.away_team_id)!
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">Featured match</h2>
      <button
        onClick={stage === 'sealed' ? open : stage === 'shuffle' ? finish : undefined}
        disabled={stage === 'done'}
        aria-label={stage === 'done' ? `Featured match: ${home.name} v ${away.name}` : 'Open the raffle'}
        className="flex h-36 w-full items-center justify-center rounded-2xl bg-[#0f5132] bg-[repeating-linear-gradient(90deg,transparent_0_12.5%,rgba(0,0,0,.18)_12.5%_25%)] text-[#f7f5ef]"
      >
        {stage === 'sealed' && (
          <span className="flex flex-col items-center">
            <span className="text-3xl">🎟️</span>
            <span className="font-bold">Tap to draw this round’s featured match</span>
            <span className="text-xs opacity-75">Already drawn on the server; you’re just opening it</span>
          </span>
        )}
        {stage === 'shuffle' && (
          <img
            src={crestUrl(teams.get(pool[(i * 7) % pool.length])!)}
            alt=""
            className="h-20 w-20 rounded-full bg-white object-contain p-2"
          />
        )}
        {stage === 'done' && (
          <span className="flex items-center gap-3">
            <AnimatePresence>
              {[home, null, away].map((t, k) =>
                t ? (
                  <motion.span
                    key={t.id}
                    className="flex flex-col items-center gap-1"
                    initial={still ? false : { scale: 0.2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 15, delay: k * 0.06 }}
                  >
                    <img src={crestUrl(t)} alt="" className="h-20 w-20 rounded-full bg-white object-contain p-2" />
                    <span className="text-sm font-bold">{t.name}</span>
                  </motion.span>
                ) : (
                  <span key="v" className="text-xl font-black text-[#f2b226]">
                    v
                  </span>
                ),
              )}
            </AnimatePresence>
          </span>
        )}
      </button>
      {stage === 'done' && <div className="mt-3">{children}</div>}
    </section>
  )
}
