import { beforeEach, describe, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

// mark_paid (admin marks a player paid with no claim) and clear_pick (take your pick back before the lock).
const EDDIE = '00000000-0000-0000-0000-00000000000e'
const BEN = '00000000-0000-0000-0000-00000000000b'
const CON = '00000000-0000-0000-0000-00000000000c'
let db: Db
let r1: number

beforeEach(async () => {
  db = await freshDb()
  for (const [id, name, admin] of [
    [EDDIE, 'Eddie', true],
    [BEN, 'Ben', false],
    [CON, 'Con', false],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name, is_admin) values ($1, $2, $3)', [id, name, admin])
  }
  r1 = (await db.query<{ id: number }>('select id from rounds where number = 1')).rows[0].id
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r1])
  for (const id of [BEN, CON])
    await db.query(`insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10)`, [id])
})
const pay = async (id: string) =>
  (await db.query('select kind, status, amount_eur::int amt, confirmed_by from payments where player_id = $1', [id]))
    .rows

describe('mark_paid', () => {
  it('an admin marks a player paid with no claim', async () => {
    await db.query('delete from payments')
    await as(db, EDDIE, 'select mark_paid($1)', [BEN])
    expect(await pay(BEN)).toEqual([{ kind: 'entry', status: 'confirmed', amt: 10, confirmed_by: EDDIE }])
  })
  it('confirms an existing claim, and refuses a second time', async () => {
    await db.query('delete from payments')
    await as(db, BEN, `insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10)`, [BEN])
    await as(db, EDDIE, 'select mark_paid($1)', [BEN])
    expect(await pay(BEN)).toEqual([{ kind: 'entry', status: 'confirmed', amt: 10, confirmed_by: EDDIE }])
    await expect(as(db, EDDIE, 'select mark_paid($1)', [BEN])).rejects.toThrow(/Already paid/)
  })
  it('non-admins and anon cannot', async () => {
    await expect(as(db, BEN, 'select mark_paid($1)', [BEN])).rejects.toThrow(/Only admins/)
    await expect(as(db, null, 'select mark_paid($1)', [BEN])).rejects.toThrow(/permission denied/)
    expect(await pay(BEN)).toEqual([{ kind: 'entry', status: 'claimed', amt: 10, confirmed_by: null }])
  })
})

describe('clear_pick', () => {
  const team = async () =>
    (await db.query<{ t: number }>('select home_team_id t from matches where round_id = $1 limit 1', [r1])).rows[0].t
  const mine = async (id: string) =>
    (await db.query('select team_id from picks where player_id = $1', [id])).rows.length
  it('removes only my own pick, before the lock', async () => {
    const t = await team()
    await as(db, BEN, 'select make_pick($1, $2)', [r1, t])
    await as(db, CON, 'select make_pick($1, $2)', [r1, t])
    await as(db, BEN, 'select clear_pick($1)', [r1])
    expect(await mine(BEN)).toBe(0)
    expect(await mine(CON)).toBe(1)
  })
  it('refused after the lock (server clock)', async () => {
    await as(db, BEN, 'select make_pick($1, $2)', [r1, await team()])
    await db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [r1])
    await expect(as(db, BEN, 'select clear_pick($1)', [r1])).rejects.toThrow(/Picks are locked/)
    expect(await mine(BEN)).toBe(1)
  })
  it('anon cannot', async () => {
    await expect(as(db, null, 'select clear_pick($1)', [r1])).rejects.toThrow(/permission denied/)
  })
})

describe('Round 1: pay before you pick', () => {
  const team = async () =>
    (await db.query<{ t: number }>('select home_team_id t from matches where round_id = $1 limit 1', [r1])).rows[0].t
  it('no claim, no pick; a claim (unconfirmed) is enough', async () => {
    await db.query('delete from payments')
    await expect(as(db, CON, 'select make_pick($1, $2)', [r1, await team()])).rejects.toThrow(
      /Pay your €10 entry first/,
    )
    await as(db, CON, `insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10)`, [CON])
    await as(db, CON, 'select make_pick($1, $2)', [r1, await team()])
  })
})
