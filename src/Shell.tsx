import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { setSound, useSound } from './sound'

// App shell (docs/UI-REDESIGN.md §2): top bar, scroll area, bottom tabs. Pushed pages swap the tab bar for a back
// button. Each screen renders its own Shell, so changing tab remounts the scroll area at the top.

const svg = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export const Icon = {
  ball: (
    <svg {...svg}>
      <ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-35 12 12)" />
      <path d="m9.5 14.5 5-5M10.5 11.5l2 2M12.5 9.5l2 2" />
    </svg>
  ),
  trophy: (
    <svg {...svg}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  grid: (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16" />
    </svg>
  ),
  person: (
    <svg {...svg}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  lock: (size = 34, sw = 2) => (
    <svg {...svg} width={size} height={size} strokeWidth={sw}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  check: (size = 14, sw = 3) => (
    <svg {...svg} width={size} height={size} strokeWidth={sw}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  chevron: (
    <svg {...svg} width={18} height={18}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  back: (
    <svg {...svg} width={22} height={22} strokeWidth={2.4}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  clock: (
    <svg {...svg} width={28} height={28}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
}

function SoundToggle() {
  const on = useSound()
  return (
    <button
      type="button"
      onClick={() => setSound(!on)}
      aria-label={on ? 'Mute sounds' : 'Turn sounds on'}
      aria-pressed={on}
      className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12"
      style={{ background: on ? 'rgba(242,178,38,.12)' : 'transparent' }}
    >
      <svg {...svg} width={20} height={20} stroke={on ? '#f2b226' : '#a8b3d1'}>
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6m0-6 6 6" />}
      </svg>
    </button>
  )
}

function Frame({ top, children, bottom }: { top: ReactNode; children: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-navy-900 font-sans text-chalk">
      <header className="flex shrink-0 items-center gap-3 px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-1">
        {top}
      </header>
      <main className="scroll flex-1 overflow-x-hidden overflow-y-auto px-4 pt-2 pb-6">{children}</main>
      {bottom}
    </div>
  )
}

const Titles = ({ eyebrow, title, eyebrowGold }: { eyebrow: string; title: string; eyebrowGold?: boolean }) => (
  <div className="min-w-0 flex-1">
    <p className={`disp text-xs font-bold tracking-[.18em] uppercase ${eyebrowGold ? 'text-gold' : 'text-muted'}`}>
      {eyebrow}
    </p>
    <p className="disp truncate text-xl leading-[1.05] font-extrabold">{title}</p>
  </div>
)

const TABS = [
  { to: '/round', label: 'Round', icon: Icon.ball },
  { to: '/pools', label: 'Pools', icon: Icon.grid },
  { to: '/table', label: 'Table', icon: Icon.trophy },
  { to: '/me', label: 'Me', icon: Icon.person },
]

export default function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Frame
      top={
        <>
          <div className="disp flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gold text-[15px] font-extrabold tracking-tight text-navy-900">
            BBB
          </div>
          <Titles eyebrow="Last Man Standing" title={title} />
          <SoundToggle />
        </>
      }
      bottom={
        <nav
          aria-label="Main"
          className="grid shrink-0 grid-cols-4 border-t border-white/7 px-3 pb-[max(18px,env(safe-area-inset-bottom))] backdrop-blur-[16px]"
          style={{ background: 'rgba(8,17,50,.92)', minHeight: 84 }}
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `relative flex min-h-11 flex-col items-center justify-center gap-1 transition-colors ${isActive ? 'text-gold' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="tab-ind absolute top-0 h-[3px] w-[34px] rounded-b-[3px] bg-gold" />}
                  {t.icon}
                  <span className="text-[11px] font-bold tracking-[.04em]">{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      }
    >
      {children}
    </Frame>
  )
}

/** A pushed page (Profile edit, Rules, Admin): back chevron, no tab bar. */
export function Pushed({
  title,
  eyebrow = 'Last Man Standing',
  eyebrowGold,
  right,
  children,
}: {
  title: string
  eyebrow?: string
  eyebrowGold?: boolean
  right?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  // history.state.idx is react-router's own counter: 0 means this page was opened directly, so there's no "back".
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/me'))
  return (
    <Frame
      top={
        <>
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="press -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            {Icon.back}
          </button>
          <Titles eyebrow={eyebrow} title={title} eyebrowGold={eyebrowGold} />
          {right ?? <SoundToggle />}
        </>
      }
    >
      <div className="pb-[env(safe-area-inset-bottom)]">{children}</div>
    </Frame>
  )
}

/** Shared bits. */
export const Card = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <section className={`hairline rounded-[20px] bg-navy-800 ${className}`}>{children}</section>
)

export const Loading = () => <p className="p-6 text-muted">Loading…</p>
