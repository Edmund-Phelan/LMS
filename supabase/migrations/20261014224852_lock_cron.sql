-- At the lock (CLAUDE.md §4, rule 5): every player still in with no pick gets a random team that plays
-- that round and that they haven't used or burned. Idempotent; runs every minute.
-- Players with no team left get no pick here: rule 1b (out, or clean slate if everyone is stuck)
-- is decided at settle. ponytail: clean-slate-at-lock needs a ruling from Eddie before it's automated.

create function auto_pick_locked_rounds() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  n int := 0;
begin
  for r in select id from rounds where lock_at <= now() and settled_at is null loop
    for p in
      select pl.id from players pl
      where alive(pl.id, r.id) is true
        and not exists (select 1 from picks where round_id = r.id and player_id = pl.id)
    loop
      insert into picks (round_id, player_id, team_id, is_auto)
      select r.id, p.id, t.team_id, true
      from (
        select home_team_id as team_id from matches where round_id = r.id
        union
        select away_team_id from matches where round_id = r.id
      ) t
      where t.team_id not in (select u.team_id from used_teams(p.id, r.id) u)
      order by random()
      limit 1
      on conflict (round_id, player_id) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

revoke execute on function auto_pick_locked_rounds from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('auto-pick-at-lock', '* * * * *', 'select public.auto_pick_locked_rounds()');
