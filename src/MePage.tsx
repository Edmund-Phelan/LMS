import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { supabase } from './lib/supabase'
import type { Me } from './Profile'
import Shell, { Icon } from './Shell'
import { setSound, useSound } from './sound'

const row = 'press flex w-full items-center gap-3 px-4 py-[15px] text-left'

function Row({ to, icon, children, gold }: { to: string; icon: ReactNode; children: ReactNode; gold?: boolean }) {
  return (
    <li className="border-t border-white/6 first:border-0">
      <Link to={to} className={`${row} ${gold ? 'text-gold' : 'text-chalk'}`}>
        <span className={gold ? 'text-gold' : 'text-chalk-2'}>{icon}</span>
        <span className="flex-1 font-semibold">{children}</span>
        <span className="text-muted">{Icon.chevron}</span>
      </Link>
    </li>
  )
}

export function Settings({ me, round, claims }: { me: Me; round: number | null; claims: number }) {
  const sound = useSound()
  return (
    <ul className="hairline overflow-hidden rounded-[20px] bg-navy-800">
      <Row to="/me/edit" icon={Icon.person}>
        Edit photo, nickname &amp; kit colour
      </Row>
      <li className="border-t border-white/6">
        <button type="button" onClick={() => setSound(!sound)} aria-pressed={sound} className={row}>
          <span className="text-chalk-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7" />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Crowd &amp; whistle sounds</span>
            <span className="block text-xs text-muted">Plays on picks, saves and reveals</span>
          </span>
          <span
            className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors"
            style={{ background: sound ? '#3ccf7a' : 'rgba(255,255,255,.18)' }}
          >
            <span
              className="knob absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white"
              style={{ transform: sound ? 'translateX(20px)' : 'none' }}
            />
          </span>
        </button>
      </li>
      {me.is_admin && round !== null && (
        <li className="border-t border-white/6">
          <Link to={`/admin/${round}`} className={`${row} text-gold`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
            </svg>
            <span className="flex-1 font-semibold">Admin · Round {round}</span>
            {claims > 0 && (
              <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold text-navy-900">
                {claims} claim{claims > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-muted">{Icon.chevron}</span>
          </Link>
        </li>
      )}
      <li className="border-t border-white/6">
        <button type="button" onClick={() => supabase.auth.signOut()} className={`${row} text-out-text`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="flex-1 font-semibold">Sign out</span>
        </button>
      </li>
    </ul>
  )
}

export default function MePage({ me }: { me: Me }) {
  return (
    <Shell title="Your profile">
      <div className="screen stagger flex flex-col gap-4">
        <Settings me={me} round={me.is_admin ? 1 : null} claims={0} />
      </div>
    </Shell>
  )
}
