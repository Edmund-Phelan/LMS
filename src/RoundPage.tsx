import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import {
  crestUrl,
  lockLabel,
  supabase,
  type Match,
  type Pick,
  type Player,
  type Round,
  type Team,
} from './lib/supabase'
import { entryOf, loadPayments, PayEntry, potEur, type PaymentRow } from './Pay'
import { FixtureList, PickSheet, Takeover, useThud } from './Pick'
import { Avatar } from './Profile'
import { RevealCards } from './Reveal'
import Raffle from './Raffle'
import Shell, { Icon, Loading } from './Shell'
import { sfx } from './sound'
import { koReason, matchState, pickState, type PickState } from './live'
import { KnockedOut, loadKnockout, type Knockout } from './Elimination'
import { GetBackIn, OutHero, StillPlaying } from './Out'

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
  if (n === undefined) return <Loading />
  if (n === null) return <p className="p-6">No rounds left.</p>
  return <Navigate to={`/round/${n}`} replace />
}

type Data = {
  rounds: Round[]
  round: Round | null // null = not in the database yet (knockouts before they're announced)
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
  squad: { player_id: string; has_pick: boolean }[] // round_pick_status: never a team
  myOutcome: string | null // my round_results row for this round, once settled
  ko: Knockout | null // my latest elimination
}

async function load(number: number, me: string): Promise<Data> {
  const { data: rounds } = await supabase.from('rounds').select('*').order('number').returns<Round[]>()
  const round = rounds?.find((r) => r.number === number) ?? null
  const rid = round?.id ?? -1
  const [teams, matches, players, picks, used, status, predictions, jinxes, payments, squad, result, ko] =
    await Promise.all([
      supabase.from('teams').select('*').returns<Team[]>(),
      supabase.from('matches').select('*').eq('round_id', rid).order('kickoff_at').returns<Match[]>(),
      supabase
        .from('players')
        .select('id, name, nickname, is_admin, avatar_url, kit_colour')
        .order('name')
        .returns<Player[]>(),
      supabase.from('picks').select('round_id, player_id, team_id, is_auto').eq('round_id', rid).returns<Pick[]>(),
      supabase.rpc('my_used_teams', { r: rid }),
      supabase.rpc('round_status', { r: rid }),
      supabase.from('predictions').select('player_id, home_score, away_score').eq('round_id', rid),
      supabase.from('jinxes').select('jinxer_id, target_id').eq('round_id', rid),
      loadPayments(),
      supabase.rpc('round_pick_status', { r: rid }),
      supabase.from('round_results').select('outcome').eq('round_id', rid).eq('player_id', me).maybeSingle(),
      loadKnockout(me),
    ])
  return {
    rounds: rounds ?? [],
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
    squad: (squad.data ?? []) as Data['squad'],
    myOutcome: result.data?.outcome ?? null,
    ko,
  }
}

const lockedAtFmt = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'long',
})
/** "20:00 Friday" */
const lockedAt = (iso: string) => {
  const p = lockedAtFmt.formatToParts(new Date(iso))
  const v = (t: string) => p.find((x) => x.type === t)!.value
  return `${v('hour')}:${v('minute')} ${v('weekday')}`
}

export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Knockouts aren't in the database until they're announced; the pills still show the whole season.
const SEASON = [
  { number: 1, label: 'R1', sub: '16 Oct' },
  { number: 2, label: 'R2', sub: '11 Dec' },
  { number: 3, label: 'R3', sub: '8 Jan' },
  { number: 4, label: 'R4', sub: '15 Jan' },
  { number: 5, label: 'R16', sub: '2 Apr', title: 'Round of 16' },
  { number: 6, label: 'QF', sub: '9 Apr', title: 'Quarter-finals' },
  { number: 7, label: 'SF', sub: '1 May', title: 'Semi-finals' },
  { number: 8, label: 'Final', sub: '22 May', title: 'The Final' },
]

function RoundPills({ current }: { current: number }) {
  return (
    <nav aria-label="Rounds" className="scroll -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {SEASON.map((r) => {
        const cur = r.number === current
        return (
          <Link
            key={r.number}
            to={`/round/${r.number}`}
            replace
            aria-current={cur ? 'page' : undefined}
            className={`press flex h-[52px] min-w-[58px] shrink-0 flex-col items-center justify-center rounded-[14px] border px-2.5 ${cur ? 'border-gold bg-gold text-navy-900' : 'border-white/10 bg-white/4 text-chalk'}`}
          >
            <span className="disp text-[17px] leading-none font-extrabold">{r.label}</span>
            <span className="mt-[3px] text-[10px] font-semibold opacity-75">{r.sub}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function NotOpen({ title, body }: { title: string; body: string }) {
  return (
    <div className="pop flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-white/18 px-6 py-9 text-center">
      <span className="text-gold">{Icon.lock(34, 1.8)}</span>
      <p className="disp text-[26px] font-extrabold">{title}</p>
      <p className="max-w-[260px] text-sm text-muted">{body}</p>
    </div>
  )
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-black/30 px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap">{children}</span>
)

const kickoffFmt = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** §16 status chip for a pick after the lock. No feed, so live means "on now" (no score); results come from admins. */
function PickChip({ m, teamId, knockout, now }: { m: Match; teamId: number; knockout: boolean; now: number }) {
  const state = pickState(m, teamId, knockout, now)
  const home = teamId === m.home_team_id
  const score = home ? `${m.home_score}–${m.away_score}` : `${m.away_score}–${m.home_score}`
  const look: Record<PickState, [string, string]> = {
    locked: ['Locked in', 'bg-gold/16 text-gold'],
    later: [kickoffFmt.format(new Date(m.kickoff_at)).replace(',', ''), 'bg-white/8 text-chalk-2'],
    live: ['On now', 'bg-warn/18 text-warn'],
    waiting: ['Result due', 'bg-white/8 text-chalk-2'],
    through: [`Through · ${score}`, 'bg-in/16 text-in-text'],
    out: [`Out · ${score}`, 'bg-[#e5484d]/18 text-out-text'],
    back: ['Postponed · team back', 'bg-white/8 text-chalk-2'],
  }
  const [label, cls] = look[state]
  return (
    <span
      className={`pop inline-flex items-center gap-[5px] rounded-full px-2.5 py-[5px] text-xs font-bold whitespace-nowrap ${cls}`}
    >
      {state === 'live' && <span aria-hidden className="live-dot h-[7px] w-[7px] rounded-full bg-current" />}
      {label}
    </span>
  )
}

function Hero({
  round,
  locked,
  ms,
  pot,
  stillIn,
  picked,
}: {
  round: Round
  locked: boolean
  ms: number
  pot: number
  stillIn: number
  picked?: { n: number; of: number }
}) {
  return (
    <section className="stripes hairline relative overflow-hidden rounded-3xl px-[18px] pt-5 pb-[18px]">
      <div className="flex flex-col items-center gap-3">
        {locked ? (
          <div className="pop flex flex-col items-center gap-1.5 pt-1.5 pb-0.5 text-center">
            <span className="text-gold">{Icon.lock(34)}</span>
            <p className="disp text-[34px] leading-none font-extrabold">Picks are locked</p>
            <p className="text-[13px] opacity-80">Locked {lockLabel(round.lock_at)}. Flip the cards below.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <p className="disp text-[13px] font-bold tracking-[.22em] text-gold uppercase">Picks lock in</p>
            <Countdown ms={ms} />
            <p className="mt-3 text-[13px] opacity-80">{lockLabel(round.lock_at)} Irish time</p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Chip>
            Pot <span className="shimmer font-extrabold">€{pot}</span>
          </Chip>
          <Chip>{stillIn} still in</Chip>
          {picked && (
            <Chip>
              {picked.n}/{picked.of} {locked ? 'locked in' : 'picked'}
            </Chip>
          )}
        </div>
      </div>
    </section>
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
    <div
      className="mt-3 flex gap-2"
      role="timer"
      aria-label={`${parts.map(([n, u]) => `${n} ${u}`).join(' ')} to the lock`}
    >
      {parts.map(([n, unit]) => (
        <div key={unit} className="w-[70px] overflow-hidden rounded-[14px] bg-black/32 pt-2.5 pb-2 text-center">
          <p
            key={unit === 'sec' ? n : undefined}
            className={`disp text-[38px] leading-none font-extrabold tabular-nums ${unit === 'sec' ? (s % 2 ? 'sec-a' : 'sec-b') : ''}`}
          >
            {String(n).padStart(2, '0')}
          </p>
          <p className="mt-1 text-[10px] font-bold tracking-[.14em] uppercase opacity-70">{unit}</p>
        </div>
      ))}
    </div>
  )
}

/** §3.2. Never says "locked in" before the lock. */
function MyPick({
  team,
  locked,
  lockAt,
  round1,
  chip,
  knockedOut,
  onReplay,
}: {
  team?: Team
  locked: boolean
  lockAt: string
  round1: boolean
  chip?: ReactNode
  knockedOut?: string // §17: "Munster 20–20 Racing 92 · a draw is a loss"
  onReplay: () => void
}) {
  if (!team)
    return locked ? (
      <div className="flex items-center gap-3.5 rounded-[20px] border-2 border-dashed border-white/20 p-4">
        <span className="text-muted">{Icon.clock}</span>
        <div>
          <p className="disp text-[22px] font-extrabold">No pick</p>
          <p className="text-[13px] text-chalk-2">
            {round1
              ? 'You missed the Round 1 lock, so you’re not in this year.'
              : 'Your random team lands within a minute of the lock.'}
          </p>
        </div>
      </div>
    ) : (
      <div className="pulse flex items-center gap-3.5 rounded-[20px] border-2 border-dashed border-gold bg-gold/7 p-4">
        <span className="text-gold">{Icon.clock}</span>
        <div>
          <p className="disp text-[22px] font-extrabold">No pick yet</p>
          <p className="text-[13px] text-chalk-2">
            {round1
              ? 'No pick in Round 1 means no entry. Tap a team below.'
              : 'No pick by the lock gets you a random team you haven’t used.'}
          </p>
        </div>
      </div>
    )
  return (
    <button
      type="button"
      onClick={locked ? undefined : onReplay}
      disabled={locked}
      aria-label={locked ? `Locked in: ${team.name}` : `Your pick: ${team.name}. Tap to replay.`}
      className={`relative flex items-center gap-3.5 overflow-hidden rounded-[20px] px-4 py-3.5 text-left transition-shadow duration-500 ${locked ? 'pop' : 'press'}`}
      style={{
        background: team.primary,
        color: team.text,
        boxShadow: knockedOut
          ? '0 0 0 3px #e5484d, 0 0 34px rgba(229,72,77,.4)'
          : locked
            ? '0 0 0 3px #f2b226, 0 0 34px rgba(242,178,38,.45)'
            : 'none',
      }}
    >
      <span
        aria-hidden
        className="absolute -top-5 -right-[30px] h-[140px] w-[140px] rounded-full opacity-18"
        style={{ background: team.secondary }}
      />
      <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white">
        <img src={crestUrl(team)} alt="" className="h-[38px] w-[38px] object-contain" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-[5px] text-[11px] font-bold tracking-[.16em] uppercase opacity-85">
          {locked && !knockedOut && Icon.lock(12, 3)}
          {knockedOut ? 'Knocked out' : locked ? 'Locked in' : 'Your pick'}
        </span>
        <span className="disp block text-[26px] leading-[1.05] font-extrabold">{team.name}</span>
        <span className="block text-xs opacity-80">
          {knockedOut ?? (locked ? `Locked at ${lockAt}. Good luck.` : 'Change it any time before the lock')}
        </span>
        {locked && chip && !knockedOut && <span className="mt-2 block">{chip}</span>}
      </span>
    </button>
  )
}

export default function RoundPage({ me }: { me: string }) {
  const number = Number(useParams().number)
  const [data, setData] = useState<(Data & { number: number }) | undefined>()
  const [error, setError] = useState<string | null>(null)
  const now = useNow()
  const thud = useThud()
  const [takeover, setTakeover] = useState<Team | null>(null)
  const endTakeover = useCallback(() => setTakeover(null), [])
  const [confirming, setConfirming] = useState<number | null>(null) // team id in the §18 sheet
  const endConfirm = useCallback(() => setConfirming(null), [])
  const [replay, setReplay] = useState(false)
  const endReplay = useCallback(() => setReplay(false), [])
  const reload = useCallback(() => load(number, me).then((d) => setData({ ...d, number })), [number, me])
  useEffect(() => {
    reload()
  }, [reload])

  // The phone clock only decides what to show; the server decides what's allowed.
  const locked = data?.round ? now >= Date.parse(data.round.lock_at) : false
  useEffect(() => {
    if (locked) reload()
  }, [locked, reload])
  // No feed: while a match is on or waiting for its result, re-read every minute so an admin's score shows up.
  const inPlay = data?.matches.some((m) => ['live', 'waiting'].includes(matchState(m, now))) ?? false
  useEffect(() => {
    if (!inPlay) return
    const id = setInterval(reload, 60_000)
    return () => clearInterval(id)
  }, [inPlay, reload])

  const season = SEASON.find((s) => s.number === number)
  const title = data?.round?.name ?? season?.title ?? `Round ${number}`
  if (data?.number !== number)
    return (
      <Shell title={title}>
        <RoundPills current={number} />
        <Loading />
      </Shell>
    )

  const { round, teams, matches, players } = data
  const prev = data.rounds.findLast((r) => r.number < number)
  if (!round || (prev && !prev.settled_at))
    return (
      <Shell title={title}>
        <div className="screen flex flex-col gap-[18px]">
          <RoundPills current={number} />
          <NotOpen
            title={title}
            body={
              !round
                ? number === 8
                  ? '22 May. Last one standing takes 80% of the pot.'
                  : 'Lock time set once kick-offs are announced.'
                : `Opens when ${prev!.name} is settled. ${round.stage === 'pool' ? `Picks lock ${lockLabel(round.lock_at, ', ')}.` : 'Lock time set once kick-offs are announced.'}`
            }
          />
        </div>
      </Shell>
    )

  const myAlive = data.alive.get(me)
  const outView = myAlive === false && !!data.ko // §17: out of an earlier round
  const myPick = data.picks.find((p) => p.player_id === me)
  const featured = matches.find((m) => m.id === round.featured_match_id)
  const knockout = round.stage !== 'pool'
  const chipFor = (pick?: Pick) => {
    const m = pick && matches.find((m) => m.home_team_id === pick.team_id || m.away_team_id === pick.team_id)
    return m && <PickChip m={m} teamId={pick.team_id} knockout={knockout} now={now} />
  }
  const myMatch = myPick && matches.find((m) => m.home_team_id === myPick.team_id || m.away_team_id === myPick.team_id)
  const knockedOut =
    data.myOutcome === 'out' && myMatch && myMatch.home_score !== null
      ? `${teams.get(myMatch.home_team_id)?.name} ${myMatch.home_score}–${myMatch.away_score} ${teams.get(myMatch.away_team_id)?.name} · ${koReason(myMatch, myPick.team_id, knockout)}`
      : undefined
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
    <Shell title={round.name}>
      <Takeover team={takeover} onDone={endTakeover} />
      {confirming !== null && myAlive === true && (
        <PickSheet
          team={teams.get(confirming)!}
          match={matches.find((m) => m.home_team_id === confirming || m.away_team_id === confirming)!}
          teams={teams}
          current={myPick && teams.get(myPick.team_id)}
          lastUnused={
            knockout &&
            matches.every((m) => [m.home_team_id, m.away_team_id].every((t) => t === confirming || data.used.has(t)))
          }
          locked={locked}
          onCancel={endConfirm}
          onConfirm={async () => {
            thud() // still inside the touch: the hold completes with the finger down
            setConfirming(null)
            setError(null)
            const { error } = await supabase.rpc('make_pick', { p_round_id: round.id, p_team_id: confirming })
            if (error) setError(error.message)
            else {
              setTakeover(teams.get(confirming)!)
              sfx.pick()
            }
            await reload()
          }}
        />
      )}
      <KnockedOut ko={replay ? data.ko : null} onDone={endReplay} />
      <div className="screen flex flex-col gap-[18px]">
        <RoundPills current={number} />
        <div className="stagger flex flex-col gap-[18px]">
          {outView ? (
            <OutHero
              ko={data.ko!}
              stillIn={players.filter((p) => data.alive.get(p.id) === true).length}
              pot={potEur(data.payments)}
              onReplay={() => {
                sfx.knockedOut() // from the tap: iOS only plays audio inside a gesture
                setReplay(true)
              }}
            />
          ) : (
            <Hero
              round={round}
              locked={locked}
              ms={Date.parse(round.lock_at) - now}
              pot={potEur(data.payments)}
              stillIn={players.filter((p) => data.alive.get(p.id) === true).length}
              picked={{ n: data.squad.filter((s) => s.has_pick).length, of: data.squad.length }}
            />
          )}
          {error && (
            <p role="alert" className="rounded-2xl bg-out-text/15 p-3 text-out-text">
              {error}
            </p>
          )}
          <PayEntry me={me} payments={data.payments} run={run} />
          {outView && (
            <GetBackIn me={me} ko={data.ko!} round={round} teams={teams} payments={data.payments} now={now} run={run} />
          )}

          {myAlive === true && (
            <MyPick
              team={myPick && teams.get(myPick.team_id)}
              locked={locked}
              lockAt={lockedAt(round.lock_at)}
              round1={round.number === 1}
              chip={chipFor(myPick)}
              knockedOut={knockedOut}
              onReplay={() => {
                if (!myPick) return
                sfx.pick()
                setTakeover(teams.get(myPick.team_id)!)
              }}
            />
          )}
          {myAlive === true && (
            <FixtureList
              matches={matches}
              teams={teams}
              used={data.used}
              picked={myPick?.team_id}
              featuredId={round.featured_match_id}
              locked={locked}
              knockout={knockout}
              now={now}
              onPick={(tid) => {
                // §18: your current pick replays the takeover; any other team opens the confirm sheet.
                if (tid !== myPick?.team_id) return setConfirming(tid)
                thud()
                sfx.pick()
                setTakeover(teams.get(tid)!)
              }}
            />
          )}
          {myAlive !== true && (
            <FixtureList
              matches={matches}
              teams={teams}
              used={new Map()}
              featuredId={round.featured_match_id}
              locked
              knockout={knockout}
              now={now}
            />
          )}
          {myAlive === false && !locked && (
            <JinxPicker
              current={data.jinxes.find((j) => j.jinxer_id === me)?.target_id}
              survivors={players.filter((p) => data.alive.get(p.id) === true)}
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

          {outView && !locked && <StillPlaying me={me} round={round} drawn={!!featured} />}
          {!locked && !featured && !outView && (
            <p className="text-center text-sm text-muted">Featured match not drawn yet.</p>
          )}
          {!locked && featured && (
            <Raffle roundId={round.id} featured={featured} matches={matches} teams={teams}>
              <Prediction
                key={JSON.stringify(data.prediction)}
                home={teams.get(featured.home_team_id)!}
                away={teams.get(featured.away_team_id)!}
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
            </Raffle>
          )}

          {locked && <Reveal data={data} name={name} />}
          <Squad
            squad={data.squad}
            players={players}
            payments={data.payments}
            me={me}
            locked={locked}
            picks={data.picks}
            teams={teams}
            chipFor={chipFor}
            settled={!!round.settled_at}
          />
        </div>
      </div>
    </Shell>
  )
}

function JinxPicker({
  current,
  survivors,
  onPick,
}: {
  current?: string
  survivors: Player[]
  onPick: (id: string) => void
}) {
  const target = survivors.find((p) => p.id === current)
  return (
    <section className="hairline flex flex-col gap-3 rounded-3xl bg-navy-800 p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="disp text-[22px] font-extrabold">Jinx a survivor</h2>
        <span className="text-[11px] font-bold whitespace-nowrap text-gold">+1 IF THEY GO OUT</span>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {survivors.map((p) => {
          const on = current === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              aria-pressed={on}
              aria-label={`Jinx ${p.nickname || p.name}`}
              className="press flex min-w-0 flex-col items-center gap-1.5 py-1"
            >
              <span
                className="rounded-full transition-[box-shadow,transform] duration-250 ease-[cubic-bezier(.3,1.6,.5,1)]"
                style={{
                  boxShadow: on ? '0 0 0 3px #0b1742, 0 0 0 6px #f2b226' : 'none',
                  transform: on ? 'scale(1.1)' : 'none',
                }}
              >
                <Avatar p={p} size={48} />
              </span>
              <span
                className={`w-full truncate text-center text-xs font-semibold ${on ? 'text-gold' : 'text-chalk-2'}`}
              >
                {p.nickname || p.name}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted">
        {target
          ? `Jinxing ${target.nickname || target.name}. Locked in at the lock; everyone sees it at the reveal.`
          : 'If they go out this round, you get a point for the side pot.'}
      </p>
    </section>
  )
}

function Stepper({ team, value, set }: { team: Team; value: number; set: (n: number) => void }) {
  const btn = 'press h-11 w-9 rounded-xl bg-white/8 text-[22px] font-semibold'
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
        <img src={crestUrl(team)} alt="" className="h-10 w-10 object-contain" />
      </span>
      <span className="max-w-full truncate text-[13px] font-semibold">{team.name}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          onClick={() => set(Math.max(0, value - 1))}
          aria-label={`${team.name} score down`}
        >
          −
        </button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`${team.name} score`}
          value={value}
          onFocus={(e) => e.target.select()} // typing replaces the number
          onChange={(e) => set(Math.min(99, Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 0))}
          className="disp h-14 w-[58px] rounded-xl border border-white/14 bg-navy-900 text-center text-[40px] font-extrabold tabular-nums outline-none focus:border-gold focus:shadow-[0_0_0_3px_rgba(242,178,38,.25)]"
        />
        <button
          type="button"
          className={btn}
          onClick={() => set(Math.min(99, value + 1))}
          aria-label={`${team.name} score up`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** §3.4. Steppers are silent; saving plays the whistle. */
function Prediction({
  home,
  away,
  initial,
  onSave,
}: {
  home: Team
  away: Team
  initial: { home_score: number; away_score: number } | null
  onSave: (h: number, a: number) => Promise<void>
}) {
  const [h, setH] = useState(initial?.home_score ?? 0)
  const [a, setA] = useState(initial?.away_score ?? 0)
  const saved = !!initial && initial.home_score === h && initial.away_score === a
  return (
    <section className="hairline flex flex-col gap-3.5 rounded-3xl bg-navy-800 p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="disp text-[22px] font-extrabold">Predict the featured match</h2>
        <span className="text-[11px] font-bold whitespace-nowrap text-gold">EXACT = 5 PTS</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-center gap-1">
        <Stepper team={home} value={h} set={setH} />
        <span className="disp text-center text-xl font-extrabold text-muted">–</span>
        <Stepper team={away} value={a} set={setA} />
      </div>
      <p className="text-center text-xs text-muted">Right winner 1 · within 10 = 2 · within 5 = 3 · exact 5</p>
      <button
        type="button"
        onClick={() => {
          sfx.savePrediction()
          void onSave(h, a)
        }}
        className={`press flex h-[50px] items-center justify-center gap-2 rounded-[14px] text-base font-bold text-navy-900 ${saved ? 'bg-in' : 'bg-gold'}`}
      >
        {saved && <span className="pop">{Icon.check(18, 3)}</span>}
        {saved ? 'Prediction saved' : 'Save prediction'}
      </button>
    </section>
  )
}

/** §3.5. Picked / not picked from round_pick_status; never shows a team before the lock. */
function Squad({
  squad,
  players,
  payments,
  me,
  locked,
  picks,
  teams,
  chipFor,
  settled,
}: {
  squad: Data['squad']
  players: Player[]
  payments: PaymentRow[]
  me: string
  locked: boolean
  picks: Pick[]
  teams: Map<number, Team>
  chipFor: (p?: Pick) => ReactNode
  settled: boolean
}) {
  const n = squad.filter((s) => s.has_pick).length
  const word = locked ? 'locked in' : 'picked'
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="disp text-[22px] font-extrabold">The squad</h2>
        <span className="text-[13px] font-semibold text-muted">
          {n} of {squad.length} {word}
        </span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-[3px] bg-white/8">
        <div
          className="h-full rounded-[3px] bg-blue transition-[width] duration-600 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ width: `${squad.length ? Math.round((n / squad.length) * 100) : 0}%` }}
        />
      </div>
      <ul className="hairline overflow-hidden rounded-[20px] bg-navy-800">
        {squad.map(({ player_id, has_pick }) => {
          const p = players.find((p) => p.id === player_id)
          if (!p) return null
          const paid = entryOf(payments, p.id)?.status
          // After the lock RLS returns everyone's picks (§16): show the team and how it's going.
          const pick = locked ? picks.find((x) => x.player_id === p.id) : undefined
          const team = pick && teams.get(pick.team_id)
          return (
            <li key={p.id} className="flex items-center gap-3 border-t border-white/6 px-3.5 py-3 first:border-0">
              <Avatar p={p} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {p.nickname || p.name}
                  {p.id === me && ' (you)'}
                </span>
                {team ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-chalk-2">
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white">
                      <img src={crestUrl(team)} alt="" className="h-[14px] w-[14px] object-contain" />
                    </span>
                    <span className="truncate">{team.name}</span>
                  </span>
                ) : (
                  <span className={`block text-xs ${paid === 'confirmed' ? 'text-muted' : 'text-warn'}`}>
                    {paid === 'confirmed'
                      ? 'Paid'
                      : paid === 'claimed'
                        ? 'Payment waiting for a confirm'
                        : 'Entry not paid yet'}
                  </span>
                )}
              </span>
              {pick ? (
                chipFor(pick)
              ) : has_pick ? (
                <span
                  className={`pop flex items-center gap-[5px] rounded-full px-2.5 py-[5px] text-xs font-bold ${locked ? 'bg-gold/16 text-gold' : 'bg-blue/18 text-blue-text'}`}
                >
                  {Icon.check(13, 3)}
                  {locked ? 'Locked in' : 'Picked'}
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-white/25 px-2.5 py-[5px] text-xs font-semibold text-muted">
                  {locked ? 'No pick' : 'Thinking…'}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-center text-xs text-muted">
        {locked
          ? settled
            ? 'The team sheet is above, one card per player.'
            : 'Through and Out are official once the round is settled.'
          : 'Teams stay hidden until the lock, admins included. Then the cards flip.'}
      </p>
    </section>
  )
}

// Visible only after the lock, because that's when RLS starts returning everyone's rows.
function Reveal({ data, name }: { data: Data; name: (id: string) => string }) {
  const featured = data.matches.find((m) => m.id === data.round!.featured_match_id)
  return (
    <>
      <section className="flex flex-col gap-2.5">
        <RevealCards picks={data.picks} teams={data.teams} name={name} />
        {data.picks.length === 0 && (
          <p className="text-muted">
            {data.round!.number === 1 ? 'No picks.' : 'No picks yet. Auto-picks land within a minute of the lock.'}
          </p>
        )}
      </section>
      {data.jinxes.length > 0 && (
        <section className="hairline rounded-[20px] bg-navy-800 p-4">
          <h2 className="disp mb-2 text-lg font-extrabold">Jinxes</h2>
          <ul className="flex flex-col gap-1 text-chalk-2">
            {data.jinxes.map((j) => (
              <li key={j.jinxer_id}>
                {name(j.jinxer_id)} jinxed <strong className="text-chalk">{name(j.target_id)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.predictions.length > 0 && (
        <section className="hairline rounded-[20px] bg-navy-800 p-4">
          <h2 className="disp mb-2 text-lg font-extrabold">
            Predictions
            {featured &&
              ` · ${data.teams.get(featured.home_team_id)?.name} v ${data.teams.get(featured.away_team_id)?.name}`}
          </h2>
          <ul className="flex flex-col gap-1 text-chalk-2">
            {data.predictions.map((p) => (
              <li key={p.player_id} className="flex justify-between">
                <span>{name(p.player_id)}</span>
                <span className="disp text-lg font-extrabold text-chalk tabular-nums">
                  {p.home_score}–{p.away_score}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
