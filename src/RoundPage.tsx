import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { irishTime, supabase, type Match, type Pick, type Player, type Round, type Team } from './lib/supabase'
import { loadPayments, PayEntry, PlayerList, potEur, type PaymentRow } from './Pay'
import { FixtureList, Takeover, useThud } from './Pick'
import { RevealCards } from './Reveal'

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
  payments: PaymentRow[]
}

async function load(number: number): Promise<Data | null> {
  const { data: round } = await supabase.from('rounds').select('*').eq('number', number).maybeSingle<Round>()
  if (!round) return null
  const [teams, matches, players, picks, used, status, predictions, jinxes, payments] = await Promise.all([
    supabase.from('teams').select('*').returns<Team[]>(),
    supabase.from('matches').select('*').eq('round_id', round.id).order('kickoff_at').returns<Match[]>(),
    supabase.from('players').select('id, name, nickname, is_admin').order('name').returns<Player[]>(),
    supabase.from('picks').select('round_id, player_id, team_id, is_auto').eq('round_id', round.id).returns<Pick[]>(),
    supabase.rpc('my_used_teams', { r: round.id }),
    supabase.rpc('round_status', { r: round.id }),
    supabase.from('predictions').select('player_id, home_score, away_score').eq('round_id', round.id),
    supabase.from('jinxes').select('jinxer_id, target_id').eq('round_id', round.id),
    loadPayments(),
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
    payments: payments.data ?? [],
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

export function Hero({
  round,
  locked,
  ms,
  pot,
  stillIn,
}: {
  round: Round
  locked: boolean
  ms: number
  pot: number
  stillIn: number
}) {
  return (
    <header className="mb-6 overflow-hidden rounded-2xl bg-[#0f5132] bg-[repeating-linear-gradient(90deg,transparent_0_12.5%,rgba(0,0,0,.18)_12.5%_25%)] p-5 text-center text-[#f7f5ef]">
      <p className="text-xs font-bold tracking-[0.2em] text-[#f2b226] uppercase">BBB Last Man Standing</p>
      <h1 className="text-3xl font-black">{round.name}</h1>
      {locked ? (
        <p className="mt-3 text-lg font-bold">Picks locked {irishTime(round.lock_at)}</p>
      ) : (
        <>
          <Countdown ms={ms} />
          <p className="text-sm opacity-80">to the lock · {irishTime(round.lock_at)} Irish time</p>
        </>
      )}
      <p className="mt-4 inline-block rounded-full bg-black/25 px-4 py-1 text-sm">
        Pot <strong className="text-[#f2b226]">€{pot}</strong> · {stillIn} still in
      </p>
    </header>
  )
}

function Countdown({ ms }: { ms: number }) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const parts = [
    [Math.floor(s / 86400), 'days'],
    [Math.floor((s % 86400) / 3600), 'hrs'],
    [Math.floor((s % 3600) / 60), 'min'],
    [s % 60, 'sec'],
  ] as const
  return (
    <div className="mt-3 flex justify-center gap-2" role="timer">
      {parts.map(([n, unit]) => (
        <div key={unit} className="w-16 rounded-lg bg-black/30 py-2">
          <p className="text-3xl font-black tabular-nums">{String(n).padStart(2, '0')}</p>
          <p className="text-[10px] tracking-widest uppercase opacity-75">{unit}</p>
        </div>
      ))}
    </div>
  )
}

export default function RoundPage({ me }: { me: string }) {
  const number = Number(useParams().number)
  const [data, setData] = useState<Data | null | undefined>()
  const [error, setError] = useState<string | null>(null)
  const now = useNow()
  const thud = useThud()
  const [takeover, setTakeover] = useState<Team | null>(null)
  const endTakeover = useCallback(() => setTakeover(null), [])
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
      <Takeover team={takeover} onDone={endTakeover} />
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

      <Hero
        round={round}
        locked={locked}
        ms={Date.parse(round.lock_at) - now}
        pot={potEur(data.payments)}
        stillIn={players.filter((p) => data.alive.get(p.id) === true).length}
      />
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}
      <PayEntry me={me} payments={data.payments} run={run} />

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
              <FixtureList
                matches={matches}
                teams={teams}
                used={data.used}
                picked={myPick?.team_id}
                onPick={async (tid) => {
                  thud() // from the tap itself: iOS only allows haptics inside a user gesture
                  setError(null)
                  const { error } = await supabase.rpc('make_pick', { p_round_id: round.id, p_team_id: tid })
                  if (error) setError(error.message)
                  else setTakeover(teams.get(tid)!)
                  await reload()
                }}
              />
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
      <PlayerList players={players} payments={data.payments} alive={data.alive} name={name} />
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
        <RevealCards picks={data.picks} teams={data.teams} name={name} />
        {data.picks.length === 0 && (
          <p>{data.round.number === 1 ? 'No picks.' : 'No picks yet. Auto-picks land within a minute of the lock.'}</p>
        )}
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
