import { beforeEach, describe, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

// players.seen_elimination_round (spec §17): own row only, and it opens no other column.
const BEN = '00000000-0000-0000-0000-00000000000b'
const CON = '00000000-0000-0000-0000-00000000000c'
let db: Db

beforeEach(async () => {
  db = await freshDb()
  for (const [id, name] of [
    [BEN, 'Ben'],
    [CON, 'Con'],
  ]) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name) values ($1, $2)', [id, name])
  }
})
const seen = async (id: string) =>
  (await db.query<{ s: number | null }>('select seen_elimination_round s from players where id = $1', [id])).rows[0].s

describe('seen_elimination_round', () => {
  it('a player can set their own', async () => {
    await as(db, BEN, 'update players set seen_elimination_round = 1 where id = $1', [BEN])
    expect(await seen(BEN)).toBe(1)
  })
  it("can't touch anyone else's, or is_admin", async () => {
    await as(db, BEN, 'update players set seen_elimination_round = 1 where id = $1', [CON])
    expect(await seen(CON)).toBeNull()
    await expect(
      as(db, BEN, 'update players set seen_elimination_round = 1, is_admin = true where id = $1', [BEN]),
    ).rejects.toThrow(/permission denied/)
  })
  it('anon gets nothing', async () => {
    await expect(as(db, null, 'update players set seen_elimination_round = 1')).rejects.toThrow(/permission denied/)
  })
})
