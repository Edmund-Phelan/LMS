// Runs the real migrations in PGlite (Postgres in WASM) with just enough of Supabase stubbed
// (auth.uid(), storage, cron, default grants) to test RLS and the lock without a server.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '../migrations')

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage; create schema cron;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id serial primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant all on storage.objects, storage.objects_id_seq to authenticated;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(a text, b text, c text) returns bigint language sql as $$
    insert into cron.job values (a, b, c) on conflict (jobname) do update set schedule = b, command = c; select 1::bigint $$;
  create function cron.unschedule(a text) returns boolean language sql as $$ delete from cron.job where jobname = a returning true $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`

export async function freshDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    // pg_cron isn't available in PGlite; cron.schedule is stubbed above.
    await db.exec(readFileSync(join(dir, f), 'utf8').replace(/^create extension .*$/gm, ''))
  }
  return db
}

export type Db = Awaited<ReturnType<typeof freshDb>>

/** Run sql as a signed-in player (or anon when uid is null), like PostgREST does. */
export async function as<T = Record<string, unknown>>(db: Db, uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    return (await tx.query<T>(sql, params)).rows
  })
}
