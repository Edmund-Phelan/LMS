import { supabase } from './lib/supabase'

// Payments (CLAUDE.md §6 Pay): pay Eddie on Revolut, tap "I've paid", an admin confirms.
export const REVOLUT_URL = 'https://revolut.me/eddie1apt'

export type PaymentRow = {
  id: number
  player_id: string
  kind: 'entry' | 'buyback'
  amount_eur: number
  status: 'claimed' | 'confirmed'
  claimed_at: string
}

export const loadPayments = () =>
  supabase
    .from('payments')
    .select('id, player_id, kind, amount_eur, status, claimed_at')
    .order('claimed_at')
    .returns<PaymentRow[]>()

/** Rule 10: the pot is every confirmed payment. */
export const potEur = (ps: PaymentRow[]) =>
  ps.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_eur), 0)

export const entryOf = (ps: PaymentRow[], id: string) => ps.find((p) => p.player_id === id && p.kind === 'entry')

/** The player's own entry: pay → "I've paid" → pending until an admin confirms. */
export function PayEntry({
  me,
  payments,
  run,
}: {
  me: string
  payments: PaymentRow[]
  run: (p: PromiseLike<{ error: { message: string } | null }>) => void
}) {
  const status = entryOf(payments, me)?.status
  if (status === 'confirmed') return null
  return (
    <section className="hairline flex flex-col gap-3 rounded-[20px] bg-navy-800 p-4 shadow-[inset_0_0_0_1px_rgba(255,179,92,.35)]">
      <div className="flex items-baseline justify-between">
        <h2 className="disp text-[22px] font-extrabold">Entry: €10</h2>
        <span className="text-xs font-bold text-warn">{status === 'claimed' ? 'PENDING' : 'NOT PAID'}</span>
      </div>
      {status === 'claimed' ? (
        <p className="text-sm text-chalk-2">
          Thanks. Pending until Eddie or Conn confirms it. No confirmed payment = not in the comp.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={REVOLUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press flex h-12 items-center justify-center rounded-[14px] bg-gold font-bold text-navy-900"
          >
            Pay €10 on Revolut
          </a>
          <button
            type="button"
            onClick={() => run(supabase.from('payments').insert({ player_id: me, kind: 'entry', amount_eur: 10 }))}
            className="press h-12 rounded-[14px] border border-white/16 font-bold"
          >
            I’ve paid
          </button>
        </div>
      )}
    </section>
  )
}
