import { useEffect, useState } from 'react'
import { explainPoints, RULES_DOC, SECTIONS } from './data/rules'
import { lockLabel, supabase, type Round } from './lib/supabase'
import { Pushed } from './Shell'

// Rules (docs/UI-REDESIGN.md §10). Copy in src/data/rules.ts; the calculator scores with the engine.

const WEEKEND: Record<number, [string, string]> = {
  1: ['Round 1', '16–18 Oct'],
  2: ['Round 2', '11–13 Dec'],
  3: ['Round 3', '8–10 Jan'],
  4: ['Round 4', '15–17 Jan'],
  5: ['Round of 16', '2–4 Apr'],
  6: ['Quarter-finals', '9–11 Apr'],
  7: ['Semi-finals', '1–3 May'],
  8: ['Final', '22 May'],
}

const QUICK = [
  ['1 team', 'per round, to win'],
  ['Once', 'each team, all season'],
  ['Fri 8pm', 'picks lock (pool rounds)'],
  ['€10', 'in, before the Round 1 lock'],
]

function Calculator() {
  const [s, set] = useState({ ph: 30, pa: 15, ah: 27, aa: 17 })
  const pts = explainPoints(s.ph, s.pa, s.ah, s.aa)
  const colour = pts.n === 0 ? '#ff8a8a' : pts.n === 5 ? '#f2b226' : pts.n >= 2 ? '#6fe3a1' : '#f4f1e8'
  const btn = 'press h-8 w-[26px] rounded-lg bg-white/8'
  const cell = (k: keyof typeof s, label: string) => (
    <span className="flex items-center justify-center gap-1">
      <button
        type="button"
        className={btn}
        onClick={() => set({ ...s, [k]: Math.max(0, s[k] - 1) })}
        aria-label={`${label} down`}
      >
        −
      </button>
      <span className="disp w-[30px] text-center text-2xl font-extrabold tabular-nums">{s[k]}</span>
      <button
        type="button"
        className={btn}
        onClick={() => set({ ...s, [k]: Math.min(99, s[k] + 1) })}
        aria-label={`${label} up`}
      >
        +
      </button>
    </span>
  )
  return (
    <div className="mt-1.5 flex flex-col gap-3 rounded-2xl bg-navy-900 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      <p className="disp text-base font-extrabold tracking-[.1em] text-gold">TRY IT</p>
      <div className="grid grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
        <span />
        <span className="text-center text-[11px] font-bold text-muted">HOME</span>
        <span className="text-center text-[11px] font-bold text-muted">AWAY</span>
        <span className="text-[13px] font-bold">You said</span>
        {cell('ph', 'You said home')}
        {cell('pa', 'You said away')}
        <span className="text-[13px] font-bold">It ended</span>
        {cell('ah', 'It ended home')}
        {cell('aa', 'It ended away')}
      </div>
      <div className="flex items-center gap-3 border-t border-white/8 pt-2.5" aria-live="polite">
        <span key={pts.n} className="disp pop text-[44px] leading-none font-extrabold" style={{ color: colour }}>
          {pts.n}
        </span>
        <span className="text-[13px] leading-snug text-[#dde3f2]">{pts.why}</span>
      </div>
    </div>
  )
}

function LockTable() {
  const [rounds, setRounds] = useState<Round[]>([])
  useEffect(() => {
    supabase
      .from('rounds')
      .select('*')
      .order('number')
      .returns<Round[]>()
      .then(({ data }) => setRounds(data ?? []))
  }, [])
  return (
    <table className="mt-1 w-full border-collapse text-sm">
      <tbody>
        {Object.entries(WEEKEND).map(([n, [name, weekend]]) => {
          const r = rounds.find((r) => r.number === Number(n))
          return (
            <tr key={n} className="border-t border-white/6">
              <td className="py-2 font-bold">{name}</td>
              <td className="py-2 text-muted">{weekend}</td>
              <td className="py-2 text-right">{r?.lock_at ? lockLabel(r.lock_at, ', ') : 'TBC'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function RulesPage() {
  const [open, setOpen] = useState<string | null>('s1')
  return (
    <Pushed title="The rules" eyebrow="Champions Cup 26/27">
      <div className="screen stagger flex flex-col gap-4 pb-4">
        <section className="stripes relative overflow-hidden rounded-3xl px-5 py-[22px]">
          <p className="disp text-[32px] leading-[1.02] font-extrabold">
            Pick a winner. Every round. Lose or draw and you’re gone.
          </p>
          <p className="mt-2.5 text-sm opacity-85">
            Last one standing takes 80% of the pot. Agreed by the group, Oct 2026.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          {QUICK.map(([big, small]) => (
            <div key={big} className="hairline rounded-[18px] bg-navy-800 p-3.5">
              <p className="disp text-[28px] font-extrabold text-gold">{big}</p>
              <p className="mt-0.5 text-[13px] text-chalk-2">{small}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {SECTIONS.map((s, i) => {
            const isOpen = open === s.id
            return (
              <section
                key={s.id}
                className="overflow-hidden rounded-[18px] bg-navy-800 transition-shadow duration-300"
                style={{ boxShadow: `inset 0 0 0 1px ${isOpen ? 'rgba(242,178,38,.45)' : 'rgba(255,255,255,.06)'}` }}
              >
                <h2>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : s.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 p-3.5 text-left"
                  >
                    <span
                      className={`disp flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-base font-extrabold transition-colors ${isOpen ? 'bg-gold text-navy-900' : 'bg-white/7'}`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="disp block text-xl leading-[1.1] font-extrabold">{s.title}</span>
                      <span className="block text-xs text-muted">{s.sub}</span>
                    </span>
                    {s.isOpenRule && (
                      <span className="rounded-full bg-warn/16 px-2 py-0.5 text-[10px] font-extrabold tracking-[.08em] text-warn">
                        OPEN
                      </span>
                    )}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a8b3d1"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </h2>
                {isOpen && (
                  <div className="open-in flex flex-col gap-2.5 pr-4 pb-4 pl-14 text-[15px] leading-normal text-[#dde3f2]">
                    {s.paras.map((p) => (
                      <p key={p.lead}>
                        <strong className="text-chalk">{p.lead}</strong> {p.text}
                      </p>
                    ))}
                    {s.isMoney && (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <div className="flex h-[34px] overflow-hidden rounded-[10px] text-xs font-extrabold text-navy-900">
                          <span className="flex w-4/5 items-center bg-gold pl-2.5">80% LAST MAN</span>
                          <span className="flex w-1/5 items-center justify-center bg-in">20%</span>
                        </div>
                        <p className="text-[13px] text-muted">On 11 entries: €88 and €22. Buy-backs grow both.</p>
                      </div>
                    )}
                    {s.isPoints && <Calculator />}
                    {s.isLocks && <LockTable />}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        <a
          href={RULES_DOC}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-12 items-center justify-center gap-2 rounded-[14px] border border-white/14 font-semibold"
        >
          Full rules doc
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </div>
    </Pushed>
  )
}
