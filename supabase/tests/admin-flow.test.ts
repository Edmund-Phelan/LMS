// NEXT.md packet 5: the admin flow end to end on Round 1's real fixtures — open → results → settle →
// unsettle → settle — using the admin page's own mapping (build), engine run and settle payload
// (settleArgs), against the real migrations. Rows are read as the admin through RLS, like the page.
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import * as E from '../../src/engine/engine'
import { as, freshDb, type Db } from './db'

vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost') // adminData imports the Supabase client; it's never called
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'x')
let A: typeof import('../../src/adminData')
beforeAll(async () => {
  A = await import('../../src/adminData')
})

const EDDIE = '00000000-0000-0000-0000-00000000000e'
const CONN = '00000000-0000-0000-0000-00000000000c'
const BEN = '00000000-0000-0000-0000-00000000000b'
const MOSSY = '00000000-0000-0000-0000-00000000000a'
const SKINT = '00000000-0000-0000-0000-00000000000d' // picks but never pays
const NOPICK = '00000000-0000-0000-0000-000000000001' // pays but never picks

let db: Db
let r1: number, r2: number
const team = async (slug: string) =>
  (await db.query<{ id: number }>('select id from teams where slug = $1', [slug])).rows[0].id

/** PGlite gives Dates and numeric strings; PostgREST gives ISO strings and numbers. */
const json = <T>(rows: unknown[]) => JSON.parse(JSON.stringify(rows)) as T

async function load(number: number, uid = EDDIE) {
  const q = <T>(sql: string, params: unknown[] = []) => as(db, uid, sql, params).then((r) => json<T>(r))
  const rounds = await q<A.Rows['rounds']>('select * from rounds order by number')
  const id = rounds.find((r) => r.number === number)!.id
  return A.build(number, {
    rounds,
    teams: await q('select * from teams'),
    players: await q('select id, name, nickname, is_admin from players order by name'),
    matches: await q('select * from matches where round_id = $1 order by kickoff_at', [id]),
    picks: await q('select round_id, player_id, team_id, is_auto, is_resurrection from picks'),
    results: await q('select * from round_results'),
    burns: await q('select player_id, team_id, round_id, reason from burned_teams'),
    predictions: await q('select player_id, home_score, away_score from predictions where round_id = $1', [id]),
    jinxes: await q('select jinxer_id, target_id from jinxes where round_id = $1', [id]),
    payments: (
      await q<A.Rows['payments']>('select id, player_id, kind, amount_eur, status, claimed_at from payments')
    ).map((p) => ({ ...p, amount_eur: Number(p.amount_eur) })),
    me: uid,
  })!
}

/** Admin page: Preview → Confirm (re-run on fresh data with the same draw, then settle_round). */
async function settle(number: number) {
  const data = await load(number)
  const preview = A.runEngine(data, A.shuffle([...data.teams.keys()]))
  expect(A.runEngine(await load(number), preview.draw)).toEqual(preview) // the page's "nothing changed" check
  await as(
    db,
    EDDIE,
    'select settle_round($1, $2, $3, $4)',
    Object.values(A.settleArgs(data.round.id, preview)).map((v, i) => (i > 1 ? JSON.stringify(v) : v)),
  )
  return preview
}

const outcomes = async (round: number) =>
  Object.fromEntries(
    (
      await db.query<{ player_id: string; outcome: string }>(
        'select player_id, outcome from round_results where round_id = $1',
        [round],
      )
    ).rows.map((r) => [r.player_id, r.outcome]),
  )
const pick = (uid: string, round: number, teamId: number) =>
  as(db, uid, 'select * from make_pick($1, $2)', [round, teamId])
const score = async (home: string, h: number, a: number) =>
  as(
    db,
    CONN,
    `update matches set status = 'completed', home_score = $1, away_score = $2 where round_id = $3 and home_team_id = $4`,
    [h, a, r1, await team(home)],
  )

beforeEach(async () => {
  db = await freshDb()
  for (const [id, name, admin] of [
    [EDDIE, 'Eddie', true],
    [CONN, 'Conn', true],
    [BEN, 'Ben', false],
    [MOSSY, 'Mossy', false],
    [SKINT, 'Skint', false],
    [NOPICK, 'Nopick', false],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name, is_admin) values ($1, $2, $3)', [id, name, admin])
  }
  const ids = (await db.query<{ id: number; number: number }>('select id, number from rounds')).rows
  r1 = ids.find((r) => r.number === 1)!.id
  r2 = ids.find((r) => r.number === 2)!.id
  // Picks open for Round 1 (the seeded lock is Fri 16 Oct; keep it in the future whenever this runs).
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r1])
})

it('Round 1: pay, pick, lock, results, settle, unsettle, correct, settle again; Round 2 opens', async () => {
  // Entry: everyone claims; Skint's claim is never confirmed.
  for (const p of [EDDIE, CONN, BEN, MOSSY, SKINT, NOPICK]) {
    const [{ id }] = await as<{ id: number }>(
      db,
      p,
      `insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10) returning id`,
      [p],
    )
    if (p !== SKINT) await as(db, CONN, 'select confirm_payment($1)', [id])
  }
  await as(db, EDDIE, 'select draw_featured_match($1)', [r1])

  await pick(EDDIE, r1, await team('leinster')) // away at Clermont: wins
  await pick(CONN, r1, await team('munster-rugby')) // v Racing: loses
  await pick(BEN, r1, await team('saracens')) // at Connacht: entered as a draw, later corrected to a win
  await pick(MOSSY, r1, await team('bath-rugby')) // v Montpellier: wins
  await pick(SKINT, r1, await team('leinster')) // wins, but never paid
  await as(db, BEN, 'insert into predictions (round_id, player_id, home_score, away_score) values ($1, $2, 20, 20)', [
    r1,
    BEN,
  ])

  // Lock: no auto-picks in Round 1, so Nopick stays without one.
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r1])
  expect((await db.query<{ n: number }>('select auto_pick_locked_rounds() as n')).rows[0].n).toBe(0)

  // Open panel (Round 1): nobody stuck, no clean slate.
  expect(
    E.openRound((await load(1)).history, A.toRound((await load(1)).round), (await load(1)).matches.map(A.toMatch)),
  ).toEqual({
    cleanSlate: false,
    noTeamsLeft: [],
  })

  // Results, entered by Conn. Every match needs one before the preview works.
  await expect(settle(1)).rejects.toThrow(/has no result yet/)
  const fixtures = (
    await db.query<{ home: string }>(
      'select h.slug as home from matches m join teams h on h.id = m.home_team_id where round_id = $1',
      [r1],
    )
  ).rows
  for (const { home } of fixtures) await score(home, 20, 10) // home wins by default…
  await score('asm-clermont-auvergne', 10, 24) // …Leinster win away
  await score('connacht', 17, 17) // Saracens draw: out (draw = loss)
  await score('munster-rugby', 10, 20) // Munster lose at home

  await settle(1)
  expect(await outcomes(r1)).toEqual({
    [EDDIE]: 'through',
    [CONN]: 'out',
    [BEN]: 'out',
    [MOSSY]: 'through',
    [SKINT]: 'already_out', // no confirmed entry
    [NOPICK]: 'already_out', // no pick, no entry
  })

  // Round 2 opens: survivors pick, the rest can't.
  const r2Team = await team('leinster') // used in Round 1 by Eddie
  await expect(pick(EDDIE, r2, r2Team)).rejects.toThrow(/already used/)
  await pick(EDDIE, r2, await team('sale-sharks'))
  await expect(pick(BEN, r2, await team('sale-sharks'))).rejects.toThrow(/not in this round/)

  // The Connacht score was wrong: unsettle (clears Eddie's Round 2 pick), correct, settle again.
  expect(await as(db, EDDIE, 'select unsettle_round($1) as r', [r1])).toEqual([{ r: { picks: 1, jinxes: 0 } }])
  await score('connacht', 15, 22)
  const again = await settle(1)
  expect(await outcomes(r1)).toMatchObject({ [BEN]: 'through', [CONN]: 'out', [SKINT]: 'already_out' })
  expect((await db.query('select tiebreak from rounds where id = $1', [r1])).rows[0]).toEqual({ tiebreak: again.draw })
  expect(again.stillIn.sort()).toEqual([BEN, EDDIE, MOSSY].sort())

  // Round 2: open panel runs on the settled history, and Ben is back in.
  const d2 = await load(2)
  expect(E.openRound(d2.history, A.toRound(d2.round), d2.matches.map(A.toMatch))).toEqual({
    cleanSlate: false,
    noTeamsLeft: [],
  })
  await pick(BEN, r2, await team('sale-sharks'))
})

// Packet 5d: a player knocked out in Round 1 opens Round 2. Everything the out screen needs works through their own RLS.
it('knocked out: buy-back burn chips, jinx and the seen flag, as the out player', async () => {
  for (const p of [EDDIE, CONN, BEN, MOSSY]) {
    const [{ id }] = await as<{ id: number }>(
      db,
      p,
      `insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10) returning id`,
      [p],
    )
    await as(db, CONN, 'select confirm_payment($1)', [id])
  }
  await pick(EDDIE, r1, await team('leinster'))
  await pick(CONN, r1, await team('leinster'))
  await pick(BEN, r1, await team('saracens'))
  await pick(MOSSY, r1, await team('bath-rugby'))
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r1])
  const fixtures = (
    await db.query<{ home: string }>(
      'select h.slug as home from matches m join teams h on h.id = m.home_team_id where round_id = $1',
      [r1],
    )
  ).rows
  for (const { home } of fixtures) await score(home, 20, 10)
  await score('asm-clermont-auvergne', 10, 24) // Leinster win away
  await score('connacht', 17, 17) // Saracens draw: Ben out
  await settle(1)
  expect((await outcomes(r1))[BEN]).toBe('out')
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r2])

  // GetBackIn: the engine on Ben's own view. Leinster (2 picks) is Round 1's most-picked: that's the burn.
  const d = await load(2, BEN)
  const st = E.playerState(d.history, BEN, A.toRound(d.round))
  expect(st.alive).toBe(false)
  expect(st.buybackUsed).toBe(false)
  expect([...st.used]).toEqual([await team('saracens')])
  expect(E.reentryBurns(d.history, BEN, A.toRound(d.round), 'buyback_penalty').map((b) => b.teamId)).toEqual([
    await team('leinster'),
  ])

  // Buy-back claim, jinx, and the overlay's seen flag.
  await as(db, BEN, `insert into payments (player_id, kind, amount_eur) values ($1, 'buyback', 10)`, [BEN])
  await as(
    db,
    BEN,
    `insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)
     on conflict (round_id, jinxer_id) do update set target_id = excluded.target_id`,
    [r2, BEN, EDDIE],
  )
  expect(await as(db, BEN, 'select target_id from jinxes where round_id = $1', [r2])).toEqual([{ target_id: EDDIE }])
  expect(await as(db, EDDIE, 'select * from jinxes where round_id = $1', [r2])).toEqual([]) // hidden until the lock
  await as(db, BEN, 'update players set seen_elimination_round = 1 where id = $1', [BEN])
  expect((await db.query('select seen_elimination_round s from players where id = $1', [BEN])).rows[0]).toEqual({
    s: 1,
  })
})
