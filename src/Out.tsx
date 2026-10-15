import { useEffect, useState, type ReactNode } from 'react'
import * as A from './adminData'
import * as E from './engine/engine'
import type { Knockout } from './Elimination'
import { crestUrl, lockLabel, supabase, type Round, type Team } from './lib/supabase'
import { REVOLUT_URL, type PaymentRow } from './Pay'
import { loadTable, rankOf } from './points'

// The out player's Round screen (docs/UI-REDESIGN.md §17): red hero, Get back in, Still playing for the 20%.

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-black/30 px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap">{children}</span>
)

export function OutHero({
  ko,
  stillIn,
  pot,
  onReplay,
}: {
  ko: Knockout
  stillIn: number
  pot: number
  onReplay: () => void
}) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl px-[18px] py-5 shadow-[inset_0_0_0_1px_rgba(255,138,138,.25)]"
      style={{ background: 'repeating-linear-gradient(90deg, #3a1020 0 12.5%, #2e0c19 12.5% 25%)' }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% -20%, rgba(255,90,95,.25), transparent 60%)' }}
      />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden
          className="h-[46px] w-[34px] rotate-[-8deg] rounded-[5px] bg-[#e11d2e] shadow-[0_8px_20px_rgba(0,0,0,.4)]"
        />
        <p className="disp mt-1 text-[40px] leading-[.95] font-extrabold uppercase">You’re out</p>
        <p className="text-sm opacity-90">{[ko.round.name, ko.line, ko.reason].filter(Boolean).join(' · ')}</p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          <Chip>{stillIn} still in</Chip>
          <Chip>
            Pot <span className="shimmer font-extrabold">€{pot}</span>
          </Chip>
          <button
            type="button"
            onClick={onReplay}
            className="press rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-semibold"
          >
            Replay
          </button>
        </div>
      </div>
    </section>
  )
}

type Cost = { burns: number[]; used: number[]; buybackUsed: boolean }

/** Rule 11 costs for coming back in `round`, from the engine (Q8: the same burns the settle will apply). */
async function loadCost(me: string, number: number): Promise<Cost | null> {
  const d = await A.load(number)
  if (!d) return null
  const r = A.toRound(d.round)
  const st = E.playerState(d.history, me, r)
  let burns: number[] = []
  try {
    burns = E.reentryBurns(d.history, me, r, 'buyback_penalty').map((b) => b.teamId)
  } catch {
    // a round without its tiebreak draw (shouldn't happen once settled): show no burn chips rather than break
  }
  return { burns, used: [...st.used].filter((t) => !burns.includes(t)), buybackUsed: st.buybackUsed }
}

function TeamChip({ team, burned }: { team: Team; burned?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-[5px] text-xs font-bold ${burned ? 'bg-[#ff5a5f]/14 text-out-text' : 'bg-white/6 text-muted'}`}
    >
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white">
        <img src={crestUrl(team)} alt="" className="h-4 w-4 object-contain" />
      </span>
      <span className={burned ? 'line-through' : ''}>{team.name}</span> · {burned ? 'burned' : 'used'}
    </span>
  )
}

export function GetBackIn({
  me,
  ko,
  round,
  teams,
  payments,
  now,
  run,
}: {
  me: string
  ko: Knockout
  round: Round
  teams: Map<number, Team>
  payments: PaymentRow[]
  now: number
  run: (p: PromiseLike<{ error: { message: string } | null }>) => void
}) {
  const [cost, setCost] = useState<Cost | null>()
  useEffect(() => {
    loadCost(me, round.number).then(setCost, () => setCost(null))
  }, [me, round.number])

  const lock = Date.parse(round.lock_at)
  const buyback = payments.find((p) => p.player_id === me && p.kind === 'buyback')
  // Rule 11: pool stage only, one per player, before this round's lock. Rule 12: Round 4 only, not if out in Round 4.
  const canBuy = round.stage === 'pool' && now < lock && cost && !cost.buybackUsed
  const canResurrect = round.number <= 4 && ko.round.number < 4
  if (cost === undefined || (!canBuy && !buyback && !canResurrect)) return null
  const days = Math.ceil((lock - now) / 86_400_000)

  return (
    <section className="flex flex-col gap-3.5 rounded-[22px] bg-navy-800 p-[18px] shadow-[inset_0_0_0_1px_rgba(242,178,38,.4)]">
      <div className="flex items-baseline justify-between">
        <h2 className="disp text-2xl font-extrabold">Get back in</h2>
        {canBuy && <span className="text-xs font-bold text-gold">{days > 1 ? `${days} DAYS LEFT` : 'LAST DAY'}</span>}
      </div>
      {(canBuy || buyback) && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-navy-900 p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="disp flex-1 text-xl font-extrabold">Buy back · €10</span>
            <span className="rounded-full bg-gold/16 px-2 py-[3px] text-[10px] font-extrabold tracking-[.08em] text-gold">
              ONE PER PERSON
            </span>
          </div>
          {buyback?.status === 'confirmed' ? (
            <p className="pop rounded-[14px] bg-in/14 p-3 text-center font-bold text-in-text">
              Buy-back confirmed. You’re back in for {round.name}.
            </p>
          ) : (
            <>
              <p className="text-[13px] leading-[1.4] text-chalk-2">
                Pay before the {round.name} lock, {lockLabel(round.lock_at, ' ')}, and you pick in {round.name}. Used
                teams stay used
                {cost?.burns.length ? ', and you also lose:' : '.'}
              </p>
              {cost && cost.burns.length + cost.used.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {cost.burns.map((t) => teams.get(t) && <TeamChip key={t} team={teams.get(t)!} burned />)}
                  {cost.used.map((t) => teams.get(t) && <TeamChip key={t} team={teams.get(t)!} />)}
                </div>
              )}
              {buyback ? (
                <p className="pop rounded-[14px] bg-blue/16 p-3 text-center font-bold text-blue-text">
                  Claim sent. Back in once Eddie or Conn confirms.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={REVOLUT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press flex h-[50px] items-center justify-center rounded-[14px] bg-gold font-extrabold text-navy-900"
                  >
                    Buy back for €10
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      run(supabase.from('payments').insert({ player_id: me, kind: 'buyback', amount_eur: 10 }))
                    }
                    className="press h-[50px] rounded-[14px] border border-white/16 font-bold"
                  >
                    I’ve paid
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {canResurrect && (
        <div className="flex items-start gap-3 rounded-2xl bg-white/3 p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9cc3ec"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="mt-0.5 shrink-0"
          >
            <path d="M12 3v6M9 6l3-3 3 3M5 21h14M7 21v-6a5 5 0 0 1 10 0v6" />
          </svg>
          <div className="flex-1">
            <p className="disp text-lg font-extrabold">
              Resurrection · Round 4 <span className="font-sans text-[11px] font-bold text-blue-text">FRI 15 JAN</span>
            </p>
            <p className="mt-0.5 text-[13px] leading-[1.4] text-muted">
              Free. One away team you haven’t used. Win and you’re back for the knockouts, at the same team cost as a
              buy-back.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'))

export function StillPlaying({ me, round, drawn }: { me: string; round: Round; drawn: boolean }) {
  const [pos, setPos] = useState<{ points: number; rank: number }>()
  useEffect(() => {
    loadTable().then((t) => {
      const i = t.findIndex((s) => s.player_id === me)
      setPos(i < 0 ? { points: 0, rank: 0 } : { points: t[i].points, rank: rankOf(t, i) })
    })
  }, [me])
  return (
    <section className="hairline flex items-center gap-3 rounded-[22px] bg-navy-800 px-[18px] py-4">
      <span className="disp flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/14 text-xl font-extrabold text-gold">
        {pos?.points ?? '–'}
      </span>
      <div className="flex-1">
        <p className="font-bold">Still playing for the 20%</p>
        <p className="text-[13px] text-muted">
          {pos &&
            `You’re on ${pos.points} point${pos.points === 1 ? '' : 's'}${pos.rank ? `, ${ordinal(pos.rank)}` : ''}. `}
          {drawn
            ? 'Predict the featured match below.'
            : `${round.name}’s featured match is drawn when the round opens.`}{' '}
          Everyone predicts, in or out.
        </p>
      </div>
    </section>
  )
}
