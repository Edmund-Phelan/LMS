import { beforeEach, describe, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

const EDDIE = '00000000-0000-0000-0000-00000000000e' // admin, plays too
const BEN = '00000000-0000-0000-0000-00000000000b'
const OUTY = '00000000-0000-0000-0000-00000000000f' // went out in round 1

let db: Db
let r1: number, r2: number
const team = async (slug: string) =>
  (await db.query<{ id: number }>('select id from teams where slug = $1', [slug])).rows[0].id

const pick = (uid: string, round: number, teamId: number) =>
  as(db, uid, 'select * from make_pick($1, $2)', [round, teamId])
const lockNow = (round: number) =>
  db.query(`update rounds set lock_at = now() - interval '1 second' where id = $1`, [round])

beforeEach(async () => {
  db = await freshDb()
  await db.query('delete from matches') // tests use their own fixtures; the seeded ones are checked by their migration
  for (const [id, name, admin] of [
    [EDDIE, 'Eddie', true],
    [BEN, 'Ben', false],
    [OUTY, 'Outy', false],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name, is_admin) values ($1, $2, $3)', [id, name, admin])
  }
  const rounds = (await db.query<{ id: number; number: number }>('select id, number from rounds')).rows
  r1 = rounds.find((r) => r.number === 1)!.id
  r2 = rounds.find((r) => r.number === 2)!.id
  // Round 1 (imported from the Form): Eddie picked Leinster, Ben Munster, both through; Outy out.
  await db.query(
    `insert into matches (round_id, home_team_id, away_team_id, kickoff_at, status)
     select $1, h.id, a.id, now(), 'completed' from teams h, teams a where h.slug = 'leinster' and a.slug = 'munster-rugby'`,
    [r1],
  )
  await db.query(`insert into picks (round_id, player_id, team_id) values ($1, $2, $4), ($1, $3, $5), ($1, $6, $5)`, [
    r1,
    EDDIE,
    BEN,
    await team('leinster'),
    await team('munster-rugby'),
    OUTY,
  ])
  await db.query(
    `insert into round_results (round_id, player_id, outcome) values ($1, $2, 'through'), ($1, $3, 'through'), ($1, $4, 'out')`,
    [r1, EDDIE, BEN, OUTY],
  )
  await db.query('update rounds set settled_at = now() where id = $1', [r1])
  // Round 2: Leinster v Toulouse, Munster v Saracens; lock in an hour.
  await db.query(
    `insert into matches (round_id, home_team_id, away_team_id, kickoff_at)
     select $1, h.id, a.id, now() + interval '2 hours' from teams h, teams a
     where (h.slug, a.slug) in (('leinster', 'stade-toulousain'), ('munster-rugby', 'saracens'))`,
    [r2],
  )
  await db.query(`update rounds set lock_at = now() + interval '1 hour' where id = $1`, [r2])
})

describe('lock times', () => {
  it('stores Irish 8pm in UTC across the 25 Oct clock change', async () => {
    const seeded = await freshDb() // beforeEach moves Round 2's lock
    const rows = (
      await seeded.query<{ number: number; utc: string }>(
        `select number, to_char(lock_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc from rounds order by number`,
      )
    ).rows
    expect(rows.map((r) => r.utc)).toEqual([
      '2026-10-16 19:00',
      '2026-12-11 20:00',
      '2027-01-08 20:00',
      '2027-01-15 20:00',
    ])
  })
})

describe('picks are private until the lock', () => {
  it('hides picks from everyone else, admins included, then reveals them at lock', async () => {
    await pick(BEN, r2, await team('saracens'))
    const sel = 'select player_id from picks where round_id = $1'
    expect(await as(db, BEN, sel, [r2])).toHaveLength(1)
    expect(await as(db, EDDIE, sel, [r2])).toHaveLength(0)
    expect(await as(db, null, sel, [r2])).toHaveLength(0)
    await lockNow(r2)
    expect(await as(db, EDDIE, sel, [r2])).toHaveLength(1)
    expect(await as(db, null, sel, [r2])).toHaveLength(0)
  })

  it('hides predictions and jinxes until the lock', async () => {
    await as(db, BEN, 'insert into predictions (round_id, player_id, home_score, away_score) values ($1, $2, 20, 10)', [
      r2,
      BEN,
    ])
    await as(db, OUTY, 'insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)', [r2, OUTY, BEN])
    expect(await as(db, EDDIE, 'select 1 from predictions')).toHaveLength(0)
    expect(await as(db, EDDIE, 'select 1 from jinxes')).toHaveLength(0)
    await lockNow(r2)
    expect(await as(db, EDDIE, 'select 1 from predictions')).toHaveLength(1)
    expect(await as(db, EDDIE, 'select 1 from jinxes')).toHaveLength(1)
  })
})

describe('writes only before the lock', () => {
  it('lets a player change their pick freely, then rejects after lock', async () => {
    await pick(BEN, r2, await team('saracens'))
    await pick(BEN, r2, await team('stade-toulousain'))
    expect((await db.query('select team_id from picks where round_id = $1', [r2])).rows).toEqual([
      { team_id: await team('stade-toulousain') },
    ])
    await lockNow(r2)
    await expect(pick(BEN, r2, await team('saracens'))).rejects.toThrow(/locked/)
    await expect(
      as(db, BEN, 'insert into predictions (round_id, player_id, home_score, away_score) values ($1, $2, 1, 0)', [
        r2,
        BEN,
      ]),
    ).rejects.toThrow(/row-level security/)
  })

  it('blocks direct writes to picks, even for admins', async () => {
    await expect(
      as(db, BEN, 'insert into picks (round_id, player_id, team_id) values ($1, $2, $3)', [
        r2,
        BEN,
        await team('saracens'),
      ]),
    ).rejects.toThrow(/row-level security/)
    await pick(BEN, r2, await team('saracens'))
    await lockNow(r2)
    const updated = await as(db, EDDIE, 'update picks set team_id = $1 where round_id = $2 returning id', [
      await team('leinster'),
      r2,
    ])
    expect(updated).toHaveLength(0)
  })

  it('rejects teams not playing, used teams, burned teams and players who are out', async () => {
    await expect(pick(BEN, r2, await team('bath-rugby'))).rejects.toThrow(/not playing/)
    await expect(pick(BEN, r2, await team('munster-rugby'))).rejects.toThrow(/already used/)
    expect(await as(db, BEN, 'select * from my_used_teams($1)', [r2])).toEqual([
      { team_id: await team('munster-rugby'), round_number: 1 },
    ])
    await db.query(
      `insert into burned_teams (player_id, team_id, round_id, reason) values ($1, $2, $3, 'buyback_penalty')`,
      [BEN, await team('saracens'), r1],
    )
    await expect(pick(BEN, r2, await team('saracens'))).rejects.toThrow(/already used/)
    await expect(pick(OUTY, r2, await team('saracens'))).rejects.toThrow(/not in this round/)
  })

  it('gives a postponed team back', async () => {
    await db.query(`update round_results set outcome = 'survived_postponed' where player_id = $1`, [BEN])
    await pick(BEN, r2, await team('munster-rugby'))
  })

  it("won't open the next round until the previous one is settled", async () => {
    await db.query('update rounds set settled_at = null where id = $1', [r1])
    await expect(pick(BEN, r2, await team('saracens'))).rejects.toThrow(/not in this round/)
  })
})

describe('jinxes', () => {
  it('only an out player may jinx, and only a survivor', async () => {
    const jinx = (by: string, target: string) =>
      as(db, by, 'insert into jinxes (round_id, jinxer_id, target_id) values ($1, $2, $3)', [r2, by, target])
    await expect(jinx(BEN, EDDIE)).rejects.toThrow(/row-level security/)
    await expect(jinx(OUTY, OUTY)).rejects.toThrow()
    await jinx(OUTY, EDDIE)
  })
})

describe('auto-pick at the lock', () => {
  const run = async () => (await db.query<{ n: number }>('select auto_pick_locked_rounds() as n')).rows[0].n

  it('does nothing before the lock', async () => {
    expect(await run()).toBe(0)
  })

  it('gives each player still in with no pick a random unused team, once', async () => {
    await pick(BEN, r2, await team('saracens'))
    await lockNow(r2)
    expect(await run()).toBe(1)
    expect(await run()).toBe(0)
    const rows = (
      await db.query<{ player_id: string; team_id: number; is_auto: boolean }>(
        'select player_id, team_id, is_auto from picks where round_id = $1 order by player_id',
        [r2],
      )
    ).rows
    expect(rows).toHaveLength(2) // Outy is out: no auto-pick
    const eddie = rows.find((r) => r.player_id === EDDIE)!
    expect(eddie.is_auto).toBe(true)
    expect([await team('stade-toulousain'), await team('munster-rugby'), await team('saracens')]).toContain(
      eddie.team_id,
    )
    expect(rows.find((r) => r.player_id === BEN)).toMatchObject({ team_id: await team('saracens'), is_auto: false })
  })

  it('leaves a player with no team left without a pick (rule 1b, decided at settle)', async () => {
    for (const slug of ['stade-toulousain', 'munster-rugby', 'saracens']) {
      await db.query(
        `insert into burned_teams (player_id, team_id, round_id, reason) values ($1, $2, $3, 'buyback_penalty')`,
        [EDDIE, await team(slug), r1],
      )
    }
    await lockNow(r2)
    await run()
    expect(
      (await db.query('select 1 from picks where round_id = $1 and player_id = $2', [r2, EDDIE])).rows,
    ).toHaveLength(0)
  })

  it('never auto-picks Round 1 (no pick = no entry)', async () => {
    await db.query('update rounds set settled_at = null where id = $1', [r1])
    await db.query('delete from picks where round_id = $1', [r1])
    await run()
    expect((await db.query('select 1 from picks where round_id = $1', [r1])).rows).toHaveLength(0)
  })
})

describe('everything else', () => {
  it("players can't make themselves admin or confirm payments", async () => {
    await expect(as(db, BEN, 'update players set is_admin = true where id = $1', [BEN])).rejects.toThrow(
      /permission denied/,
    )
    await as(db, BEN, 'update players set nickname = $1 where id = $2', ['Benny', BEN])
    expect(await as(db, BEN, 'update players set nickname = $1 where id = $2 returning id', ['x', EDDIE])).toHaveLength(
      0,
    )

    await expect(
      as(db, BEN, `insert into payments (player_id, kind, amount_eur, status) values ($1, 'entry', 10, 'confirmed')`, [
        BEN,
      ]),
    ).rejects.toThrow(/row-level security/)
    await as(db, BEN, `insert into payments (player_id, kind, amount_eur) values ($1, 'entry', 10)`, [BEN])
    expect(await as(db, BEN, `update payments set status = 'confirmed' returning id`)).toHaveLength(0)
    expect(
      await as(db, EDDIE, `update payments set status = 'confirmed', confirmed_by = $1 returning id`, [EDDIE]),
    ).toHaveLength(1)
  })

  it('anon sees nothing; helpers that read across rounds are not callable', async () => {
    expect(await as(db, null, 'select 1 from players')).toHaveLength(0)
    await expect(as(db, BEN, 'select * from used_teams($1, $2)', [EDDIE, r1])).rejects.toThrow(/permission denied/)
    await expect(as(db, BEN, 'select auto_pick_locked_rounds()')).rejects.toThrow(/permission denied/)
    await expect(as(db, null, 'select * from make_pick($1, $2)', [r2, 1])).rejects.toThrow(/permission denied/)
  })

  it('avatars: each player writes only their own folder', async () => {
    await as(db, BEN, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${BEN}/me.jpg`])
    await expect(
      as(db, BEN, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${EDDIE}/me.jpg`]),
    ).rejects.toThrow(/row-level security/)
  })
})
