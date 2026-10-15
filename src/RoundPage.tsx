import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import {
  crestUrl,
  irishTime,
  supabase,
  type Match,
  type Pick,
  type Player,
  type Round,
  type Team,
} from './lib/supabase'

/** Lowest unsettled round. */
export function CurrentRound() {
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
  if (n === null) return <p className="p-6">No rounds left.</p>
  return <Navigate to={`/round/${n}`} replace />
}

type Data = {
  round: Round
  teams: Map<number, Team>
  matches: Match[]
  players: Player[]
  picks: Pick[] // own only before the lock (RLS), everyone's after
  used: Map<number, number> // team_id → round number it was used/burned in
  alive: Map<string, boolean | null>
  prediction: { home_score: number; away_score: number } | null
  predictions: { player_id: string; home_score: number; away_score: number }[]
  jinxes: { jinxer_id: string; target_id: string }[]
}

async function load(number: number): Promise<Data | null> {
  const { data: round } = await supabase.from('rounds').select('*').eq('number', number).maybeSingle<Round>()
  if (!round) return null
  const [teams, matches, players, picks, used, status, predictions, jinxes] = await Promise.all([
    supabase.from('teams').select('*').returns<Team[]>(),
    supabase.from('matches').select('*').eq('round_id', round.id).order('kickoff_at').returns<Match[]>(),
    supabase.from('players').select('id, name, nickname, is_admin').order('name').returns<Player[]>(),
    supabase.from('picks').select('round_id, player_id, team_id, is_auto').eq('round_id', round.id).returns<Pick[]>(),
    supabase.rpc('my_used_teams', { r: round.id }),
    supabase.rpc('round_status', { r: round.id }),
    supabase.from('predictions').select('player_id, home_score, away_score').eq('round_id', round.id),
    supabase.from('jinxes').select('jinxer_id, target_id').eq('round_id', round.id),
  ])
  const me = (await supabase.auth.getUser()).data.user?.id
  return {
    round,
    teams: new Map((teams.data ?? []).map((t) => [t.id, t])),
    matches: matches.data ?? [],
    players: players.data ?? [],
    picks: picks.data ?? [],
    used: new Map(
      ((used.data ?? []) as { team_id: number; round_number: number }[]).map((u) => [u.team_id, u.round_number]),
    ),
    alive: new Map(
      ((status.data ?? []) as { player_id: string; alive: boolean | null }[]).map((s) => [s.player_id, s.alive]),
    ),
    prediction: predictions.data?.find((p) => p.player_id === me) ?? null,
    predictions: predictions.data ?? [],
    jinxes: jinxes.data ?? [],
  }
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function countdown(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s % 60}s`
}

export default function RoundPage({ me }: { me: string }) {
  const number = Number(useParams().number)
  const [data, setData] = useState<Data | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const now = useNow()
  const reload = useCallback(() => load(number).then(setData), [number])
  useEffect(() => {
    reload()
  }, [reload])

  // The phone clock only decides what to show; the server decides what's allowed.
  const locked = data ? now >= Date.parse(data.round.lock_at) : false
  useEffect(() => {
    if (locked) reload()
  }, [locked, reload])

  if (data === undefined) return <p className="p-6">Loading…</p>
  if (data === null)
    return (
      <p className="p-6">
        No such round.{' '}
        <Link to="/" className="underline">
          Back
        </Link>
      </p>
    )

  const { round, teams, matches, players } = data
  const myAlive = data.alive.get(me)
  const myPick = data.picks.find((p) => p.player_id === me)
  const featured = matches.find((m) => m.id === round.featured_match_id)
  const name = (id: string) => {
    const p = players.find((p) => p.id === id)
    return p?.nickname || p?.name || '?'
  }

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null)
    const { error } = await p
    if (error) setError(error.message)
    await reload()
  }

  return (
    <main className="mx-auto max-w-lg p-4 pb-16">
      <nav className="mb-4 flex justify-between text-sm">
        {number > 1 ? (
          <Link to={`/round/${number - 1}`} className="underline">
            ← Round {number - 1}
          </Link>
        ) : (
          <span />
        )}
        <span className="flex gap-4">
          {players.find((p) => p.id === me)?.is_admin && (
            <Link to={`/admin/${number}`} className="underline">
              Admin
            </Link>
          )}
          <button onClick={() => supabase.auth.signOut()} className="underline">
            Sign out
          </button>
        </span>
        <Link to={`/round/${number + 1}`} className="underline">
          Round {number + 1} →
        </Link>
      </nav>

      <h1 className="text-2xl font-bold">{round.name}</h1>
      <p className="mb-4 text-gray-600">
        {locked ? 'Locked' : 'Locks'} {irishTime(round.lock_at)} (Irish time)
        {!locked && (
          <>
            {' '}
            · <strong>{countdown(Date.parse(round.lock_at) - now)}</strong> to go
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}

      {locked ? (
        <Reveal data={data} name={name} />
      ) : (
        <>
          {myAlive === null && <p className="mb-4">Waiting for the previous round to be settled.</p>}
          {myAlive === true && (
            <section className="mb-6">
              <h2 className="mb-2 font-semibold">
                Your pick {myPick ? `: ${teams.get(myPick.team_id)?.name}` : '(none yet)'}
              </h2>
              <ul className="flex flex-col gap-3">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded border p-2">
                    {[m.home_team_id, m.away_team_id].map((tid, i) => {
                      const t = teams.get(tid)!
                      const usedIn = data.used.get(tid)
                      const chosen = myPick?.team_id === tid
                      return (
                        <button
                          key={tid}
                          disabled={usedIn !== undefined}
                          onClick={() => run(supabase.rpc('make_pick', { p_round_id: round.id, p_team_id: tid }))}
                          className={`flex flex-1 flex-col items-center gap-1 rounded p-2 disabled:opacity-30 ${chosen ? 'ring-4' : ''}`}
                          style={{ background: t.primary, color: t.text }}
                          aria-pressed={chosen}
                        >
                          <img src={crestUrl(t)} alt="" className="h-12 w-12" />
                          <span>
                            {t.name}
                            {i === 0 ? ' (H)' : ' (A)'}
                          </span>
                          {usedIn !== undefined && <span className="text-xs">used R{usedIn}</span>}
                        </button>
                      )
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {myAlive === false && (
            <JinxPicker
              current={data.jinxes.find((j) => j.jinxer_id === me)?.target_id}
              survivors={players.filter((p) => data.alive.get(p.id) === true)}
              name={name}
              onPick={(target) =>
                run(
                  supabase
                    .from('jinxes')
                    .upsert(
                      { round_id: round.id, jinxer_id: me, target_id: target },
                      { onConflict: 'round_id,jinxer_id' },
                    ),
                )
              }
            />
          )}
          {featured && (
            <Prediction
              key={JSON.stringify(data.prediction)}
              label={`${teams.get(featured.home_team_id)?.name} v ${teams.get(featured.away_team_id)?.name}`}
              initial={data.prediction}
              onSave={(home_score, away_score) =>
                run(
                  supabase
                    .from('predictions')
                    .upsert(
                      { round_id: round.id, player_id: me, home_score, away_score },
                      { onConflict: 'round_id,player_id' },
                    ),
                )
              }
            />
          )}
        </>
      )}
    </main>
  )
}

function JinxPicker({
  current,
  survivors,
  name,
  onPick,
}: {
  current?: string
  survivors: Player[]
  name: (id: string) => string
  onPick: (id: string) => void
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">You’re out. Jinx a survivor:</h2>
      <select
        value={current ?? ''}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="w-full rounded border p-3"
      >
        <option value="">Choose…</option>
        {survivors.map((p) => (
          <option key={p.id} value={p.id}>
            {name(p.id)}
          </option>
        ))}
      </select>
    </section>
  )
}

function Prediction({
  label,
  initial,
  onSave,
}: {
  label: string
  initial: { home_score: number; away_score: number } | null
  onSave: (h: number, a: number) => void
}) {
  const [home, setHome] = useState(initial?.home_score?.toString() ?? '')
  const [away, setAway] = useState(initial?.away_score?.toString() ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(Number(home), Number(away))
  }
  const input = 'w-20 rounded border p-3 text-center text-xl'
  return (
    <form onSubmit={submit} className="mb-6">
      <h2 className="mb-2 font-semibold">Predict the score: {label}</h2>
      <div className="flex items-center gap-2">
        <input
          aria-label="Home score"
          inputMode="numeric"
          required
          pattern="[0-9]+"
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className={input}
        />
        <span>–</span>
        <input
          aria-label="Away score"
          inputMode="numeric"
          required
          pattern="[0-9]+"
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className={input}
        />
        <button className="rounded bg-black px-4 py-3 text-white">Save</button>
      </div>
    </form>
  )
}

// Visible only after the lock, because that's when RLS starts returning everyone's rows.
function Reveal({ data, name }: { data: Data; name: (id: string) => string }) {
  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Picks</h2>
        <ul className="flex flex-col gap-2">
          {data.picks.map((p) => {
            const t = data.teams.get(p.team_id)!
            return (
              <li
                key={p.player_id}
                className="flex items-center gap-3 rounded p-2"
                style={{ background: t.primary, color: t.text }}
              >
                <img src={crestUrl(t)} alt="" className="h-8 w-8" />
                <span className="flex-1">{name(p.player_id)}</span>
                <span>
                  {t.name}
                  {p.is_auto && ' (auto)'}
                </span>
              </li>
            )
          })}
        </ul>
        {data.picks.length === 0 && <p>No picks yet. Auto-picks land within a minute of the lock.</p>}
      </section>
      {data.jinxes.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Jinxes</h2>
          <ul>
            {data.jinxes.map((j) => (
              <li key={j.jinxer_id}>
                {name(j.jinxer_id)} jinxed {name(j.target_id)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.predictions.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Predictions</h2>
          <ul>
            {data.predictions.map((p) => (
              <li key={p.player_id}>
                {name(p.player_id)}: {p.home_score}–{p.away_score}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
