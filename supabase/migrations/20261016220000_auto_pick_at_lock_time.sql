-- Auto-pick at each round's own lock time instead of every minute (Eddie, 16 Oct). Setting or editing a round's
-- lock_at (re)schedules job auto-pick-round-<id> for the minute after the lock (pg_cron runs in UTC here and replaces
-- a job of the same name). ponytail: the job repeats on that date every year; harmless, the round is settled by then.
-- The old every-minute job becomes an hourly fallback: it catches a failed run, a paused project, or a lock moved
-- into the past. A late auto-pick is safe: make_pick refuses everything after lock_at anyway.

create function schedule_auto_pick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lock_at > now() then
    perform cron.schedule(
      'auto-pick-round-' || new.id,
      to_char((date_trunc('minute', new.lock_at) + interval '1 minute') at time zone 'UTC', 'FMMI FMHH24 FMDD FMMM') || ' *',
      'select public.auto_pick_locked_rounds()'
    );
  end if;
  return new;
end $$;

revoke execute on function schedule_auto_pick from public, anon, authenticated;

create trigger rounds_schedule_auto_pick after insert or update of lock_at on rounds
  for each row execute function schedule_auto_pick();

update rounds set lock_at = lock_at where lock_at > now(); -- schedule the rounds already seeded

select cron.schedule('auto-pick-at-lock', '0 * * * *', 'select public.auto_pick_locked_rounds()');
