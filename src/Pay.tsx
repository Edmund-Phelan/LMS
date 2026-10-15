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

/** Admin: confirm or reject claims. */
export function PaymentsAdmin({
  payments,
  name,
  run,
}: {
  payments: PaymentRow[]
  name: (id: string) => string
  run: (p: PromiseLike<{ error: { message: string } | null }>) => void
}) {
  const claims = payments.filter((p) => p.status === 'claimed')
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Payments · pot €{potEur(payments)}</h2>
      {claims.length === 0 && <p className="text-gray-600">No claims waiting.</p>}
      <ul className="flex flex-col gap-2">
        {claims.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded border p-2">
            <span className="flex-1">
              {name(p.player_id)}: €{Number(p.amount_eur)} {p.kind === 'buyback' ? 'buy-back' : 'entry'}
            </span>
            <button
              onClick={() => run(supabase.rpc('confirm_payment', { p_id: p.id }))}
              className="rounded bg-black px-3 py-2 text-white"
            >
              Confirm
            </button>
            <button
              onClick={() =>
                confirm(`Reject ${name(p.player_id)}'s claim?`) &&
                run(supabase.from('payments').delete().eq('id', p.id))
              }
              className="rounded border px-3 py-2"
            >
              Reject
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
