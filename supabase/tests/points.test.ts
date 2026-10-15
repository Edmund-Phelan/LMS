import { beforeEach, describe, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

// points_table (docs/UI-REDESIGN.md §8.2).
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

let db: Db
beforeEach(async () => {
  db = await freshDb()
  for (const [id, name] of [
    [A, 'Aoife'],
    [B, 'Bren'],
    [C, 'Cian'],
  ]) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name) values ($1, $2)', [id, name])
  }
})

const table = (uid: string | null = A) => as(db, uid, 'select * from points_table()')

describe('points_table', () => {
  it('lists everyone on 0 before any round is settled, all still in for Round 1', async () => {
    expect(await table()).toEqual(
      [A, B, C].map((player_id) => ({ player_id, points: 0, prediction_points: 0, exact: 0, jinx: 0, alive: true })),
    )
  })

  it('sums prediction + jinx points, sorts by points then exact then name, and knows who is out', async () => {
    const [r1, r2] = (await db.query<{ id: number }>('select id from rounds order by number limit 2')).rows.map((r) => r.id)
    await db.query(
      `insert into round_results (round_id, player_id, outcome, prediction_points, exact_score, jinx_points) values
       ($1, $3, 'through', 5, true, 0), ($1, $4, 'out', 3, false, 0), ($1, $5, 'through', 1, false, 0),
       ($2, $3, 'through', 0, false, 0), ($2, $4, 'already_out', 1, false, 1), ($2, $5, 'through', 3, false, 0)`,
      [r1, r2, A, B, C],
    )
    await db.query('update rounds set settled_at = now() where id in ($1, $2)', [r1, r2])
    expect(await table(B)).toEqual([
      { player_id: A, points: 5, prediction_points: 5, exact: 1, jinx: 0, alive: true },
      { player_id: B, points: 5, prediction_points: 4, exact: 0, jinx: 1, alive: false },
      { player_id: C, points: 4, prediction_points: 4, exact: 0, jinx: 0, alive: true },
    ])
  })

  it('is for signed-in players only', async () => {
    await expect(table(null)).rejects.toThrow(/permission denied/)
  })
})
