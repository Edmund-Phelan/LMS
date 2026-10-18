import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useReducedMotion } from 'motion/react'
import { crestUrl, type Team } from './lib/supabase'
import { recapSfx } from './sound'
import { loadRecap, markSeen, type Card, type Clash, type Recap, type Win } from './recapData'
import { Avatar } from './Profile'

// Round recap on open (docs/UI-REDESIGN.md §19, prototype docs/ui-prototype/Recap.dc.html): once per player per
// settled round, an Instagram-style story of what happened. Replaces the §17 overlay (its red card is the out card).

const CLASH_MS = 4300

/** App-level: shows the recap once on open after a settle, then stores it as seen. */
export function RoundRecap({ me, seen }: { me: string; seen: number | null | undefined }) {
  const [recap, setRecap] = useState<Recap | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    loadRecap(me, seen).then(setRecap)
  }, [me, seen])
  if (!recap) return null
  return (
    <Story
      recap={recap}
      onClose={(go) => {
        void markSeen(me, recap.round.number)
        setRecap(null)
        if (go) navigate(recap.to)
      }}
    />
  )
}

/** The story player: progress bars, left third back, right two thirds next, hold to pause (spec §19 Story controls). */
function Story({ recap, onClose }: { recap: Recap; onClose: (go: boolean) => void }) {
  const still = useReducedMotion()
  const { cards } = recap
  const n = cards.length
  const hasClash = (c: Card) => !still && (c.type === 'through' || c.type === 'out') && !!c.clash
  const dur = (c: Card) => (hasClash(c) ? CLASH_MS + 4500 : 5500)

  // Story clock: per-card elapsed time that stops while paused. Kept in a ref so timers always see the latest.
  const s = useRef({
    i: 0,
    clash: true,
    paused: false,
    nonce: 0,
    barDelay: 0,
    base: 0,
    t0: 0 as number | null,
    over: false,
  })
  const [, render] = useReducer((x: number) => x + 1, 0)
  const evt = useRef<number>(undefined)
  const holdT = useRef<number>(undefined)
  const wasHold = useRef(false)
  const st = s.current

  const elapsed = () => st.base + (st.t0 ? Date.now() - st.t0 : 0)
  const schedule = () => {
    clearTimeout(evt.current)
    if (!st.t0) return
    const card = cards[st.i]
    const e = elapsed()
    const targets = [hasClash(card) && !st.over ? CLASH_MS : 0, st.i < n - 1 ? dur(card) : 0].filter((x) => x > e)
    if (targets.length) evt.current = window.setTimeout(fire, Math.min(...targets) - e + 5)
  }
  const fire = () => {
    const card = cards[st.i]
    const e = elapsed()
    if (hasClash(card) && !st.over && e >= CLASH_MS) {
      st.over = true
      st.clash = false
      render()
    }
    if (st.i < n - 1 && e >= dur(card)) return go(st.i + 1)
    schedule()
  }
  const startCard = () => {
    Object.assign(st, { base: 0, t0: Date.now(), over: false })
    schedule()
  }
  const pause = () => {
    if (!st.t0) return
    Object.assign(st, { base: elapsed(), t0: null, paused: true })
    clearTimeout(evt.current)
    recapSfx.pause()
    render()
  }
  const resume = () => {
    if (st.t0) return
    Object.assign(st, { t0: Date.now(), paused: false })
    recapSfx.resume()
    render()
    schedule()
  }
  /** Remount the card (new key) so its entrance, and the clash, play again from the start. */
  const bounce = (i = st.i) => {
    clearTimeout(evt.current)
    recapSfx.resume()
    Object.assign(st, { i, clash: true, paused: false, barDelay: 0, nonce: st.nonce + 1 })
    render()
    startCard()
  }
  const playCard = (card: Card) => {
    recapSfx.cut()
    if (hasClash(card)) {
      recapSfx.clash((card as { clash: Clash }).clash.win)
      recapSfx.card(card.sound, CLASH_MS)
    } else recapSfx.card(card.sound, 0)
  }
  const go = (i: number) => {
    bounce(i)
    playCard(cards[i])
  }
  const close = (to: boolean) => {
    recapSfx.cut()
    clearTimeout(evt.current)
    onClose(to)
  }
  const forward = () => {
    const card = cards[st.i]
    if (hasClash(card) && !st.over) {
      // First tap during the clash skips to the result, like skipping ahead in the story.
      const e = elapsed()
      Object.assign(st, {
        over: true,
        clash: false,
        base: CLASH_MS,
        t0: st.t0 ? Date.now() : null,
        barDelay: -Math.max(0, CLASH_MS - e),
      })
      render()
      recapSfx.cut()
      recapSfx.card(card.sound, 0)
      schedule()
      return
    }
    if (st.i < n - 1) go(st.i + 1)
    else close(true)
  }
  const press = () => {
    wasHold.current = false
    clearTimeout(holdT.current)
    holdT.current = window.setTimeout(() => {
      wasHold.current = true
      pause()
    }, 220)
  }
  const release = () => {
    clearTimeout(holdT.current)
    if (wasHold.current) resume()
  }
  const tap = (dir: number) => {
    if (wasHold.current) {
      wasHold.current = false
      return
    }
    if (dir < 0) go(Math.max(0, st.i - 1))
    else forward()
  }

  useEffect(() => {
    startCard() // the first card plays silently: iOS only starts audio from a tap (the speaker button replays it)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close(false)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('keydown', esc)
      clearTimeout(evt.current)
      clearTimeout(holdT.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const card = cards[st.i]
  const clashing = hasClash(card) && st.clash
  const zone = (label: string, dir: number) => (
    <button
      type="button"
      aria-label={label}
      className="tapzone"
      onClick={() => tap(dir)}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: dir < 0 ? 'w-resize' : 'e-resize' }}
    />
  )
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${recap.round.name} recap`}
      className={`fixed inset-0 z-[60] overflow-hidden bg-navy-900 text-chalk ${st.paused ? 'paused' : ''}`}
    >
      <div key={st.nonce} className="absolute inset-0">
        {clashing ? <ClashView c={(card as { clash: Clash }).clash} /> : <CardView card={card} />}
      </div>

      <div className="absolute inset-0 z-[26] grid grid-cols-[32%_68%]">
        {zone('Previous card', -1)}
        {zone('Next card', 1)}
      </div>

      <div className="chrome pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div role="img" aria-label={`Card ${st.i + 1} of ${n}`} className="flex gap-1 px-3.5 pt-4">
          {cards.map((c, b) => (
            <span key={b} className="relative h-[3px] flex-1 overflow-hidden rounded-[2px] bg-white/30">
              {b < st.i && <span className="absolute inset-0 bg-white" />}
              {b === st.i && (
                <span
                  key={st.nonce}
                  className="bar-fill absolute inset-0 origin-left bg-white"
                  style={{ animationDuration: `${dur(c)}ms`, animationDelay: `${st.barDelay}ms` }}
                />
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between px-3.5 pt-2.5">
          <button
            type="button"
            aria-label="Replay this card with sound"
            onClick={() => {
              bounce()
              playCard(card)
            }}
            className="press pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/25"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 5a10 10 0 0 1 0 14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="press pointer-events-auto h-11 rounded-full border border-white/20 bg-black/25 px-4 text-sm font-bold"
          >
            Skip
          </button>
        </div>
      </div>

      <div className="chrome pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2.5 px-[22px] pb-[calc(30px+env(safe-area-inset-bottom))]">
        {st.i === n - 1 && (
          <button
            key={st.nonce}
            type="button"
            onClick={() => close(true)}
            className="press rc-c pointer-events-auto h-[54px] w-full rounded-2xl bg-gold text-[17px] font-extrabold text-navy-900"
          >
            {recap.final}
          </button>
        )}
        {st.i === 0 && (
          <span key={st.nonce} className="rc-c text-xs font-semibold opacity-60">
            Tap right for next · left to go back · hold to pause
          </span>
        )}
      </div>
    </div>
  )
}

// ---------- The clash: ceramic plates twirl and clink, the loser smashes, the winner slams into the middle ----------

/** Pseudo-random in [0, 1), stable per seed, so the break pattern is the same every replay. */
const r = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
type Pt = { x: number; y: number }
type Shard = { clip: string; mid: string; to: string }

/** Ceramic break pattern: 7 jagged sectors, each split into an inner and an outer piece, sharing edges so they tile. */
function shardsFor(dir: number, seed: number): { shards: Shard[]; cracks: string } {
  const N = 7
  const deg = Math.PI / 180
  const P = (ang: number, rad: number): Pt => ({ x: 50 + rad * Math.cos(ang * deg), y: 50 + rad * Math.sin(ang * deg) })
  const b: number[] = []
  const k: Pt[] = []
  const m: Pt[] = []
  const o: Pt[] = []
  const mm: Pt[] = []
  for (let i = 0; i < N; i++) b.push(10 + (i * 360) / N + (r(seed + i) - 0.5) * 22)
  for (let i = 0; i < N; i++) {
    k.push(P(b[i] + (r(seed + 20 + i) - 0.5) * 14, 13 + r(seed + 10 + i) * 10))
    m.push(P(b[i] + (r(seed + 40 + i) - 0.5) * 12, 36 + r(seed + 30 + i) * 14))
    o.push(P(b[i], 86))
    const nb = i === N - 1 ? b[0] + 360 : b[i + 1]
    mm.push(P((b[i] + nb) / 2 + (r(seed + 60 + i) - 0.5) * 10, 38 + r(seed + 50 + i) * 12))
  }
  const C = { x: 50 + (r(seed + 99) - 0.5) * 6, y: 50 + (r(seed + 98) - 0.5) * 6 }
  const poly = (pts: Pt[]) => `polygon(${pts.map((p) => `${p.x.toFixed(1)}% ${p.y.toFixed(1)}%`).join(', ')})`
  const shards: Shard[] = []
  for (let j = 0; j < N; j++) {
    const jn = (j + 1) % N
    ;[
      [C, k[j], m[j], mm[j], m[jn], k[jn]],
      [m[j], o[j], o[jn], m[jn], mm[j]],
    ].forEach((pts, outer) => {
      let cx = 0
      let cy = 0
      for (const p of pts) {
        cx += p.x
        cy += p.y
      }
      cx = (cx / pts.length - 50) * 1.28
      cy = (cy / pts.length - 50) * 1.28
      const len = Math.max(1, Math.sqrt(cx * cx + cy * cy))
      const q = seed + j * 7 + outer * 3
      const dist = outer ? 160 + r(q) * 90 : 70 + r(q) * 70
      const tx = Math.round((cx / len) * dist + dir * (50 + r(q + 1) * 60))
      const ty = Math.round((cy / len) * dist * 0.5 + 190 + r(q + 2) * 140)
      const rz = Math.round((r(q + 3) - 0.5) * 900)
      const rx = Math.round((r(q + 4) - 0.5) * 600)
      const ry = Math.round((r(q + 5) - 0.5) * 600)
      shards.push({
        clip: poly(pts),
        mid: `translate(${Math.round(tx * 0.55)}px,${Math.round((cy / len) * dist * 0.35 - 50 - r(q + 6) * 40)}px) rotateX(${Math.round(rx * 0.4)}deg) rotateY(${Math.round(ry * 0.4)}deg) rotate(${Math.round(rz * 0.4)}deg)`,
        to: `translate(${tx}px,${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${rz}deg) scale(.9)`,
      })
    })
  }
  // Crack lines along the same edges, shown in the freeze frame before the burst.
  const f = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  let cracks = ''
  for (let q = 0; q < N; q++) {
    const qn = (q + 1) % N
    cracks += `M${f(C)}L${f(k[q])}L${f(m[q])}L${f(P(b[q], 50))}M${f(m[q])}L${f(mm[q])}L${f(m[qn])}`
  }
  return { shards, cracks }
}

type Chip = { left: string; w: string; h: string; c: string; d: string; to: string }
function chipsFor(win: Win): Chip[] {
  const chips: Chip[] = []
  let n = 0
  const burst = (
    count: number,
    delay: string,
    x: number,
    minD: number,
    spread: number,
    cols: string[],
    big: boolean,
  ) => {
    for (let i = 0; i < count; i++) {
      n++
      const a = r(n * 3.1) * Math.PI * 2
      const d = minD + r(n * 5.7) * spread
      chips.push({
        left: `calc(50% + ${x}px)`,
        w: (big ? 5 + r(n) * 6 : 3 + r(n) * 3).toFixed(0) + 'px',
        h: (big ? 4 + r(n + 9) * 5 : 2 + r(n + 9) * 3).toFixed(0) + 'px',
        c: cols[i % cols.length],
        d: delay,
        to: `translate(${Math.round(Math.cos(a) * d)}px,${Math.round(Math.sin(a) * d + (big ? 70 : 20))}px) rotate(${Math.round(r(n * 2.3) * 720)}deg)`,
      })
    }
  }
  const porcelain = ['#ffffff', '#f1ece1', '#d9d0bd']
  burst(7, '.75s', 0, 28, 50, porcelain, false)
  burst(9, '1.65s', 0, 30, 60, porcelain, false)
  if (win !== 'h') burst(16, '2.95s', -52, 50, 130, porcelain, true)
  if (win !== 'a') burst(16, '2.95s', 52, 50, 130, porcelain, true)
  burst(14, '3.8s', 0, 75, 80, ['#f2b226', '#fff2c4', '#ffffff'], false)
  return chips
}

const IMPACTS = [
  { d: '.75s', size: 84, bg: 'radial-gradient(circle, #fff, rgba(255,255,255,0) 68%)' },
  { d: '1.65s', size: 96, bg: 'radial-gradient(circle, #fff, rgba(255,255,255,0) 68%)' },
  { d: '2.8s', size: 180, bg: 'radial-gradient(circle, #fff, rgba(255,242,196,.7) 40%, rgba(255,255,255,0) 70%)' },
  {
    d: '3.8s',
    size: 230,
    bg: 'radial-gradient(circle, rgba(255,242,196,.95), rgba(242,178,38,.5) 40%, rgba(242,178,38,0) 70%)',
  },
]

/** A glazed plate with the crest painted in the middle and the team's colour on the rim. */
const PlateFace = ({ team }: { team: Team }) => (
  <span
    className="absolute inset-0 flex items-center justify-center rounded-full"
    style={{
      background: 'radial-gradient(circle at 34% 28%, #ffffff 0%, #fbf8f1 36%, #e9e3d5 76%, #cdc4b1 100%)',
      boxShadow: `inset 0 0 0 4px #f1ece1, inset 0 0 0 9px ${team.primary}, inset 0 0 0 11px #f1ece1, inset 0 -10px 18px rgba(90,70,40,.22)`,
    }}
  >
    <img src={crestUrl(team)} alt="" className="h-[78px] w-[78px] object-contain" />
    <span
      aria-hidden
      className="absolute top-[14px] left-[19px] h-[25px] w-12 rounded-[50%] bg-white/85 blur-[3px]"
      style={{ transform: 'rotate(-30deg)' }}
    />
  </span>
)

function ClashView({ c }: { c: Clash }) {
  const [chips] = useState(() => chipsFor(c.win))
  const sides = [
    { team: c.home, dir: -1, broken: c.win !== 'h', won: c.win === 'h', seed: 11 },
    { team: c.away, dir: 1, broken: c.win !== 'a', won: c.win === 'a', seed: 47 },
  ].map((sd) => ({ ...sd, ...(sd.broken ? shardsFor(sd.dir, sd.seed) : { shards: [], cracks: '' }) }))
  const nest = (cls: string[], inner: ReactNode): ReactNode =>
    cls.reduceRight<ReactNode>(
      (acc, k, i) => (
        <span className={`${k} absolute inset-x-0 block h-0 ${i === 0 ? 'top-[44%]' : 'top-0'}`}>{acc}</span>
      ),
      inner,
    )
  return (
    <div
      className="clash absolute inset-0 overflow-hidden text-white"
      role="img"
      aria-label={`${c.line}. Tap to continue.`}
      style={{ background: `linear-gradient(100deg, ${c.home.primary} 50%, ${c.away.primary} 50%)` }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 44%, rgba(11,23,66,.2), rgba(5,10,31,.9) 68%)' }}
      />
      <span
        aria-hidden
        className="windup absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 44%, rgba(0,0,0,0) 22%, rgba(0,0,0,.72) 62%)' }}
      />
      <span className="clash-ft disp absolute inset-x-0 top-[118px] text-center text-sm font-bold tracking-[.26em] text-gold">
        FULL TIME
      </span>
      {nest(
        ['sh-a', 'sh-b', 'sh-c', 'sh-d'],
        <>
          <span className="orbit absolute top-0 left-1/2 block h-0 w-0">
            {sides.map((sd) => (
              <span
                key={sd.team.id}
                className={`arm ${sd.won ? 'win' : ''} absolute -top-16 -left-16 block h-32 w-32`}
                style={{ '--dir': sd.dir, zIndex: sd.won ? 3 : sd.broken ? 1 : 2, perspective: 700 } as CSSProperties}
              >
                <span
                  className="spinner absolute inset-0 block"
                  style={{ transformStyle: 'preserve-3d', '--dir': sd.dir } as CSSProperties}
                >
                  {sd.shards.map((sh, i) => (
                    <span
                      key={i}
                      className="shard absolute inset-0 block"
                      style={{ '--to': sh.to, '--mid': sh.mid } as CSSProperties}
                    >
                      <span className="absolute inset-0 block" style={{ clipPath: sh.clip }}>
                        <PlateFace team={sd.team} />
                      </span>
                    </span>
                  ))}
                  <span
                    className={`whole ${sd.broken ? 'breaks' : ''} absolute inset-0 block rounded-full`}
                    style={{
                      boxShadow: sd.team.id === c.mine ? '0 0 0 4px #f2b226, 0 0 28px rgba(242,178,38,.6)' : 'none',
                      filter: 'drop-shadow(0 18px 22px rgba(0,0,0,.5))',
                    }}
                  >
                    <PlateFace team={sd.team} />
                    {sd.broken && (
                      <svg
                        className="cracks absolute inset-0 h-full w-full rounded-full"
                        viewBox="0 0 100 100"
                        aria-hidden
                      >
                        <path d={sd.cracks} fill="none" stroke="#5c4f3a" strokeWidth="1.3" strokeLinejoin="bevel" />
                        <path
                          d={sd.cracks}
                          fill="none"
                          stroke="rgba(255,255,255,.7)"
                          strokeWidth=".6"
                          transform="translate(.6 .6)"
                        />
                      </svg>
                    )}
                  </span>
                </span>
              </span>
            ))}
          </span>
          {IMPACTS.map((im) => (
            <span
              key={im.d}
              aria-hidden
              className="impact absolute top-0 left-1/2 rounded-full"
              style={
                {
                  width: im.size,
                  height: im.size,
                  margin: `${-im.size / 2}px 0 0 ${-im.size / 2}px`,
                  background: im.bg,
                  '--d': im.d,
                } as CSSProperties
              }
            />
          ))}
          {chips.map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className="chip absolute top-0 rounded-[2px]"
              style={
                {
                  left: ch.left,
                  width: ch.w,
                  height: ch.h,
                  background: ch.c,
                  '--to': ch.to,
                  '--d': ch.d,
                } as CSSProperties
              }
            />
          ))}
          {c.win === 'draw' ? (
            <span className="draw-slam disp absolute inset-x-0 -top-[50px] text-center text-[96px] leading-none font-extrabold tracking-[.02em] [text-shadow:0_10px_40px_rgba(0,0,0,.6)]">
              DRAW
            </span>
          ) : (
            <span
              aria-hidden
              className="dust absolute top-[62px] left-1/2 -ml-[125px] h-[52px] w-[250px] rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,.55), rgba(255,255,255,0))' }}
            />
          )}
        </>,
      )}
      <span className="clash-score disp absolute inset-x-0 top-[63%] text-center text-[34px] font-extrabold">
        {c.score}
      </span>
    </div>
  )
}

// ---------- The cards ----------

const confetti = (colours: string[], count: number, rBase: number, rStep: number, turn: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    const rad = rBase + (i % 3) * rStep
    return {
      colour: colours[i % colours.length],
      to: `translate(${Math.round(Math.cos(a) * rad)}px,${Math.round(Math.sin(a) * rad)}px) rotate(${i * turn}deg)`,
    }
  })

const Pill = ({ team, line, grey }: { team?: Team; line: string; grey?: boolean }) =>
  line ? (
    <span className="flex items-center gap-2.5 rounded-full bg-black/30 py-2 pr-3.5 pl-2 font-bold">
      {team && (
        <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-white ${grey ? 'grayscale' : ''}`}>
          <img src={crestUrl(team)} alt="" className="h-6 w-6 object-contain" />
        </span>
      )}
      {line}
    </span>
  ) : null

const Shell = ({ bg, label, gap, children }: { bg: string; label: string; gap: number; children: ReactNode }) => (
  <div
    role="group"
    aria-label={`${label} Tap to continue.`}
    className="ko absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-7 text-center text-white"
    style={{ background: bg, gap }}
  >
    {children}
  </div>
)

function CardView({ card }: { card: Card }) {
  if (card.type === 'through') {
    const t = card.team
    const cols = card.final
      ? ['#f2b226', '#fff2c4', '#ffffff']
      : t
        ? [t.primary, t.secondary.toLowerCase() === '#ffffff' ? '#f2b226' : t.secondary, '#ffffff']
        : ['#f2b226', '#ffffff']
    return (
      <Shell
        bg="radial-gradient(circle at 50% 38%, #17834a, #04200f 74%)"
        label={`You’re through. ${card.line}.`}
        gap={18}
      >
        {confetti(cols, 16, 150, 40, 47).map((cf, i) => (
          <span
            key={i}
            aria-hidden
            className="confetti absolute top-[34%] left-1/2 h-4 w-2.5 rounded-[2px]"
            style={{ background: cf.colour, '--to': cf.to } as CSSProperties}
          />
        ))}
        <span className="rc-shake flex flex-col items-center gap-[22px]">
          {t && (
            <span
              className="pop flex h-[150px] w-[150px] items-center justify-center rounded-full bg-white"
              style={{ boxShadow: `0 0 0 6px ${t.primary}, 0 26px 60px rgba(0,0,0,.45)` }}
            >
              <img src={crestUrl(t)} alt="" className="h-[110px] w-[110px] object-contain" />
            </span>
          )}
          <span className="rc-title disp text-[68px] leading-[.88] font-extrabold uppercase">
            {card.final ? (
              <span className="shimmer">
                Last man
                <br />
                standing
              </span>
            ) : (
              <>
                You’re
                <br />
                through
              </>
            )}
          </span>
        </span>
        <span className="rc-a">
          <Pill team={t} line={card.line} />
        </span>
        <span className="rc-b max-w-[290px] text-[15px] leading-[1.4] opacity-90">{card.sub}</span>
        {card.extra && <span className="rc-c text-[13px] opacity-60">{card.extra}</span>}
      </Shell>
    )
  }
  if (card.type === 'out')
    return (
      <Shell bg="radial-gradient(circle at 50% 38%, #7a1020, #24060e 72%)" label={`You’re out. ${card.line}.`} gap={18}>
        <span className="ko-shake flex flex-col items-center gap-[22px]">
          <span
            aria-hidden
            className="ko-card h-[178px] w-32 rounded-[14px] bg-[linear-gradient(160deg,#ff3b4a,#c8102e)] shadow-[0_30px_70px_rgba(0,0,0,.55),inset_0_0_0_3px_rgba(255,255,255,.22)]"
          />
          <span className="ko-title disp text-[68px] leading-[.88] font-extrabold uppercase">
            You’re
            <br />
            out
          </span>
        </span>
        <span className="ko-sub">
          <Pill team={card.team} line={card.line} grey />
        </span>
        <span className="ko-sub2 max-w-[280px] text-[15px] leading-[1.4] opacity-85">{card.sub}</span>
        {card.extra && <span className="ko-sub2 text-[13px] opacity-60">{card.extra}</span>}
      </Shell>
    )
  if (card.type === 'pred') {
    const v = {
      exact: {
        title: 'Exact\nscore',
        bg: 'radial-gradient(circle at 50% 36%, #4a3606, #0b1742 70%)',
        accent: '#f2b226',
        you: '#f2b226',
      },
      points: {
        title: 'Points\non the board',
        bg: 'radial-gradient(circle at 50% 36%, #1d3a86, #0b1742 70%)',
        accent: '#8fc1ff',
        you: '#f4f1e8',
      },
      zero: { title: 'No points\nthis time', bg: '#0f1c46', accent: '#a8b3d1', you: '#a8b3d1' },
    }[card.kind]
    const side = (t: Team) => (
      <span className="flex flex-col items-center gap-1.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
          <img src={crestUrl(t)} alt="" className="h-8 w-8 object-contain" />
        </span>
        <span className="max-w-[90px] truncate text-xs font-bold opacity-85">{t.name}</span>
      </span>
    )
    return (
      <Shell bg={v.bg} label={`${v.title.replace('\n', ' ')}. ${card.big}.`} gap={14}>
        {card.kind === 'exact' && (
          <>
            <span
              aria-hidden
              className="rc-rays absolute top-1/2 left-1/2 -mt-[680px] -ml-[550px] h-[1100px] w-[1100px] rounded-full"
              style={{
                background: 'repeating-conic-gradient(rgba(242,178,38,.16) 0deg 7deg, transparent 7deg 22deg)',
                maskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
                WebkitMaskImage: 'radial-gradient(circle, #000 18%, transparent 62%)',
              }}
            />
            {confetti(['#f2b226', '#fff2c4', '#ffffff'], 18, 140, 45, 53).map((cf, i) => (
              <span
                key={i}
                aria-hidden
                className="confetti absolute top-[30%] left-1/2 h-3.5 w-[9px] rounded-[2px]"
                style={{ background: cf.colour, '--to': cf.to } as CSSProperties}
              />
            ))}
          </>
        )}
        <span className="rc-eyebrow disp relative text-[13px] font-bold tracking-[.22em]" style={{ color: v.accent }}>
          FEATURED MATCH
        </span>
        <span className="rc-shake relative flex flex-col items-center gap-1">
          <span className="rc-title disp text-[58px] leading-[.9] font-extrabold whitespace-pre-line uppercase">
            {v.title}
          </span>
          <span
            className="rc-big disp text-[128px] leading-none font-extrabold [text-shadow:0_10px_40px_rgba(0,0,0,.35)]"
            style={{ color: v.accent }}
          >
            {card.big}
          </span>
          <span className="rc-a text-[15px] font-bold" style={{ color: v.accent }}>
            {card.band}
          </span>
        </span>
        <span className="rc-b relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-[20px] bg-black/28 px-[18px] py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
          {side(card.home)}
          <span className="grid grid-cols-[auto_auto] items-baseline gap-x-3 gap-y-1.5">
            <span className="text-right text-xs font-semibold opacity-70">You said</span>
            <span className="disp text-[26px] font-extrabold" style={{ color: v.you }}>
              {card.you}
            </span>
            <span className="text-right text-xs font-semibold opacity-70">Full time</span>
            <span className="disp text-[26px] font-extrabold">{card.ft}</span>
          </span>
          {side(card.away)}
        </span>
        <span className="rc-c relative text-sm opacity-85">{card.sub}</span>
      </Shell>
    )
  }
  const v = {
    landed: {
      eyebrow: 'YOUR JINX',
      title: 'Jinx\nlanded',
      bg: 'radial-gradient(circle at 50% 36%, #5a1030, #0b1742 72%)',
      solid: '#2a0f2e',
      accent: '#ff8a8a',
    },
    missed: {
      eyebrow: 'YOUR JINX',
      title: `${card.names}\nsurvived`,
      bg: '#0f1c46',
      solid: '#0f1c46',
      accent: '#a8b3d1',
    },
    jinxed: {
      eyebrow: `${card.names.toUpperCase()} JINXED YOU`,
      title: 'Jinx\nshaken off',
      bg: 'radial-gradient(circle at 50% 36%, #14563a, #0b1742 72%)',
      solid: '#0f3a2e',
      accent: '#7be0a6',
    },
  }[card.kind]
  return (
    <Shell bg={v.bg} label={`${v.title.replace('\n', ' ')}.`} gap={16}>
      <span className="rc-eyebrow disp text-[13px] font-bold tracking-[.22em]" style={{ color: v.accent }}>
        {v.eyebrow}
      </span>
      <span className="rc-shake relative flex flex-col items-center gap-[22px]">
        <span className="relative h-[150px] w-[150px]">
          <span className="rc-avatar absolute inset-0 block">
            <Avatar p={card.who} size={150} />
          </span>
          {card.kind === 'landed' && (
            <span
              aria-hidden
              className="rc-stamp absolute -top-3.5 -right-[22px] h-20 w-[58px] rounded-lg bg-[linear-gradient(160deg,#ff3b4a,#c8102e)] shadow-[0_14px_30px_rgba(0,0,0,.5),inset_0_0_0_2px_rgba(255,255,255,.25)]"
            />
          )}
          {card.kind !== 'landed' && (
            <span
              aria-hidden
              className="rc-cross absolute -right-4 -bottom-1.5 flex h-[60px] w-[60px] items-center justify-center rounded-full"
              style={{ background: card.kind === 'jinxed' ? '#1f9d5a' : '#3a4670', boxShadow: `0 0 0 4px ${v.solid}` }}
            >
              {card.kind === 'jinxed' ? (
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              ) : (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6 6 18" />
                </svg>
              )}
            </span>
          )}
        </span>
        <span className="rc-title disp text-[54px] leading-[.9] font-extrabold whitespace-pre-line uppercase">
          {v.title}
        </span>
      </span>
      {card.kind === 'landed' && (
        <span className="rc-big disp text-[44px] leading-none font-extrabold text-gold">+1 point</span>
      )}
      <span className="rc-a">
        <Pill team={card.team} line={card.line} grey={card.kind === 'landed'} />
      </span>
      <span className="rc-b max-w-[290px] text-[15px] leading-[1.4] opacity-88">{card.sub}</span>
    </Shell>
  )
}
