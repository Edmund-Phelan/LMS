import { supabase, type Player } from './lib/supabase'
import { Avatar } from './Profile'

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

const entryOf = (ps: PaymentRow[], id: string) => ps.find((p) => p.player_id === id && p.kind === 'entry')

export function PaidBadge({ payments, playerId }: { payments: PaymentRow[]; playerId: string }) {
  const status = entryOf(payments, playerId)?.status
  if (status === 'confirmed') return <span className="rounded bg-green-100 px-2 text-sm text-green-800">Paid</span>
  if (status === 'claimed') return <span className="rounded bg-amber-100 px-2 text-sm text-amber-800">Pending</span>
  return <span className="rounded bg-gray-100 px-2 text-sm text-gray-600">Not paid</span>
}

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
    <section className="mb-6 rounded border p-3">
      <h2 className="mb-2 font-semibold">Entry: €10</h2>
      {status === 'claimed' ? (
        <p>Thanks. Pending until Eddie or Conn confirms it. No confirmed payment = not in the comp.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <a
            href={REVOLUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-black px-4 py-3 text-white"
          >
            Pay €10 on Revolut
          </a>
          <button
            onClick={() => run(supabase.from('payments').insert({ player_id: me, kind: 'entry', amount_eur: 10 }))}
            className="rounded border px-4 py-3"
          >
            I’ve paid
          </button>
        </div>
      )}
    </section>
  )
}

export function PlayerList({
  players,
  payments,
  alive,
  name,
}: {
  players: Player[]
  payments: PaymentRow[]
  alive: Map<string, boolean | null>
  name: (id: string) => string
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">Who’s in</h2>
      <ul className="flex flex-col divide-y divide-gray-200 rounded-xl border border-gray-200">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2">
            <Avatar p={p} size={32} />
            <span className="flex-1">{name(p.id)}</span>
            {alive.get(p.id) === false && <span className="text-sm font-bold text-red-600">OUT</span>}
            <PaidBadge payments={payments} playerId={p.id} />
          </li>
        ))}
      </ul>
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
