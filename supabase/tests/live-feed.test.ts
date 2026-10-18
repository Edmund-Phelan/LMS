// LIVE-FEED.md §3 step 2: the feed's tables and the result guard (§4's database half).
import { beforeEach, expect, it } from 'vitest'
import { as, freshDb, type Db } from './db'

const EDDIE = '00000000-0000-0000-0000-00000000000e'
const BEN = '00000000-0000-0000-0000-00000000000b'
let db: Db
let match: number

/** Run sql as the Edge Function does (service role key: Postgres role service_role, no auth.uid()). */
const feed = (sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return (await tx.query(sql, params)).rows
  })

beforeEach(async () => {
  db = await freshDb()
  await db.exec(`create role service_role nologin bypassrls; grant all on all tables in schema public to service_role;
    grant usage on schema public, auth to service_role; grant execute on all functions in schema auth to service_role`)
  for (const [id, name, admin] of [
    [EDDIE, 'Eddie', true],
    [BEN, 'Ben', false],
  ] as const) {
    await db.query('insert into auth.users (id) values ($1)', [id])
    await db.query('insert into players (id, name, is_admin) values ($1, $2, $3)', [id, name, admin])
  }
  match = (await db.query<{ id: number }>('select id from matches where hl_match_id = 46182852')).rows[0].id // Sale v Glasgow
})

it('the feed writes live and final scores; an admin result is theirs and the feed never overwrites it', async () => {
  await feed(`update matches set live_state = 'Second half', live_home = 27, live_away = 40 where id = $1`, [match])
  await feed(
    `update matches set home_score = 27, away_score = 47, status = 'completed', result_source = 'api' where id = $1`,
    [match],
  )
  expect(
    (await db.query('select home_score, away_score, result_source from matches where id = $1', [match])).rows,
  ).toEqual([{ home_score: 27, away_score: 47, result_source: 'api' }])

  await as(db, EDDIE, 'update matches set away_score = 48 where id = $1', [match])
  expect((await db.query('select result_source from matches where id = $1', [match])).rows[0]).toEqual({
    result_source: 'admin',
  })
  await expect(feed('update matches set away_score = 45 where id = $1', [match])).rejects.toThrow(/admin result/)
  await feed(`update matches set live_state = 'Finished', live_away = 45 where id = $1`, [match]) // live fields: fine
  await expect(as(db, BEN, 'update matches set away_score = 1 where id = $1 returning id', [match])).resolves.toEqual(
    [],
  )
})

it('the feed never changes a settled round’s result', async () => {
  await db.query(`update rounds set settled_at = now() where number = 1`)
  await expect(
    feed(`update matches set home_score = 27, away_score = 47, status = 'completed' where id = $1`, [match]),
  ).rejects.toThrow(/settled round/)
})

it('reads: everyone sees standings and visible highlights; only admins see hidden clips, api_calls, feed_settings', async () => {
  await feed(`insert into match_highlights (id, match_id, title) values (1, $1, 'Shown'), (2, $1, 'Hidden')`, [match])
  await feed(`insert into api_calls (endpoint, http_status, remaining) values ('/matches', 200, 97)`)
  await as(db, EDDIE, 'update match_highlights set hidden = true where id = 2')
  await expect(as(db, BEN, 'update match_highlights set hidden = false where id = 2 returning id')).resolves.toEqual([])

  expect(await as(db, BEN, 'select title from match_highlights')).toEqual([{ title: 'Shown' }])
  expect(await as(db, EDDIE, 'select title from match_highlights order by id')).toHaveLength(2)
  expect(await as(db, BEN, 'select * from api_calls')).toEqual([])
  expect(await as(db, BEN, 'select * from feed_settings')).toEqual([])
  expect(await as(db, EDDIE, 'select enabled, league_id, season from feed_settings')).toEqual([
    { enabled: false, league_id: 46738, season: 2026 },
  ])
  await expect(as(db, BEN, `insert into pool_standings values (1, 1, 1, 0, 0, 0, 0, 0, 0, 0)`)).rejects.toThrow(
    /row-level security/,
  )
})

it('hl-sync: ESPN ids for all 24 teams, the cron job, and the token is not for players', async () => {
  expect((await db.query('select count(*)::int n from teams where espn_team_id is not null')).rows[0]).toEqual({
    n: 24,
  })
  expect((await db.query(`select schedule from cron.job where jobname = 'hl-sync'`)).rows).toEqual([
    { schedule: '* * * * *' },
  ])
  await expect(as(db, EDDIE, 'select hl_cron_token()')).rejects.toThrow(/permission denied/)
  await expect(as(db, EDDIE, 'select hl_sync_tick()')).rejects.toThrow(/permission denied/)
})
