import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { crestUrl, supabase, type Pick, type Round, type Team } from './lib/supabase'
import { loadPayments, type PaymentRow } from './Pay'
import { loadTable, type Standing } from './points'
import { Avatar, type Me } from './Profile'
import Shell, { Icon, Loading } from './Shell'
import { setSound, useSound } from './sound'

const row = 'press flex w-full items-center gap-3 px-4 py-[15px] text-left'

function Row({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="border-t border-white/6 first:border-0">
      <Link to={to} className={`${row} text-chalk`}>
        <span className="text-chalk-2">{icon}</span>
        <span className="flex-1 font-semibold">{children}</span>
        <span className="text-muted">{Icon.chevron}</span>
      </Link>
    </li>
  )
}

const small = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
} as const

function Settings({ me, round, claims }: { me: Me; round: number | null; claims: number }) {
  const sound = useSound()
  return (
    <ul className="hairline overflow-hidden rounded-[20px] bg-navy-800">
      <Row
        to="/me/edit"
        icon={
          <svg {...small}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        }
      >
        Edit photo, nickname &amp; kit colour
      </Row>
      <li className="border-t border-white/6">
        <button type="button" onClick={() => setSound(!sound)} aria-pressed={sound} className={row}>
          <span className="text-chalk-2">
            <svg {...small}>
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
      <Row
        to="/rules"
        icon={
          <svg {...small}>
            <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM8 7h8M8 11h6" />
          </svg>
        }
      >
        Rules
      </Row>
      {me.is_admin && round !== null && (
        <li className="border-t border-white/6">
          <Link to={`/admin/${round}`} className={`${row} text-gold`}>
            <svg {...small}>
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
          <svg {...small}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="flex-1 font-semibold">Sign out</span>
        </button>
      </li>
    </ul>
  )
}

type Data = {
  rounds: Round[]
  teams: Map<number, Team>
  picks: Pick[] // own only (RLS hides everyone else's before the lock; filtered to mine after)
  postponed: Set<number> // round ids where my pick survived a postponement (team given back)
  burned: number
  outIn: number | null // round number I went out in, if I'm out now
  boughtBack: boolean
  table: Standing[]
  payments: PaymentRow[]
}

async function load(me: string): Promise<Data> {
  const [rounds, teams, picks, results, burned, table, payments] = await Promise.all([
    supabase.from('rounds').select('*').order('number').returns<Round[]>(),
    supabase.from('teams').select('*').returns<Team[]>(),
    supabase.from('picks').select('round_id, player_id, team_id, is_auto').eq('player_id', me).returns<Pick[]>(),
    supabase.from('round_results').select('round_id, outcome').eq('player_id', me),
    supabase.from('burned_teams').select('id', { count: 'exact', head: true }).eq('player_id', me),
    loadTable(),
    loadPayments(),
  ])
  const rs = rounds.data ?? []
  const numberOf = new Map(rs.map((r) => [r.id, r.number]))
  const mine = table.find((s) => s.player_id === me)
  const outs = (results.data ?? []).filter((r) => r.outcome === 'out').map((r) => numberOf.get(r.round_id)!)
  return {
    rounds: rs,
    teams: new Map((teams.data ?? []).map((t) => [t.id, t])),
    picks: picks.data ?? [],
    postponed: new Set((results.data ?? []).filter((r) => r.outcome === 'survived_postponed').map((r) => r.round_id)),
    burned: burned.count ?? 0,
    outIn: mine?.alive === false && outs.length ? Math.max(...outs) : null,
    boughtBack:
      mine?.alive === true &&
      (payments.data ?? []).some((p) => p.player_id === me && p.kind === 'buyback' && p.status === 'confirmed'),
    table,
    payments: payments.data ?? [],
  }
}

const Stat = ({ value, label, gold }: { value: ReactNode; label: string; gold?: boolean }) => (
  <div className="hairline rounded-[18px] bg-navy-800 px-2.5 py-3.5 text-center">
    <p className={`disp text-[34px] leading-tight font-extrabold tabular-nums ${gold ? 'text-gold' : ''}`}>{value}</p>
    <p className="text-xs text-chalk-2">{label}</p>
  </div>
)

export default function MePage({ me }: { me: Me }) {
  const [data, setData] = useState<Data>()
  useEffect(() => {
    load(me.id).then(setData)
  }, [me.id])

  if (!data)
    return (
      <Shell title="Your profile">
        <Loading />
      </Shell>
    )

  const current = data.rounds.find((r) => !r.settled_at)?.number ?? null
  const rank = data.table.findIndex((s) => s.player_id === me.id) + 1
  const mine = data.table.find((s) => s.player_id === me.id)
  const used = new Set(data.picks.filter((p) => !data.postponed.has(p.round_id)).map((p) => p.team_id)).size
  const claims = data.payments.filter((p) => p.status === 'claimed').length

  return (
    <Shell title="Your profile">
      <div className="screen stagger flex flex-col gap-4">
        <section className="flex flex-col items-center gap-2.5 pt-1.5">
          <span className="rounded-full shadow-[0_18px_40px_rgba(0,0,0,.4)]">
            <Avatar p={me} size={112} />
          </span>
          <div className="text-center">
            <h1 className="disp text-[34px] leading-none font-extrabold">{me.nickname || me.name}</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {me.name}
              {me.is_admin && ' · Admin'}
            </p>
          </div>
          {data.boughtBack ? (
            <Pill colour="#f2b226" bg="rgba(242,178,38,.14)">
              Bought back
            </Pill>
          ) : data.outIn ? (
            <Pill colour="#ff8a8a" bg="rgba(255,138,138,.14)">
              Out · Round {data.outIn}
            </Pill>
          ) : (
            <Pill colour="#6fe3a1" dot="#3ccf7a" bg="rgba(60,207,122,.14)">
              Still standing
            </Pill>
          )}
        </section>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat value={mine?.points ?? 0} label="Points" gold />
          <Stat value={rank ? `#${rank}` : '–'} label={`of ${data.table.length} on the table`} />
          <Stat value={mine?.exact ?? 0} label="Exact scores" />
        </div>

        <section className="hairline flex flex-col gap-3 rounded-[20px] bg-navy-800 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="disp text-xl font-extrabold">Your road</h2>
            <span className="text-xs text-muted">
              {used} of 24 teams used{data.burned > 0 && ` · ${data.burned} burned`}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {data.rounds.map((r) => {
              const pick = data.picks.find((p) => p.round_id === r.id)
              const t = pick && data.teams.get(pick.team_id)
              const label = r.number <= 4 ? `R${r.number}` : r.name
              return t ? (
                <div
                  key={r.id}
                  className="flex flex-col items-center gap-1.5 rounded-[14px] px-1 py-2.5"
                  style={{ background: t.card_bg, color: t.card_text }}
                >
                  <span className="text-[11px] font-extrabold tracking-[.1em] opacity-80">{label}</span>
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white">
                    <img src={crestUrl(t)} alt="" className="h-[26px] w-[26px] object-contain" />
                  </span>
                  <span className="max-w-full truncate text-[11px] font-semibold">{t.name}</span>
                </div>
              ) : (
                <div
                  key={r.id}
                  className="flex flex-col items-center gap-1.5 rounded-[14px] bg-white/3 px-1 py-2.5 text-muted"
                >
                  <span className="text-[11px] font-extrabold tracking-[.1em] opacity-80">{label}</span>
                  <span className="h-[34px] w-[34px] rounded-full border border-dashed border-white/25" />
                  <span className="text-[11px] font-semibold">—</span>
                </div>
              )
            })}
          </div>
        </section>

        <Settings me={me} round={current} claims={claims} />
      </div>
    </Shell>
  )
}

function Pill({ children, colour, bg, dot }: { children: ReactNode; colour: string; bg: string; dot?: string }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold"
      style={{ background: bg, color: colour }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: dot ?? colour }} />
      {children}
    </span>
  )
}
