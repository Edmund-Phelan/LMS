// NEXT.md packet 5: the admin flow end to end on Round 1's real fixtures — open → results → settle →
// unsettle → settle — using the admin page's own mapping (build), engine run and settle payload
// (settleArgs), against the real migrations. Rows are read as the admin through RLS, like the page.
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import * as E from '../../src/engine/engine'
import { as, freshDb, type Db } from './db'

vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost') // adminData imports the Supabase client; it's never called
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'x')
let A: typeof import('../../src/adminData')
let R: typeof import('../../src/recapData')
beforeAll(async () => {
  A = await import('../../src/adminData')
  R = await import('../../src/recapData')
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

  // §22: the preview names who won't count, with Skint's claim confirmable from there.
  const d1 = await load(1)
  const nc = A.notCounted(d1, A.runEngine(d1, A.shuffle([...d1.teams.keys()])))
  expect(nc.map(({ playerId, reason, claim }) => [playerId, reason, claim?.player_id])).toEqual([
    [NOPICK, 'no pick', undefined],
    [SKINT, 'claim not confirmed', SKINT],
  ])

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

  // Eddie and Ben watch the Round 1 recap; Conn hasn't opened the app yet.
  await as(db, EDDIE, 'update players set seen_recap_round = 1 where id = $1', [EDDIE])
  await as(db, BEN, 'update players set seen_recap_round = 1 where id = $1', [BEN])

  // The Connacht score was wrong: unsettle (clears Eddie's Round 2 pick), correct, settle again.
  expect(await as(db, EDDIE, 'select unsettle_round($1) as r', [r1])).toEqual([{ r: { picks: 1, jinxes: 0 } }])
  // §19: everyone who saw Round 1's recap gets the corrected one.
  expect(
    (await db.query('select id, seen_recap_round s from players where id = any($1) order by id', [[EDDIE, BEN, CONN]]))
      .rows,
  ).toEqual(
    [
      { id: EDDIE, s: 0 },
      { id: BEN, s: 0 },
      { id: CONN, s: null },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  )
  await score('connacht', 15, 22)
  const again = await settle(1)
  expect(await outcomes(r1)).toMatchObject({ [BEN]: 'through', [CONN]: 'out', [SKINT]: 'already_out' })
  expect((await db.query('select tiebreak from rounds where id = $1', [r1])).rows[0]).toEqual({ tiebreak: again.draw })
  expect(again.stillIn.sort()).toEqual([BEN, EDDIE, MOSSY].sort())

  // §22: both see "Not in this year" in Round 2, keyed on their own Round 1 already_out, and they're not in the squad.
  for (const uid of [SKINT, NOPICK]) {
    expect(
      await as(db, uid, 'select outcome from round_results where round_id = $1 and player_id = $2', [r1, uid]),
    ).toEqual([{ outcome: 'already_out' }])
    expect(await as(db, uid, 'select alive($1, $2) as a', [uid, r2])).toEqual([{ a: false }])
  }
  expect(
    (await as<{ player_id: string }>(db, SKINT, 'select * from round_pick_status($1)', [r2])).map((r) => r.player_id),
  ).not.toContain(SKINT)

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

  // Jinx, then a buy-back claim (which puts Ben back in, so the jinx goes), and the overlay's seen flag.
  await as(
    db,
    BEN,
    `insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)
     on conflict (round_id, jinxer_id) do update set target_id = excluded.target_id`,
    [r2, BEN, EDDIE],
  )
  expect(await as(db, BEN, 'select target_id from jinxes where round_id = $1', [r2])).toEqual([{ target_id: EDDIE }])
  expect(await as(db, EDDIE, 'select * from jinxes where round_id = $1', [r2])).toEqual([]) // hidden until the lock
  await as(db, BEN, `insert into payments (player_id, kind, amount_eur) values ($1, 'buyback', 10)`, [BEN])
  expect(await as(db, BEN, 'select target_id from jinxes where round_id = $1', [r2])).toEqual([])
  await as(db, BEN, 'update players set seen_recap_round = 1 where id = $1', [BEN])
  expect((await db.query('select seen_recap_round s from players where id = $1', [BEN])).rows[0]).toEqual({
    s: 1,
  })
})

// Packet 5e (§19): the recap each player gets after a settle, built from their own RLS view of the settled round.
it('round recap: survivor with an exact score, out player whose jinx landed, no prediction; unsettle replays', async () => {
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
  await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r1])
  await score('asm-clermont-auvergne', 10, 24) // Leinster win away
  await score('connacht', 17, 17) // Saracens draw: Ben out
  await settle(1)

  // Round 2: Eddie and Mossy back home winners, Conn a home team that loses. Featured = Eddie's match.
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r2])
  const used = [await team('leinster'), await team('bath-rugby'), await team('saracens')]
  const fx = (
    await db.query<{ id: number; home: number }>(
      'select id, home_team_id home from matches where round_id = $1 order by kickoff_at, id',
      [r2],
    )
  ).rows.filter((m) => !used.includes(m.home))
  await pick(EDDIE, r2, fx[0].home)
  await pick(MOSSY, r2, fx[1].home)
  await pick(CONN, r2, fx[2].home)
  await db.query('update rounds set featured_match_id = $1 where id = $2', [fx[0].id, r2])
  const predict = (uid: string, h: number, a: number) =>
    as(db, uid, 'insert into predictions (round_id, player_id, home_score, away_score) values ($1, $2, $3, $4)', [
      r2,
      uid,
      h,
      a,
    ])
  await predict(EDDIE, 20, 10) // exact
  await predict(BEN, 22, 12) // off by 4: 3 points
  await predict(CONN, 10, 20) // wrong winner
  // Mossy: no prediction
  await as(db, BEN, 'insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)', [r2, BEN, CONN])
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r2])
  await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r2])
  await db.query('update matches set home_score = 10, away_score = 20 where id = $1', [fx[2].id])
  await settle(2)

  async function recapFor(uid: string) {
    const q = <T>(sql: string, params: unknown[] = []) => as(db, uid, sql, params).then((r) => json<T>(r))
    const rounds = await q<A.Rows['rounds']>('select * from rounds order by number')
    const round = rounds.findLast((r) => r.settled_at)!
    return R.buildRecap(uid, {
      round,
      next: rounds.find((r) => r.number > round.number),
      results: await q(
        'select player_id, outcome, prediction_points, jinx_points from round_results where round_id = $1',
        [round.id],
      ),
      entrants: (
        await q<unknown[]>(`select 1 from round_results where round_id = $1 and outcome <> 'already_out'`, [r1])
      ).length,
      matches: await q('select * from matches where round_id = $1', [round.id]),
      teams: await q('select * from teams'),
      players: await q('select id, name, nickname, avatar_url, kit_colour from players'),
      picks: await q('select player_id, team_id from picks where round_id = $1', [round.id]),
      pred:
        (
          await q<RecapPred[]>(
            'select home_score, away_score from predictions where round_id = $1 and player_id = $2',
            [round.id, uid],
          )
        )[0] ?? null,
      jinxes: await q('select jinxer_id, target_id from jinxes where round_id = $1', [round.id]),
      table: await q('select * from points_table()'),
    })
  }
  type RecapPred = { home_score: number; away_score: number }
  const shape = async (uid: string) =>
    (await recapFor(uid)).cards.map((c) =>
      c.type === 'pred' ? `pred:${c.kind}:${c.big}` : c.type === 'jinx' ? `jinx:${c.kind}` : c.type,
    )

  expect(await shape(EDDIE)).toEqual(['through', 'pred:exact:+5'])
  expect(await shape(CONN)).toEqual(['out', 'pred:zero:0'])
  expect(await shape(BEN)).toEqual(['pred:points:+3', 'jinx:landed'])
  expect(await shape(MOSSY)).toEqual(['through'])

  const eddie = await recapFor(EDDIE)
  const through = eddie.cards[0] as Extract<(typeof eddie.cards)[0], { type: 'through' }>
  expect(through.clash).toMatchObject({ win: 'h', mine: fx[0].home, score: '20–10' })
  expect(through.sub).toMatch(/^2 of 4 still in\. Round 3 picks lock Fri 8 Jan · 20:00\.$/)
  expect(eddie.final).toBe('Into Round 3')
  const conn = await recapFor(CONN)
  expect(conn.cards[0]).toMatchObject({ type: 'out', clash: { win: 'a' } })
  expect((conn.cards[0] as { sub: string }).sub).toMatch(/won it\. .*ways back in\. Ben jinxed you\.$/)
  expect(conn.final).toBe('See ways back in')
  expect((await recapFor(MOSSY)).cards[0]).toMatchObject({ extra: 'No prediction this round' })
  expect((await recapFor(BEN)).cards[1]).toMatchObject({
    who: { id: CONN },
    sub: expect.stringMatching(/^You jinxed Conn/),
  })

  // Seen once; unsettle sets it back so the corrected settle plays again.
  await as(db, EDDIE, 'update players set seen_recap_round = 2 where id = $1', [EDDIE])
  await as(db, EDDIE, 'select unsettle_round($1)', [r2])
  expect((await db.query('select seen_recap_round s from players where id = $1', [EDDIE])).rows[0]).toEqual({ s: 1 })
  await settle(2)
  expect(await shape(EDDIE)).toEqual(['through', 'pred:exact:+5'])
})

// Packet 7: a confirmed buy-back puts Conn back in for Round 2 before the settle, with the engine's burns enforced.
it('buy-back: a claim lets them pick (not a burned team), is auto-picked, can’t jinx; settles once confirmed', async () => {
  for (const p of [EDDIE, CONN, BEN, MOSSY]) await as(db, CONN, `select mark_paid($1)`, [p])
  await pick(EDDIE, r1, await team('leinster'))
  await pick(CONN, r1, await team('munster-rugby')) // loses: out
  await pick(BEN, r1, await team('saracens'))
  await pick(MOSSY, r1, await team('leinster')) // Leinster most-picked in Round 1
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r1])
  await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r1])
  await score('asm-clermont-auvergne', 10, 24) // Leinster win away
  await score('munster-rugby', 10, 20) // Munster lose at home
  await settle(1)
  expect((await outcomes(r1))[CONN]).toBe('out')
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r2])

  // Eddie, 18 Oct: claimed is enough to play.
  const [{ id }] = await as<{ id: number }>(
    db,
    CONN,
    `insert into payments (player_id, kind, amount_eur) values ($1, 'buyback', 10) returning id`,
    [CONN],
  )
  await db.query(`update payments set claimed_at = now() - interval '1 hour' where id = $1`, [id]) // well before the lock
  await pick(CONN, r2, await team('sale-sharks'))

  // Rejected: out again, and the pick it allowed is gone. Claim again for the rest of the test.
  await as(db, EDDIE, 'delete from payments where id = $1', [id])
  expect((await db.query('select 1 from picks where round_id = $1 and player_id = $2', [r2, CONN])).rows).toEqual([])
  await expect(pick(CONN, r2, await team('sale-sharks'))).rejects.toThrow(/not in this round/)
  await as(db, CONN, `insert into payments (player_id, kind, amount_eur) values ($1, 'buyback', 10)`, [CONN])
  await db.query(`update payments set claimed_at = now() - interval '1 hour' where kind = 'buyback'`)

  // Back in, and the database agrees with the engine on the burns.
  expect(await as(db, CONN, 'select * from round_status($1) where player_id = $2', [r2, CONN])).toEqual([
    { player_id: CONN, alive: true, bought_back: true },
  ])
  expect(
    (await as<{ player_id: string }>(db, BEN, 'select * from round_pick_status($1)', [r2])).map((r) => r.player_id),
  ).toContain(CONN)
  const d2 = await load(2)
  const engine = E.reentryBurns(d2.history, CONN, A.toRound(d2.round), 'buyback_penalty').map((b) => b.teamId)
  expect(engine).toEqual([await team('leinster')])
  expect(
    (await as<{ team_id: number }>(db, CONN, 'select * from my_pending_burns($1)', [r2])).map((r) => r.team_id),
  ).toEqual(engine)
  expect(await as(db, EDDIE, 'select * from my_pending_burns($1)', [r2])).toEqual([]) // alive: none

  await expect(pick(CONN, r2, await team('leinster'))).rejects.toThrow(/burned/)
  await expect(pick(CONN, r2, await team('munster-rugby'))).rejects.toThrow(/already used/)
  await expect(
    as(db, CONN, 'insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)', [r2, CONN, EDDIE]),
  ).rejects.toThrow(/row-level security/)

  // Lock: Conn didn't pick, so the lock job picks for them, never a burned or used team.
  await pick(EDDIE, r2, await team('sale-sharks'))
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r2])
  await db.query('select auto_pick_locked_rounds()')
  const auto = (
    await db.query<{ team_id: number; is_auto: boolean }>(
      'select team_id, is_auto from picks where round_id = $1 and player_id = $2',
      [r2, CONN],
    )
  ).rows[0]
  expect(auto.is_auto).toBe(true)
  expect([await team('leinster'), await team('munster-rugby')]).not.toContain(auto.team_id)

  // Round 2 settles with Conn through or out, and the burn written, but only once the claim is confirmed.
  await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r2])
  await expect(settle(2)).rejects.toThrow(/claim isn't confirmed/)
  await as(db, EDDIE, `select mark_paid($1, 'buyback')`, [CONN])
  await settle(2)
  expect(['through', 'out']).toContain((await outcomes(r2))[CONN])
  expect(
    (await db.query('select team_id, reason from burned_teams where player_id = $1 and round_id = $2', [CONN, r2]))
      .rows,
  ).toEqual([{ team_id: engine[0], reason: 'buyback_penalty' }])
})

// Packet 7: the Round 4 resurrection (rule 12): out players only, an away team, not used or burned for the comeback,
// not with a buy-back; a win settles as reinstated with the engine's burns.
it('resurrection: Round 4 only, out players, away teams, not burned; a buy-back drops it; a win reinstates', async () => {
  for (const p of [EDDIE, CONN, BEN, MOSSY]) await as(db, CONN, `select mark_paid($1)`, [p])
  await pick(EDDIE, r1, await team('leinster'))
  await pick(CONN, r1, await team('munster-rugby')) // loses: out
  await pick(BEN, r1, await team('saracens'))
  await pick(MOSSY, r1, await team('leinster'))
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r1])
  await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r1])
  await score('asm-clermont-auvergne', 10, 24)
  await score('munster-rugby', 10, 20)
  await settle(1)

  const ids = (await db.query<{ id: number; number: number }>('select id, number from rounds')).rows
  const r3 = ids.find((r) => r.number === 3)!.id
  const r4 = ids.find((r) => r.number === 4)!.id
  const away = async (r: number) =>
    (await db.query<{ t: number }>('select away_team_id t from matches where round_id = $1', [r])).rows.map((x) => x.t)
  const resurrect = (uid: string, r: number, t: number) =>
    as(db, uid, 'select * from make_resurrection_pick($1, $2)', [r, t])

  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r2])
  await expect(resurrect(CONN, r2, (await away(r2))[0])).rejects.toThrow(/Round 4 only/)
  for (const r of [r2, r3]) {
    await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r])
    await db.query('select auto_pick_locked_rounds()')
    await db.query(`update matches set status = 'completed', home_score = 20, away_score = 10 where round_id = $1`, [r])
    await settle(r === r2 ? 2 : 3)
  }
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r4])

  const d4 = await load(4)
  const engine = E.reentryBurns(d4.history, CONN, A.toRound(d4.round), 'resurrection_penalty').map((b) => b.teamId)
  expect(engine).toHaveLength(3) // out in Round 1, sat out 2 and 3
  expect(
    (await as<{ team_id: number }>(db, CONN, 'select * from my_pending_burns($1)', [r4])).map((r) => r.team_id).sort(),
  ).toEqual([...engine].sort())

  const aways = await away(r4)
  const homes = (await db.query<{ t: number }>('select home_team_id t from matches where round_id = $1', [r4])).rows
  await expect(resurrect(CONN, r4, homes[0].t)).rejects.toThrow(/away team/)
  for (const t of engine.filter((t) => aways.includes(t)))
    await expect(resurrect(CONN, r4, t)).rejects.toThrow(/burned/)
  const status = await as<{ player_id: string; alive: boolean }>(db, EDDIE, 'select * from round_status($1)', [r4])
  const inR4 = status.find((s) => s.alive)!.player_id
  await expect(resurrect(inR4, r4, aways[0])).rejects.toThrow(/players who are out/)
  await expect(resurrect(SKINT, r4, aways[0])).rejects.toThrow(/players who are out/) // never in the comp

  const used = (await as<{ team_id: number }>(db, CONN, 'select * from my_used_teams($1)', [r4])).map((u) => u.team_id)
  const free = aways.find((t) => !engine.includes(t) && !used.includes(t))!
  expect((await resurrect(CONN, r4, free))[0]).toMatchObject({ team_id: free, is_resurrection: true })

  // A buy-back claim wins: the resurrection pick becomes their normal pick, and they can't make another.
  await as(db, CONN, `insert into payments (player_id, kind, amount_eur) values ($1, 'buyback', 10)`, [CONN])
  expect(
    (await db.query('select team_id, is_resurrection from picks where round_id = $1 and player_id = $2', [r4, CONN]))
      .rows,
  ).toEqual([{ team_id: free, is_resurrection: false }])
  await expect(resurrect(CONN, r4, free)).rejects.toThrow(/players who are out/)
  await as(db, EDDIE, `delete from payments where kind = 'buyback'`) // rejected: the pick goes, out again

  // Away wins everywhere: Conn's resurrection wins → reinstated, with the engine's burns.
  await resurrect(CONN, r4, free)
  await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r4])
  await db.query('select auto_pick_locked_rounds()')
  expect(
    (await db.query('select is_resurrection from picks where round_id = $1 and player_id = $2', [r4, CONN])).rows,
  ).toEqual([{ is_resurrection: true }])
  await db.query(`update matches set status = 'completed', home_score = 10, away_score = 20 where round_id = $1`, [r4])
  await settle(4)
  expect((await outcomes(r4))[CONN]).toBe('reinstated')
  expect(
    (
      await db.query<{ team_id: number }>(
        `select team_id from burned_teams where player_id = $1 and round_id = $2 and reason = 'resurrection_penalty'`,
        [CONN, r4],
      )
    ).rows
      .map((r) => r.team_id)
      .sort(),
  ).toEqual([...engine].sort())
})
