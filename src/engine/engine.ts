// Rules engine (CLAUDE.md §5, including Eddie's rulings). Pure: no I/O, no clock, no randomness.
// Types mirror the tables in §4 in camelCase, so the admin Settle page maps rows straight in and out.
// Bad input data throws an Error, which the Settle preview shows.

export type Stage = 'pool' | 'r16' | 'qf' | 'sf' | 'final'
export type Outcome = 'through' | 'out' | 'survived_postponed' | 'clean_slate' | 'reinstated' | 'already_out'

export interface Round {
  id: number
  number: number
  stage: Stage
  lockAt: string
  featuredMatchId: number | null
  /** Set when the round opens, from openRound(). */
  cleanSlate: boolean
  /** Random shuffle of every team id, drawn at settle (outside the engine); breaks burn-order ties. */
  tiebreak: number[] | null
}
export interface Match {
  id: number
  roundId: number
  homeTeamId: number
  awayTeamId: number
  homeScore: number | null
  awayScore: number | null
  winnerTeamId: number | null
  status: 'scheduled' | 'completed' | 'postponed' | 'abandoned'
}
export interface Pick {
  roundId: number
  playerId: string
  teamId: number
  isAuto: boolean
  isResurrection: boolean
}
export interface Prediction {
  roundId: number
  playerId: string
  homeScore: number
  awayScore: number
}
export interface Jinx {
  roundId: number
  jinxerId: string
  targetId: string
}
export interface Payment {
  playerId: string
  kind: 'entry' | 'buyback'
  amountEur: number
  status: 'claimed' | 'confirmed'
  claimedAt: string
}
export interface BurnedTeam {
  playerId: string
  teamId: number
  roundId: number
  reason: 'buyback_penalty' | 'resurrection_penalty'
}
export interface RoundResult {
  roundId: number
  playerId: string
  outcome: Outcome
  predictionPoints: number
  exactScore: boolean
  jinxPoints: number
}
/** Everything already settled: earlier rounds and their picks, results and burns. */
export interface History {
  playerIds: string[]
  rounds: Round[]
  picks: Pick[]
  roundResults: RoundResult[]
  burnedTeams: BurnedTeam[]
}
export interface Settlement {
  roundResults: RoundResult[]
  newBurnedTeams: BurnedTeam[]
  stillIn: string[]
  /** This round's burn order (most-picked first, ties by the draw), to show with the results. */
  burnOrder: number[]
}

function bad(msg: string): never {
  throw new Error(msg)
}

const STAYS_IN: Outcome[] = ['through', 'survived_postponed', 'clean_slate', 'reinstated']
const byNumber = (a: Round, b: Round) => a.number - b.number
const teamsIn = (ms: Match[]) => new Set(ms.flatMap((m) => [m.homeTeamId, m.awayTeamId]))

export interface PlayerState {
  alive: boolean
  /** Teams the player can't pick: used (rule 3, minus postponed) plus burned, since their last clean slate. */
  used: Set<number>
  outRounds: number[]
  buybackUsed: boolean
}

/** A player's position going into `round`. Mirrors alive() and used_teams() in SQL. */
export function playerState(h: History, playerId: string, round: Round): PlayerState {
  const rounds = h.rounds.filter((r) => r.number < round.number).sort(byNumber)
  const numberOf = new Map(rounds.map((r) => [r.id, r.number]))
  const outcome = new Map(h.roundResults.filter((r) => r.playerId === playerId).map((r) => [r.roundId, r.outcome]))
  // In at the start of rounds[i] (i = rounds.length is `round` itself).
  const inAt = (i: number) =>
    i === 0 ? h.playerIds.includes(playerId) : STAYS_IN.includes(outcome.get(rounds[i - 1].id) ?? 'already_out')
  // Q1: a clean slate clears used and burned teams for everyone in at the start of that round, from then on.
  const slate = Math.max(0, ...[...rounds, round].filter((r, i) => r.cleanSlate && inAt(i)).map((r) => r.number))
  const used = new Set<number>()
  for (const p of h.picks) {
    const num = numberOf.get(p.roundId)
    if (p.playerId !== playerId || num === undefined || num < slate) continue
    // ponytail: a postponed resurrection pick still counts here; harmless, there's no way back after Round 4.
    if (outcome.get(p.roundId) !== 'survived_postponed') used.add(p.teamId)
  }
  for (const b of h.burnedTeams)
    if (b.playerId === playerId && (numberOf.get(b.roundId) ?? -1) >= slate) used.add(b.teamId)
  return {
    alive: inAt(rounds.length),
    used,
    outRounds: rounds.filter((r) => outcome.get(r.id) === 'out').map((r) => r.number),
    // Played a round they started out of, other than by resurrection (which gives reinstated/already_out).
    buybackUsed: rounds.some(
      (r, i) => !inAt(i) && ['through', 'out', 'survived_postponed'].includes(outcome.get(r.id) ?? 'already_out'),
    ),
  }
}

/**
 * Q1/Q2: run when a round's fixtures are loaded. If every player still in has no team left, it's a clean
 * slate (store it on the round); otherwise the stuck players are out from now (shown straight away).
 */
export function openRound(h: History, round: Round, matches: Match[]) {
  const playing = teamsIn(matches.filter((m) => m.roundId === round.id))
  if (!playing.size) bad(`round ${round.number} has no fixtures`)
  const alive: string[] = []
  const stuck: string[] = []
  for (const id of h.playerIds) {
    const st = playerState(h, id, { ...round, cleanSlate: false })
    if (!st.alive) continue
    alive.push(id)
    if ([...playing].every((t) => st.used.has(t))) stuck.push(id)
  }
  const cleanSlate = alive.length > 0 && stuck.length === alive.length
  return { cleanSlate, noTeamsLeft: cleanSlate ? [] : stuck }
}

/** Q4: a round's picked teams, most-picked first, ties broken by the stored random draw. */
export function burnOrder(picks: Pick[], tiebreak: number[]): number[] {
  const counts = new Map<number, number>()
  for (const p of picks) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1)
  const rank = (t: number) => {
    const i = tiebreak.indexOf(t)
    return i < 0 ? bad(`team ${t} is missing from the tiebreak draw`) : i
  }
  return [...counts]
    .map(([team, n]) => ({ team, n, r: rank(team) }))
    .sort((a, b) => b.n - a.n || a.r - b.r)
    .map((x) => x.team)
}

/**
 * Rules 11/12: teams burned when a player comes back in `round`: one for the round they went out in and one
 * per round sat out, each walking that round's burn order past teams they've used or burned (Q5: then the
 * season-wide burn order; nothing left, no burn). Exported so pick screens can show them before the lock (Q8).
 */
export function reentryBurns(h: History, playerId: string, round: Round, reason: BurnedTeam['reason']): BurnedTeam[] {
  const st = playerState(h, playerId, round)
  const outIn = st.outRounds.at(-1) ?? bad(`${playerId} has never gone out`)
  const before = h.rounds.filter((r) => r.number < round.number)
  const picksIn = (rs: Round[]) => h.picks.filter((p) => rs.some((r) => r.id === p.roundId))
  const taken = new Set(st.used)
  const burns: BurnedTeam[] = []
  for (const r of before.filter((r) => r.number >= outIn).sort(byNumber)) {
    const draw = r.tiebreak ?? bad(`round ${r.number} has no tiebreak draw`)
    const free = (order: number[]) => order.find((t) => !taken.has(t))
    const team = free(burnOrder(picksIn([r]), draw)) ?? free(burnOrder(picksIn(before), draw))
    if (team === undefined) continue
    taken.add(team)
    burns.push({ playerId, teamId: team, roundId: round.id, reason })
  }
  return burns
}

/** Rule 6: pool = 80-minute score, draw is a loss; knockouts = winnerTeamId. Rule 7: not completed = postponed. */
function result(stage: Stage, m: Match, teamId: number): 'win' | 'lose' | 'postponed' {
  if (m.status === 'postponed' || m.status === 'abandoned') return 'postponed'
  if (m.status !== 'completed') bad(`match ${m.id} has no result yet`)
  if (stage !== 'pool') {
    if (m.winnerTeamId !== m.homeTeamId && m.winnerTeamId !== m.awayTeamId) bad(`knockout match ${m.id} needs a winner`)
    return m.winnerTeamId === teamId ? 'win' : 'lose'
  }
  if (m.homeScore == null || m.awayScore == null) bad(`match ${m.id} has no score`)
  const [mine, theirs] = teamId === m.homeTeamId ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore]
  return mine > theirs ? 'win' : 'lose'
}

type Score = { homeScore: number; awayScore: number }

/** Rule 13: wrong winner 0, right winner 1, within 10 → 2, within 5 → 3, exact 5. A called draw is a right winner. */
export function predictionPoints(pred: Score, actual: Score): number {
  if (Math.sign(pred.homeScore - pred.awayScore) !== Math.sign(actual.homeScore - actual.awayScore)) return 0
  const off = Math.abs(pred.homeScore - actual.homeScore) + Math.abs(pred.awayScore - actual.awayScore)
  return off === 0 ? 5 : off <= 5 ? 3 : off <= 10 ? 2 : 1
}

/**
 * The featured match's score, or null when it scores nobody (none named, or not completed).
 * Q12: knockouts use the final score incl. extra time; level (kicking competition) is a draw here.
 */
function featuredScore(round: Round, ms: Match[]): Score | null {
  if (round.featuredMatchId == null) return null
  const m =
    ms.find((m) => m.id === round.featuredMatchId) ?? bad(`featured match ${round.featuredMatchId} isn't in this round`)
  if (m.status === 'postponed' || m.status === 'abandoned') return null
  if (m.status !== 'completed' || m.homeScore == null || m.awayScore == null) bad(`featured match ${m.id} has no score`)
  return { homeScore: m.homeScore, awayScore: m.awayScore }
}

export function settleRound(
  h: History,
  round: Round,
  matches: Match[],
  picks: Pick[],
  predictions: Prediction[],
  jinxes: Jinx[],
  payments: Payment[],
): Settlement {
  const ms = matches.filter((m) => m.roundId === round.id)
  const ps = picks.filter((p) => p.roundId === round.id)
  const js = jinxes.filter((j) => j.roundId === round.id)
  const preds = predictions.filter((p) => p.roundId === round.id)
  for (const id of [
    ...ps.map((p) => p.playerId),
    ...preds.map((p) => p.playerId),
    ...js.flatMap((j) => [j.jinxerId, j.targetId]),
  ])
    if (!h.playerIds.includes(id)) bad(`unknown player ${id}`)
  if (openRound(h, round, ms).cleanSlate !== round.cleanSlate)
    bad(`round ${round.number}'s clean slate flag doesn't match openRound()`)
  // The draw must cover every team a later burn could walk: this round's fixtures and every pick so far.
  const draw = round.tiebreak ?? bad(`round ${round.number} needs its tiebreak draw before settling`)
  const earlier = new Set(h.rounds.filter((r) => r.number < round.number).map((r) => r.id))
  for (const t of [...teamsIn(ms), ...h.picks.filter((p) => earlier.has(p.roundId)).map((p) => p.teamId)])
    if (!draw.includes(t)) bad(`team ${t} is missing from round ${round.number}'s tiebreak draw`)

  const playing = teamsIn(ms)
  const matchOf = (team: number) => ms.find((m) => m.homeTeamId === team || m.awayTeamId === team)
  const state = new Map(h.playerIds.map((id) => [id, playerState(h, id, round)]))
  const pickOf = new Map(ps.map((p) => [p.playerId, p]))
  const burns: BurnedTeam[] = []

  // Who's in at the start of the round, and what they can't pick. Rule 11: a confirmed buy-back claimed
  // before this lock puts an out player back in, with burns.
  const contenders = new Map<string, Set<number>>()
  for (const id of h.playerIds) {
    const st = state.get(id)!
    const paid = payments.filter((p) => p.playerId === id && p.kind === 'buyback' && p.status === 'confirmed')
    if (paid.length > 1) bad(`${id} has ${paid.length} confirmed buy-backs; it's one per player`)
    const buyback = paid.length === 1 && !st.buybackUsed
    if (buyback && round.stage !== 'pool') bad(`${id} has an unused buy-back after the pool stage; refund it`)
    if (st.alive) contenders.set(id, st.used)
    else if (buyback && Date.parse(paid[0].claimedAt) < Date.parse(round.lockAt)) {
      if (pickOf.get(id)?.isResurrection) bad(`${id}: a buy-back or the resurrection in Round 4, not both`)
      const b = reentryBurns(h, id, round, 'buyback_penalty')
      burns.push(...b)
      contenders.set(id, new Set([...st.used, ...b.map((x) => x.teamId)]))
    }
  }

  const outcome = new Map<string, Outcome>()
  const lost: string[] = []
  const stuck: string[] = [] // rule 4 (1b): no team left, so out when the round opened
  for (const [id, used] of contenders) {
    const pick = pickOf.get(id)
    if (!pick) {
      // Rule 5's random pick is made by the lock cron; a missing pick here means it didn't run.
      if ([...playing].some((t) => !used.has(t))) bad(`${id} has no pick but has teams left`)
      stuck.push(id)
      outcome.set(id, 'out')
      continue
    }
    if (pick.isResurrection) bad(`${id} is still in; resurrection picks are for players who are out`)
    if (!playing.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which doesn't play this round`)
    if (used.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which they've used or had burned`)
    const r = result(round.stage, matchOf(pick.teamId)!, pick.teamId)
    outcome.set(id, r === 'win' ? 'through' : r === 'postponed' ? 'survived_postponed' : 'out')
    if (r === 'lose') lost.push(id)
  }

  // Rule 12: resurrection, Round 4 only, an away team, back in only on a win (Q6: postponed stays out).
  for (const id of h.playerIds) {
    const pick = pickOf.get(id)
    if (!pick || contenders.has(id)) continue
    if (!pick.isResurrection) bad(`${id} is out and has a pick`)
    if (round.stage !== 'pool' || round.number !== 4) bad(`${id}: resurrection picks are Round 4 only`)
    const m = matchOf(pick.teamId) ?? bad(`${id} picked team ${pick.teamId}, which doesn't play this round`)
    if (m.awayTeamId !== pick.teamId) bad(`${id}: a resurrection pick must be an away team`)
    if (state.get(id)!.used.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which they've used or had burned`)
    const b = reentryBurns(h, id, round, 'resurrection_penalty')
    if (b.some((x) => x.teamId === pick.teamId)) bad(`${id} picked team ${pick.teamId}, burned if they come back`)
    if (result(round.stage, m, pick.teamId) !== 'win') continue
    burns.push(...b)
    outcome.set(id, 'reinstated')
  }

  // Rule 8: everyone in at the start who had a pick goes out → they all stay in (Q2, Q9).
  const played = [...contenders.keys()].filter((id) => !stuck.includes(id))
  if (played.length && played.every((id) => outcome.get(id) === 'out'))
    for (const id of played) outcome.set(id, 'through')

  // Rule 14 / Q3: a jinx lands when the target's pick loses or draws, whatever happens after.
  const jinxPoints = new Map<string, number>()
  for (const j of js) {
    if (contenders.has(j.jinxerId) && !stuck.includes(j.jinxerId)) bad(`${j.jinxerId} is still in and can't jinx`)
    if (!played.includes(j.targetId)) bad(`${j.jinxerId} jinxed ${j.targetId}, who isn't still in`)
    if (lost.includes(j.targetId)) jinxPoints.set(j.jinxerId, 1)
  }

  const score = featuredScore(round, ms)
  const roundResults = h.playerIds.map((id): RoundResult => {
    const pred = preds.find((p) => p.playerId === id)
    const points = pred && score ? predictionPoints(pred, score) : 0
    return {
      roundId: round.id,
      playerId: id,
      outcome: outcome.get(id) ?? 'already_out',
      predictionPoints: points,
      exactScore: points === 5,
      jinxPoints: jinxPoints.get(id) ?? 0,
    }
  })
  return {
    roundResults,
    newBurnedTeams: burns,
    stillIn: roundResults.filter((r) => STAYS_IN.includes(r.outcome)).map((r) => r.playerId),
    burnOrder: burnOrder(ps, draw),
  }
}

/** Rule 10: pot = confirmed payments; 80% last man standing, 20% top of the points table. In cents. */
export function payoutSplit(payments: Payment[]) {
  const potCents = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + Math.round(p.amountEur * 100), 0)
  const lastManCents = Math.floor((potCents * 8) / 10) // ponytail: entries are whole euros; an odd cent would go to points
  return { potCents, lastManCents, pointsCents: potCents - lastManCents }
}

export interface Standing {
  playerId: string
  points: number
  predictionPoints: number
  exactScores: number
}

/** Rule 13/14: points table = prediction + jinx points, sorted by points then exact scores. */
export function pointsTable(results: RoundResult[]): Standing[] {
  const t = new Map<string, Standing>()
  for (const r of results) {
    const s = t.get(r.playerId) ?? { playerId: r.playerId, points: 0, predictionPoints: 0, exactScores: 0 }
    s.points += r.predictionPoints + r.jinxPoints
    s.predictionPoints += r.predictionPoints
    s.exactScores += Number(r.exactScore)
    t.set(r.playerId, s)
  }
  return [...t.values()].sort((a, b) => b.points - a.points || b.exactScores - a.exactScores)
}

/** Top of the table (optionally among some players): most points, then most exact scores. Several = split. */
export function topOfTable(table: Standing[], among?: string[]): string[] {
  const rows = among ? table.filter((s) => among.includes(s.playerId)) : table
  const best = rows[0]
  return best
    ? rows.filter((s) => s.points === best.points && s.exactScores === best.exactScores).map((s) => s.playerId)
    : []
}

/**
 * Rule 9: who wins the main game after settling `round`, or null if it carries on. Several = split.
 * Q10: no winner while a way back exists (buy-backs and resurrection, up to Round 4's settle).
 */
export function gameWinners(stillIn: string[], round: Round, table: Standing[]): string[] | null {
  if (round.stage === 'final') return topOfTable(table, stillIn)
  if (round.stage === 'pool' && round.number < 4) return null
  return stillIn.length === 1 ? stillIn : null
}

/**
 * Rule 15: fewest prediction points (jinx excluded); tied, whoever went out for good first (Q11: final exit;
 * never out ranks best). Still tied, they all do it (Q13).
 */
export function forfeitLosers(results: RoundResult[], rounds: Round[]): string[] {
  const table = pointsTable(results)
  const fewest = Math.min(...table.map((s) => s.predictionPoints))
  const tied = table.filter((s) => s.predictionPoints === fewest).map((s) => s.playerId)
  const numberOf = new Map(rounds.map((r) => [r.id, r.number]))
  const lastExit = (id: string) => {
    const exits = results
      .filter((r) => r.playerId === id && r.outcome === 'out')
      .map((r) => numberOf.get(r.roundId) ?? bad(`unknown round ${r.roundId}`))
    return exits.length ? Math.max(...exits) : Infinity
  }
  const at = new Map(tied.map((id) => [id, lastExit(id)]))
  const first = Math.min(...at.values())
  return tied.filter((id) => at.get(id) === first)
}
