// Rules engine (CLAUDE.md §5). Pure: no I/O, no clock, no randomness.
// Types mirror the tables in §4 in camelCase, so the admin Settle page maps rows straight in and out.
// Anything the spec doesn't settle throws NeedsRuling (see QUESTIONS.md); bad input data throws Error.

export type Stage = 'pool' | 'r16' | 'qf' | 'sf' | 'final'
export type Outcome = 'through' | 'out' | 'survived_postponed' | 'clean_slate' | 'reinstated' | 'already_out'

export interface Round {
  id: number
  number: number
  stage: Stage
  lockAt: string
  featuredMatchId: number | null
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
}

export class NeedsRuling extends Error {}
function ruling(q: string, msg: string): never {
  throw new NeedsRuling(`${q}: ${msg} (see src/engine/QUESTIONS.md)`)
}
function bad(msg: string): never {
  throw new Error(msg)
}

const STAYS_IN: Outcome[] = ['through', 'survived_postponed', 'clean_slate', 'reinstated']
const byNumber = (a: Round, b: Round) => a.number - b.number

export interface PlayerState {
  alive: boolean
  /** Teams the player can't pick: used (rule 3, minus postponed, since the last clean slate) plus burned. */
  used: Set<number>
  outRounds: number[]
  buybackUsed: boolean
}

/** A player's position going into round number `n`. Mirrors alive() and used_teams() in SQL. */
export function playerState(h: History, playerId: string, n: number): PlayerState {
  const rounds = h.rounds.filter((r) => r.number < n).sort(byNumber)
  const numberOf = new Map(rounds.map((r) => [r.id, r.number]))
  const outcome = new Map(h.roundResults.filter((r) => r.playerId === playerId).map((r) => [r.roundId, r.outcome]))
  const slate = Math.max(0, ...rounds.filter((r) => outcome.get(r.id) === 'clean_slate').map((r) => r.number))
  const used = new Set<number>()
  for (const p of h.picks) {
    const num = numberOf.get(p.roundId)
    if (p.playerId === playerId && num !== undefined && num >= slate && outcome.get(p.roundId) !== 'survived_postponed')
      used.add(p.teamId)
  }
  const burned = h.burnedTeams.filter((b) => b.playerId === playerId && numberOf.has(b.roundId))
  for (const b of burned) used.add(b.teamId)
  const last = rounds.at(-1)
  return {
    alive: last ? STAYS_IN.includes(outcome.get(last.id) ?? 'already_out') : h.playerIds.includes(playerId),
    used,
    outRounds: rounds.filter((r) => outcome.get(r.id) === 'out').map((r) => r.number),
    buybackUsed: burned.some((b) => b.reason === 'buyback_penalty'),
  }
}

/**
 * Rules 11/12: teams burned when a player comes back in `round`: the most-picked team of the round they
 * went out in, plus each sat-out round's most-picked, skipping teams they've used or already burned.
 * Exported so the pick screen can grey them out before the lock.
 */
export function reentryBurns(h: History, playerId: string, round: Round, reason: BurnedTeam['reason']): BurnedTeam[] {
  const st = playerState(h, playerId, round.number)
  const outIn = st.outRounds.at(-1) ?? bad(`${playerId} has never gone out`)
  const taken = new Set(st.used)
  const burns: BurnedTeam[] = []
  for (const r of h.rounds.filter((r) => r.number >= outIn && r.number < round.number).sort(byNumber)) {
    const counts = new Map<number, number>()
    for (const p of h.picks) if (p.roundId === r.id) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1)
    const ranked = [...counts].filter(([t]) => !taken.has(t)).sort((a, b) => b[1] - a[1])
    if (!ranked.length) ruling('Q5', `no team picked in round ${r.number} is left to burn for ${playerId}`)
    if (ranked[1]?.[1] === ranked[0][1])
      ruling(
        'Q4',
        `tie for most-picked in round ${r.number} (${ranked.filter((x) => x[1] === ranked[0][1]).map((x) => x[0])})`,
      )
    taken.add(ranked[0][0])
    burns.push({ playerId, teamId: ranked[0][0], roundId: round.id, reason })
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

/** The featured match's score, or null when it scores nobody this round (none named, or not completed). */
function featuredScore(round: Round, ms: Match[]): Score | null {
  if (round.featuredMatchId == null) return null
  const m =
    ms.find((m) => m.id === round.featuredMatchId) ?? bad(`featured match ${round.featuredMatchId} isn't in this round`)
  if (m.status === 'postponed' || m.status === 'abandoned') return null
  if (m.status !== 'completed' || m.homeScore == null || m.awayScore == null) bad(`featured match ${m.id} has no score`)
  if (round.stage !== 'pool' && m.homeScore === m.awayScore)
    ruling('Q12', `featured knockout match ${m.id} ended level`)
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

  const playing = new Set(ms.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
  const matchOf = (team: number) => ms.find((m) => m.homeTeamId === team || m.awayTeamId === team)
  const state = new Map(h.playerIds.map((id) => [id, playerState(h, id, round.number)]))
  const pickOf = new Map(ps.map((p) => [p.playerId, p]))
  const burns: BurnedTeam[] = []

  // Who plays this round, and what they can't pick. Rule 11: a confirmed buy-back claimed before this
  // lock puts an out player back in, with burns.
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
  const stuck: string[] = []
  for (const [id, used] of contenders) {
    const pick = pickOf.get(id)
    if (!pick) {
      // Rule 5's random pick is made by the lock cron; a missing pick here means it didn't run.
      if ([...playing].some((t) => !used.has(t))) bad(`${id} has no pick but has teams left`)
      stuck.push(id)
      continue
    }
    if (pick.isResurrection) bad(`${id} is still in; resurrection picks are for players who are out`)
    if (!playing.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which doesn't play this round`)
    if (used.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which they've used or had burned`)
    const r = result(round.stage, matchOf(pick.teamId)!, pick.teamId)
    outcome.set(id, r === 'win' ? 'through' : r === 'postponed' ? 'survived_postponed' : 'out')
    if (r === 'lose') lost.push(id)
  }

  // Rule 4 (1b): no team left → out, unless every player still in is stuck.
  if (stuck.length && stuck.length === contenders.size) ruling('Q1', `everyone still in (${stuck}) has no team left`)
  for (const id of stuck) outcome.set(id, 'out')

  // Rule 12: resurrection, Round 4 only, an away team, back in on a win.
  const reinstated: string[] = []
  for (const id of h.playerIds) {
    const pick = pickOf.get(id)
    if (!pick || contenders.has(id)) continue
    if (!pick.isResurrection) bad(`${id} is out and has a pick`)
    if (round.stage !== 'pool' || round.number !== 4) bad(`${id}: resurrection picks are Round 4 only`)
    const m = matchOf(pick.teamId) ?? bad(`${id} picked team ${pick.teamId}, which doesn't play this round`)
    if (m.awayTeamId !== pick.teamId) bad(`${id}: a resurrection pick must be an away team`)
    if (state.get(id)!.used.has(pick.teamId)) bad(`${id} picked team ${pick.teamId}, which they've used or had burned`)
    const r = result(round.stage, m, pick.teamId)
    if (r === 'postponed') ruling('Q6', `${id}'s resurrection match was not completed`)
    if (r === 'lose') continue
    const b = reentryBurns(h, id, round, 'resurrection_penalty')
    if (b.some((x) => x.teamId === pick.teamId))
      ruling('Q8', `${id}'s resurrection team ${pick.teamId} is also due to be burned`)
    burns.push(...b)
    outcome.set(id, 'reinstated')
    reinstated.push(id)
  }

  // Rule 8: everyone still in goes out → they all stay in.
  if (contenders.size && [...contenders.keys()].every((id) => outcome.get(id) === 'out')) {
    if (stuck.length) ruling('Q2', `everyone went out, ${stuck} because they had no team left`)
    if (reinstated.length) ruling('Q9', `everyone still in went out while ${reinstated} came back by resurrection`)
    if (js.some((j) => lost.includes(j.targetId)))
      ruling('Q3', 'everyone went out and stays in; do jinxes on them land?')
    for (const id of contenders.keys()) outcome.set(id, 'through')
  }

  // Rule 14: a jinx lands when its target goes out.
  const jinxPoints = new Map<string, number>()
  for (const j of js) {
    if (contenders.has(j.jinxerId)) bad(`${j.jinxerId} is still in and can't jinx`)
    if (!contenders.has(j.targetId)) bad(`${j.jinxerId} jinxed ${j.targetId}, who isn't still in`)
    if (outcome.get(j.targetId) === 'out') jinxPoints.set(j.jinxerId, 1)
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

/** Rule 9: who wins the main game after settling `round`, or null if it carries on. Several = split. */
export function gameWinners(stillIn: string[], round: Round, table: Standing[]): string[] | null {
  if (round.stage === 'final') return topOfTable(table, stillIn)
  if (stillIn.length !== 1) return null
  if (round.stage === 'pool' && round.number < 4)
    ruling('Q10', `only ${stillIn[0]} is left after round ${round.number}`)
  return stillIn
}

/** Rule 15: fewest prediction points (jinx excluded); tied, whoever went out of the main game first. */
export function forfeitLosers(results: RoundResult[], rounds: Round[]): string[] {
  const table = pointsTable(results)
  const fewest = Math.min(...table.map((s) => s.predictionPoints))
  const tied = table.filter((s) => s.predictionPoints === fewest).map((s) => s.playerId)
  const numberOf = new Map(rounds.map((r) => [r.id, r.number]))
  const exits = (id: string) =>
    results
      .filter((r) => r.playerId === id && r.outcome === 'out')
      .map((r) => numberOf.get(r.roundId) ?? bad(`unknown round ${r.roundId}`))
  const firstOut = (which: (rounds: number[]) => number) => {
    const at = new Map(tied.map((id) => [id, exits(id).length ? which(exits(id)) : Infinity]))
    const first = Math.min(...at.values())
    return tied.filter((id) => at.get(id) === first)
  }
  const byFirstExit = firstOut((ns) => Math.min(...ns))
  if (byFirstExit.join() !== firstOut((ns) => Math.max(...ns)).join())
    ruling('Q11', `forfeit tie between ${tied} depends on which exit counts for a bought-back player`)
  return byFirstExit
}
