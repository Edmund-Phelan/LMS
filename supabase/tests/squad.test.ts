import { beforeEach, describe, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

// round_pick_status (docs/UI-REDESIGN.md §8.1): picked / not picked for everyone, never a team.
const EDDIE = '00000000-0000-0000-0000-00000000000e' // admin
const BEN = '00000000-0000-0000-0000-00000000000b'
const CON = '00000000-0000-0000-0000-00000000000c'

let db: Db
let r1: number
const status = (uid: string | null) => as(db, uid, 'select * from round_pick_status($1)', [r1])

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
  await db.query(`insert into payments (player_id, kind, amount_eur) select id, 'entry', 10 from players`) // pay before you pick
  const leinster = (await db.query<{ id: number }>(`select id from teams where slug = 'leinster'`)).rows[0].id
  await as(db, BEN, 'select make_pick($1, $2)', [r1, leinster])
})

describe('round_pick_status', () => {
  it('before the lock: everyone sees who has picked, and only player_id + has_pick come back', async () => {
    for (const uid of [CON, EDDIE]) {
      const rows = await status(uid)
      expect(rows).toEqual([
        { player_id: BEN, has_pick: true },
        { player_id: CON, has_pick: false },
        { player_id: EDDIE, has_pick: false },
      ])
      expect(rows.every((r) => Object.keys(r).sort().join() === 'has_pick,player_id')).toBe(true)
    }
  })

  it('leaks no team: the function has no team column and picks RLS still hides the row', async () => {
    const cols = (
      await db.query<{ cols: string }>(
        `select pg_get_function_result('round_pick_status(bigint)'::regprocedure) as cols`,
      )
    ).rows[0].cols
    expect(cols).toBe('TABLE(player_id uuid, has_pick boolean)')
    expect(await as(db, CON, 'select * from picks where round_id = $1', [r1])).toHaveLength(0)
    expect(await as(db, EDDIE, 'select * from picks where round_id = $1', [r1])).toHaveLength(0)
    expect(await as(db, BEN, 'select * from picks where round_id = $1', [r1])).toHaveLength(1)
  })

  it('is for signed-in players only', async () => {
    await expect(status(null)).rejects.toThrow(/permission denied/)
  })

  it('lists only players still in the round', async () => {
    const r2 = (await db.query<{ id: number }>('select id from rounds where number = 2')).rows[0].id
    await db.query(
      `insert into round_results (round_id, player_id, outcome) values ($1, $2, 'through'), ($1, $3, 'out'), ($1, $4, 'out')`,
      [r1, BEN, CON, EDDIE],
    )
    await db.query('update rounds set settled_at = now() where id = $1', [r1])
    expect(await as(db, CON, 'select * from round_pick_status($1)', [r2])).toEqual([
      { player_id: BEN, has_pick: false },
    ])
  })
})
