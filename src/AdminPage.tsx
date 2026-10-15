import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import * as E from './engine/engine'
import { load, must, runEngine, shuffle, toMatch, toResult, toRound, type Data, type Preview } from './adminData'
import { irishTime, supabase, type Match } from './lib/supabase'

// Admin: open a round (clean slate / no teams left), enter results, settle (engine preview → confirm).
// The engine runs here in the browser; settle_round() writes its output in one transaction.

const OUTCOME: Record<E.Outcome, string> = {
  through: 'Through',
  out: 'OUT',
  survived_postponed: 'Survives (postponed)',
  clean_slate: 'Clean slate',
  reinstated: 'Back in (resurrection)',
  already_out: 'Already out',
}

export default function AdminPage() {
  const param = useParams().number
  const [data, setData] = useState<Data | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const number = Number(param)
  const reload = useCallback(
    () =>
      load(number)
        .then(setData)
        .catch((e: Error) => setError(e.message)),
    [number],
  )
  useEffect(() => {
    if (param) reload()
  }, [param, reload])

  if (!param) return <CurrentAdminRound />
  if (data === undefined) return <p className="p-6">{error ?? 'Loading…'}</p>
  if (data === null) return <p className="p-6">No such round.</p>
  if (!data.me?.is_admin) return <p className="p-6">Admins only.</p>

  const name = (id: string) => {
    const p = data.players.find((p) => p.id === id)
    return p?.nickname || p?.name || '?'
  }
  const teamName = (id: number) => data.teams.get(id)?.name ?? `team ${id}`
  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    const { error } = await p
    if (error) setError(error.message)
    await reload()
  }
  const { round } = data

  return (
    <main className="mx-auto max-w-2xl p-4 pb-16">
      <nav className="mb-4 flex justify-between text-sm">
        <Link to={`/admin/${number - 1}`} className="underline">
          ← Round {number - 1}
        </Link>
        <Link to={`/round/${number}`} className="underline">
          Player view
        </Link>
        <Link to={`/admin/${number + 1}`} className="underline">
          Round {number + 1} →
        </Link>
      </nav>
      <h1 className="text-2xl font-bold">Admin: {round.name}</h1>
      <p className="mb-4 text-gray-600">
        Lock {irishTime(round.lock_at)} (Irish time) ·{' '}
        {round.settled_at ? `settled ${irishTime(round.settled_at)}` : 'not settled'}
      </p>
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}

      {!round.settled_at && <OpenPanel data={data} name={name} run={run} />}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Results</h2>
        <ul className="flex flex-col gap-3">
          {data.matches.map((m) => (
            <MatchForm
              key={`${m.id}-${m.status}-${m.home_score}-${m.away_score}-${m.winner_team_id}`}
              m={m}
              knockout={round.stage !== 'pool'}
              teamName={teamName}
              locked={!!round.settled_at}
              onSave={(patch) => run(supabase.from('matches').update(patch).eq('id', m.id))}
            />
          ))}
        </ul>
      </section>

      {round.settled_at ? (
        <Settled data={data} name={name} teamName={teamName} reload={reload} />
      ) : (
        <SettlePanel data={data} name={name} teamName={teamName} number={number} reload={reload} />
      )}
    </main>
  )
}

function CurrentAdminRound() {
  const [n, setN] = useState<number | null>()
  useEffect(() => {
    supabase
      .from('rounds')
      .select('number')
      .is('settled_at', null)
      .order('number')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setN(data?.number ?? null))
  }, [])
  if (n === undefined) return <p className="p-6">Loading…</p>
  if (n === null) return <p className="p-6">Every round is settled.</p>
  return <Navigate to={`/admin/${n}`} replace />
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>) => Promise<void>

/** Q1/Q2: when the fixtures are in, store the clean slate flag and show who's out with no teams left. */
function OpenPanel({ data, name, run }: { data: Data; name: (id: string) => string; run: Run }) {
  const { round, prev } = data
  let o: ReturnType<typeof E.openRound> | undefined
  let problem: string | undefined
  if (prev && !prev.settled_at) problem = `Settle ${prev.name} first.`
  else {
    try {
      o = E.openRound(data.history, toRound(round), data.matches.map(toMatch))
    } catch (e) {
      problem = (e as Error).message
    }
  }
  const body = o ? (
    <>
      <p>
        {o.cleanSlate
          ? 'Everyone still in has no team left: clean slate for all of them.'
          : o.noTeamsLeft.length
            ? `Out, no teams left: ${o.noTeamsLeft.map(name).join(', ')}.`
            : 'Everyone still in has a team to pick.'}
      </p>
      {o.cleanSlate !== round.clean_slate && (
        <button
          onClick={() => run(supabase.from('rounds').update({ clean_slate: o.cleanSlate }).eq('id', round.id))}
          className="mt-2 rounded bg-black px-4 py-2 text-white"
        >
          Save: clean slate {o.cleanSlate ? 'on' : 'off'}
        </button>
      )}
    </>
  ) : (
    <p>{problem}</p>
  )
  return (
    <section className="mb-6 rounded border p-3">
      <h2 className="mb-2 text-lg font-semibold">Round open</h2>
      {body}
    </section>
  )
}

type MatchPatch = Pick<Match, 'status' | 'home_score' | 'away_score' | 'winner_team_id'>

function MatchForm({
  m,
  knockout,
  teamName,
  locked,
  onSave,
}: {
  m: Match
  knockout: boolean
  teamName: (id: number) => string
  locked: boolean
  onSave: (patch: MatchPatch) => void
}) {
  const [status, setStatus] = useState(m.status)
  const [home, setHome] = useState(m.home_score?.toString() ?? '')
  const [away, setAway] = useState(m.away_score?.toString() ?? '')
  const [winner, setWinner] = useState(m.winner_team_id?.toString() ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const completed = status === 'completed'

  function submit(e: FormEvent) {
    e.preventDefault()
    const [h, a, w] = [Number(home), Number(away), Number(winner)]
    if (completed && knockout && h !== a && w !== (h > a ? m.home_team_id : m.away_team_id))
      return setProblem('The winner must be the team with the higher score.')
    setProblem(null)
    onSave({
      status,
      home_score: completed ? h : null,
      away_score: completed ? a : null,
      winner_team_id: completed && knockout ? w : null,
    })
  }
  const input = 'w-16 rounded border p-2 text-center'
  return (
    <li className="rounded border p-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <span className="w-full font-medium">
          {teamName(m.home_team_id)} v {teamName(m.away_team_id)}{' '}
          <span className="text-sm font-normal text-gray-600">{irishTime(m.kickoff_at)}</span>
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Match['status'])}
          disabled={locked}
          className="rounded border p-2"
        >
          {['scheduled', 'completed', 'postponed', 'abandoned'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {completed && (
          <>
            <input
              aria-label="Home score"
              inputMode="numeric"
              required
              pattern="[0-9]+"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              disabled={locked}
              className={input}
            />
            –
            <input
              aria-label="Away score"
              inputMode="numeric"
              required
              pattern="[0-9]+"
              value={away}
              onChange={(e) => setAway(e.target.value)}
              disabled={locked}
              className={input}
            />
            {knockout && (
              <select
                aria-label="Goes through"
                required
                value={winner}
                onChange={(e) => setWinner(e.target.value)}
                disabled={locked}
                className="rounded border p-2"
              >
                <option value="">Goes through…</option>
                {[m.home_team_id, m.away_team_id].map((t) => (
                  <option key={t} value={t}>
                    {teamName(t)}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {!locked && <button className="rounded bg-black px-3 py-2 text-white">Save</button>}
        {problem && <span className="w-full text-red-800">{problem}</span>}
      </form>
    </li>
  )
}

type Names = { data: Data; name: (id: string) => string; teamName: (id: number) => string }

function SettlePanel({ data, name, teamName, number, reload }: Names & { number: number; reload: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function makePreview() {
    setError(null)
    try {
      // UI only; settle_round checks the server clock.
      if (Date.now() < Date.parse(data.round.lock_at)) throw new Error('Picks are still open. Settle after the lock.')
      setPreview(runEngine(data, shuffle([...data.teams.keys()])))
    } catch (e) {
      setPreview(null)
      setError((e as Error).message)
    }
  }

  async function confirm(p: Preview) {
    setBusy(true)
    setError(null)
    try {
      // Re-run on fresh data with the same draw: if anything changed since the preview, stop.
      const fresh = await load(number)
      if (!fresh || JSON.stringify(runEngine(fresh, p.draw)) !== JSON.stringify(p))
        throw new Error('Something changed since the preview. Preview again.')
      must(
        await supabase.rpc('settle_round', {
          p_round_id: data.round.id,
          p_tiebreak: p.draw,
          p_results: p.roundResults.map((r) => ({
            player_id: r.playerId,
            outcome: r.outcome,
            prediction_points: r.predictionPoints,
            exact_score: r.exactScore,
            jinx_points: r.jinxPoints,
          })),
          p_burns: p.newBurnedTeams.map((b) => ({ player_id: b.playerId, team_id: b.teamId, reason: b.reason })),
        }),
      )
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Settle</h2>
      <button onClick={makePreview} className="rounded border px-4 py-2">
        {preview ? 'Preview again (new draw)' : 'Preview'}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}
      {preview && (
        <>
          <Outcomes
            data={data}
            name={name}
            teamName={teamName}
            results={preview.roundResults}
            burns={preview.newBurnedTeams}
            burnOrder={preview.burnOrder}
          />
          <p className="mb-2">Still in: {preview.stillIn.map(name).join(', ') || 'nobody'}</p>
          {preview.winners && (
            <p className="mb-2 font-semibold">
              Winner{preview.winners.length > 1 ? 's (split)' : ''}: {preview.winners.map(name).join(', ')}
            </p>
          )}
          <button
            onClick={() => confirm(preview)}
            disabled={busy}
            className="rounded bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Settling…' : `Confirm and settle ${data.round.name}`}
          </button>
        </>
      )}
    </section>
  )
}

function Settled({ data, name, teamName, reload }: Names & { reload: () => void }) {
  const { round } = data
  const [error, setError] = useState<string | null>(null)

  async function unsettle() {
    const ok = window.confirm(
      `Unsettle ${round.name}? Its results and burns are deleted so you can correct and settle it again. ` +
        'Any picks and jinxes already made for the next round are cleared, and those players must pick again before the lock.',
    )
    if (!ok) return
    const { data: cleared, error } = await supabase.rpc('unsettle_round', { p_round_id: round.id })
    if (error) return setError(error.message)
    const { picks, jinxes } = cleared as { picks: number; jinxes: number }
    if (picks || jinxes)
      window.alert(`Cleared ${picks} pick(s) and ${jinxes} jinx(es) for the next round. Tell the group to pick again.`)
    reload()
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">Settled</h2>
      {error && (
        <p role="alert" className="mb-3 rounded bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}
      <Outcomes
        data={data}
        name={name}
        teamName={teamName}
        results={data.roundResults.map(toResult)}
        burns={data.roundBurns.map((b) => ({
          playerId: b.player_id,
          teamId: b.team_id,
          roundId: b.round_id,
          reason: b.reason,
        }))}
        burnOrder={round.tiebreak ? E.burnOrder(data.roundPicks, round.tiebreak) : []}
      />
      <button onClick={unsettle} className="rounded border border-red-700 px-4 py-2 text-red-700">
        Unsettle {round.name}
      </button>
    </section>
  )
}

function Outcomes({
  data,
  name,
  teamName,
  results,
  burns,
  burnOrder,
}: Names & { results: E.RoundResult[]; burns: E.BurnedTeam[]; burnOrder: number[] }) {
  const pickOf = (id: string) => data.roundPicks.find((p) => p.playerId === id)
  return (
    <>
      <table className="my-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1">Player</th>
            <th>Pick</th>
            <th>Outcome</th>
            <th>Pred</th>
            <th>Jinx</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const p = pickOf(r.playerId)
            return (
              <tr key={r.playerId} className="border-b">
                <td className="py-1">{name(r.playerId)}</td>
                <td>
                  {p ? teamName(p.teamId) : '—'}
                  {p?.isAuto && ' (auto)'}
                  {p?.isResurrection && ' (resurrection)'}
                </td>
                <td className={r.outcome === 'out' ? 'font-semibold text-red-700' : ''}>{OUTCOME[r.outcome]}</td>
                <td>
                  {r.predictionPoints}
                  {r.exactScore && ' ★'}
                </td>
                <td>{r.jinxPoints}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {burns.length > 0 && (
        <ul className="mb-2">
          {burns.map((b) => (
            <li key={`${b.playerId}-${b.teamId}`}>
              {name(b.playerId)} loses {teamName(b.teamId)} (
              {b.reason === 'buyback_penalty' ? 'buy-back' : 'resurrection'})
            </li>
          ))}
        </ul>
      )}
      {burnOrder.length > 0 && (
        <p className="mb-2 text-sm text-gray-600">Burn order: {burnOrder.map(teamName).join(' › ')}</p>
      )}
    </>
  )
}
