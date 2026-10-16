-- Drop the hourly auto-pick fallback (Eddie, 16 Oct): each round's own job at its lock is enough.
-- Without it, a lock edited into the past (or a run missed while paused) needs a manual
-- `select auto_pick_locked_rounds()`.
select cron.unschedule('auto-pick-at-lock');
