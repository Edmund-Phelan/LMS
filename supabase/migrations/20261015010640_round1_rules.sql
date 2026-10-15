-- Round 1 runs on the app (NEXT.md packet 1). Rules: no pick = no entry, no confirmed entry payment = not in.

-- Everyone is in for the first round (payment is checked at settle), so make_pick works in Round 1.
-- Before, alive() was null with no earlier round, which blocked Round 1 picks.
create or replace function alive(p uuid, r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when prev.id is null then exists (select 1 from players where id = p)
    when prev.settled_at is null then null
    else coalesce((
      select outcome in ('through', 'survived_postponed', 'clean_slate', 'reinstated')
      from round_results where round_id = prev.id and player_id = p
    ), false)
  end
  from rounds cur
  left join lateral (
    select id, settled_at from rounds where number < cur.number order by number desc limit 1
  ) prev on true
  where cur.id = r
$$;

-- Same as before, but never Round 1: no pick there means no entry.
create or replace function auto_pick_locked_rounds() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  n int := 0;
begin
  for r in select id from rounds where lock_at <= now() and settled_at is null and number > 1 loop
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

-- Same as before, plus: in Round 1 only players with a pick and a confirmed entry payment may be in
-- (anything but already_out). The engine works this out; this stops a bad preview being written.
create or replace function settle_round(p_round_id bigint, p_tiebreak bigint[], p_results jsonb, p_burns jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur rounds;
begin
  if not is_admin() then
    raise exception 'Only admins can settle a round';
  end if;
  select * into cur from rounds where id = p_round_id for update;
  if cur.id is null then
    raise exception 'No such round';
  end if;
  if cur.settled_at is not null then
    raise exception 'Round % is already settled', cur.number;
  end if;
  if cur.lock_at > now() then
    raise exception 'Round % has not locked yet', cur.number;
  end if;
  if exists (select 1 from rounds where number < cur.number and settled_at is null) then
    raise exception 'Settle the earlier rounds first';
  end if;
  if (select count(*) from jsonb_array_elements(p_results)) <> (select count(*) from players) then
    raise exception 'Expected a result for every player';
  end if;
  if cur.number = 1 and exists (
    select 1 from jsonb_to_recordset(p_results) as x(player_id uuid, outcome round_outcome)
    where x.outcome <> 'already_out' and (
      not exists (select 1 from picks where round_id = p_round_id and player_id = x.player_id)
      or not exists (
        select 1 from payments where player_id = x.player_id and kind = 'entry' and status = 'confirmed'
      )
    )
  ) then
    raise exception 'Round 1: only players with a pick and a confirmed entry payment are in';
  end if;

  insert into round_results (round_id, player_id, outcome, prediction_points, exact_score, jinx_points)
  select p_round_id, x.player_id, x.outcome, x.prediction_points, x.exact_score, x.jinx_points
  from jsonb_to_recordset(p_results)
    as x(player_id uuid, outcome round_outcome, prediction_points int, exact_score boolean, jinx_points int);

  insert into burned_teams (player_id, team_id, round_id, reason)
  select x.player_id, x.team_id, p_round_id, x.reason
  from jsonb_to_recordset(p_burns) as x(player_id uuid, team_id bigint, reason burn_reason);

  update rounds set tiebreak = p_tiebreak, settled_at = now() where id = p_round_id;
end $$;
