import { Fragment, useId, type ReactNode } from 'react'

// SVG jersey from a team's kit (CLAUDE.md §8). A straight port of scripts/kit-preview.py, so it matches
// docs/kit-check.html (Jersey.test.tsx compares the two for every club). Change both together.

export type Kit = {
  pattern: 'plain' | 'hoops' | 'stripes' | 'halves' | 'quarters'
  width?: 'broad' | 'thin'
  edge?: string
  colours: string[]
  trim: string
  accent: null | 'fade' | 'tartan' | 'side-panels' | 'shoulders' | 'band' | 'chevrons'
  accentColours?: string[]
  jazz?: boolean
  season?: string
  note?: string
}

export const SHIRT =
  'M70 12 L52 18 L8 44 L22 86 L44 78 L44 206 Q100 214 156 206 L156 78 L178 86 L192 44 L148 18 L130 12 Q100 34 70 12 Z'

const range = (start: number, stop: number, step: number) =>
  Array.from({ length: Math.max(0, Math.ceil((stop - start) / step)) }, (_, i) => start + i * step)

export default function Jersey({ kit, size = 150, label }: { kit: Kit; size?: number; label?: string }) {
  const id = useId()
  const cid = `clip${id}`
  const gid = `g${id}`
  const c = kit.colours
  const ac = kit.accentColours ?? []
  const parts: ReactNode[] = []
  const add = (n: ReactNode) => parts.push(<Fragment key={parts.length}>{n}</Fragment>)

  if (kit.pattern === 'plain') {
    if (kit.accent === 'fade')
      add(
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.15" stopColor={c[0]} />
              <stop offset="1" stopColor={ac[0]} />
            </linearGradient>
          </defs>
          <rect width="200" height="220" fill={`url(#${gid})`} />
        </>,
      )
    else add(<rect width="200" height="220" fill={c[0]} />)
  } else if (kit.pattern === 'hoops') {
    add(<rect width="200" height="220" fill={c[0]} />)
    if (kit.width === 'thin')
      for (const y of range(40, 215, 18)) add(<rect x="0" y={y} width="200" height="4" fill={c[1]} />)
    else {
      const h = 26
      range(10, 220, h).forEach((y, i) => {
        const col = c[i % c.length]
        add(<rect x="0" y={y} width="200" height={h} fill={col} />)
        if (kit.edge && col === c.at(-1)) add(<rect x="0" y={y + h - 3} width="200" height="3" fill={kit.edge} />)
      })
    }
  } else if (kit.pattern === 'stripes') {
    add(<rect width="200" height="220" fill={c[0]} />)
    if (kit.width === 'thin')
      for (const x of range(10, 200, 14)) add(<rect x={x} y="0" width="3" height="220" fill={c[1]} />)
    else range(0, 200, 22).forEach((x, i) => add(<rect x={x} y="0" width="22" height="220" fill={c[i % c.length]} />))
  } else if (kit.pattern === 'halves') {
    add(
      <>
        <rect width="100" height="220" fill={c[0]} />
        <rect x="100" width="100" height="220" fill={c[1]} />
      </>,
    )
  } else if (kit.pattern === 'quarters') {
    add(
      <>
        <rect width="100" height="110" fill={c[0]} />
        <rect x="100" width="100" height="110" fill={c[1]} />
        <rect y="110" width="100" height="110" fill={c[1]} />
        <rect x="100" y="110" width="100" height="110" fill={c[0]} />
      </>,
    )
  }

  if (kit.accent === 'tartan') {
    range(0, 200, 24).forEach((x, i) =>
      add(<rect x={x} y="0" width="8" height="220" fill={ac[i % ac.length]} opacity="0.35" />),
    )
    range(0, 220, 24).forEach((y, i) =>
      add(<rect x="0" y={y} width="200" height="8" fill={ac[(i + 1) % ac.length]} opacity="0.35" />),
    )
    add(
      <g opacity="0.5">
        {range(0, 200, 24).map((x) => (
          <rect key={x} x={x + 11} y="0" width="1.5" height="220" fill={ac[0]} />
        ))}
      </g>,
    )
  } else if (kit.accent === 'side-panels') {
    ac.forEach((col, i) => {
      const w = 12
      const off = 44 + i * w
      add(<rect x={off} y="70" width={w} height="150" fill={col} />)
      add(<rect x={200 - off - w} y="70" width={w} height="150" fill={col} />)
    })
  } else if (kit.accent === 'shoulders') add(<path d="M0 0 H200 V52 Q100 70 0 52 Z" fill={ac[0]} />)
  else if (kit.accent === 'band') add(<rect x="0" y="92" width="200" height="30" fill={ac[0]} />)
  else if (kit.accent === 'chevrons')
    for (const dy of [0, 26, 52])
      add(
        <path
          d={`M44 ${96 + dy} L100 ${124 + dy} L156 ${96 + dy} L156 ${108 + dy} L100 ${136 + dy} L44 ${108 + dy} Z`}
          fill={ac[0]}
        />,
      )

  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={Math.round(size * 1.1)}
      role="img"
      aria-label={label ? `${label} jersey` : 'jersey'}
    >
      <defs>
        <clipPath id={cid}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${cid})`}>{parts}</g>
      <path d="M70 12 Q100 34 130 12 L122 9 Q100 26 78 9 Z" fill={kit.trim} />
      <path d="M8 44 L22 86 L29 83.5 L15 41.5 Z" fill={kit.trim} />
      <path d="M192 44 L178 86 L171 83.5 L185 41.5 Z" fill={kit.trim} />
      <path d={SHIRT} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
    </svg>
  )
}
