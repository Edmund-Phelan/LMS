import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useHaptic } from 'react-haptic'
import { cardStyle, crestUrl, type Pick, type Team } from './lib/supabase'

/** Team-sheet reveal (CLAUDE.md §6): one face-down card per player, tap to flip. Only rendered after the lock. */
export function RevealCards({
  picks,
  teams,
  name,
}: {
  picks: Pick[]
  teams: Map<number, Team>
  name: (id: string) => string
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { vibrate } = useHaptic({ hapticDuration: 20 })
  const flip = (id: string) => {
    vibrate()
    setOpen((s) => new Set(s).add(id))
  }
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="disp text-[22px] font-extrabold">The team sheet</h2>
        {open.size < picks.length && (
          <button
            type="button"
            onClick={() => setOpen(new Set(picks.map((p) => p.player_id)))}
            className="min-h-11 px-2 text-sm font-semibold text-gold"
          >
            Flip all
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {picks.map((p) => (
          <li key={p.player_id}>
            <FlipCard
              open={open.has(p.player_id)}
              onFlip={() => flip(p.player_id)}
              player={name(p.player_id)}
              team={teams.get(p.team_id)!}
              auto={p.is_auto}
            />
          </li>
        ))}
      </ul>
    </>
  )
}

function FlipCard({
  open,
  onFlip,
  player,
  team,
  auto,
}: {
  open: boolean
  onFlip: () => void
  player: string
  team: Team
  auto: boolean
}) {
  const still = useReducedMotion()
  const face =
    'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[18px] p-2 [backface-visibility:hidden]'
  return (
    <button
      onClick={onFlip}
      disabled={open}
      aria-label={open ? `${player}: ${team.name}` : `Flip ${player}'s card`}
      className="relative block h-44 w-full [perspective:800px]"
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: open ? 180 : 0 }}
        transition={still ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 22 }}
      >
        <div className={`${face} stripes hairline text-chalk`}>
          <span className="disp text-4xl font-extrabold text-gold">?</span>
          <span className="disp w-full truncate text-lg font-extrabold">{player}</span>
          <span className="text-[10px] tracking-widest uppercase opacity-75">Tap to reveal</span>
        </div>
        <div className={`${face} [transform:rotateY(180deg)]`} style={cardStyle(team)}>
          <span className="w-full truncate text-sm font-bold">{player}</span>
          <img src={crestUrl(team)} alt="" className="h-12 w-12 object-contain" />
          <span className="disp text-lg leading-tight font-extrabold uppercase">{team.name}</span>
          {auto && <span className="text-[10px] tracking-widest uppercase opacity-75">Auto-pick</span>}
        </div>
      </motion.div>
    </button>
  )
}
