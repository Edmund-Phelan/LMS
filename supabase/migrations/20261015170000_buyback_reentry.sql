-- NEXT.md packet 7: a confirmed buy-back puts an out player back in for the next pool round (rule 11), before the
-- settle. Until now alive() stayed false, so make_pick refused them, the lock job skipped them and the settle threw.
-- in_round() = alive() or that buy-back; it replaces alive() wherever "may play this round" is asked. The burns are
-- computed here (reentry_burns, a mirror of the engine's reentryBurns(), checked against it in buyback.test.ts) and
-- still written by the settle, as before.

-- Engine playerState().buybackUsed: played a round they started out of (resurrections give reinstated/already_out).
create function buyback_used(p uuid, r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds rd join round_results rr on rr.round_id = rd.id and rr.player_id = p, rounds cur
    where cur.id = r and rd.number < cur.number and alive(p, rd.id) is false
      and rr.outcome in ('through', 'out', 'survived_postponed')
  )
$$;

-- In for round r: alive, or out (gone out at least once) with a confirmed, unused buy-back claimed before r's lock,
-- in a pool round after Round 1. Same as the engine's contenders in settleRound(). null = not known yet.
create function in_round(p uuid, r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when alive(p, r) is not false then alive(p, r)
    else exists (
      select 1 from rounds cur join payments pay on pay.player_id = p
      where cur.id = r and cur.stage = 'pool' and cur.number > 1
        and pay.kind = 'buyback' and pay.status = 'confirmed' and pay.claimed_at < cur.lock_at
        and exists (select 1 from round_results rr where rr.player_id = p and rr.outcome = 'out')
        and not buyback_used(p, r)
    )
  end
$$;

-- Engine reentryBurns(): one team for the round they went out in and one per round sat out, each walking that
-- round's burn order (pick count desc, ties by its stored draw) past used/burned teams, then the season-wide
-- order (every pick before r, same draw). Nothing left, no burn. Only meaningful for a player coming back in r.
create function reentry_burns(p uuid, r bigint) returns table (team_id bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  cur rounds;
  rd rounds;
  out_in int;
  taken bigint[];
  t bigint;
begin
  select * into cur from rounds where id = r;
  select max(x.number) into out_in
  from round_results rr join rounds x on x.id = rr.round_id
  where rr.player_id = p and rr.outcome = 'out' and x.number < cur.number;
  if out_in is null then
    return;
  end if;
  select coalesce(array_agg(u.team_id), '{}') into taken from used_teams(p, r) u;
  for rd in select * from rounds where number >= out_in and number < cur.number order by number loop
    select k.team_id into t
    from picks k where k.round_id = rd.id and k.team_id <> all (taken)
    group by k.team_id order by count(*) desc, array_position(rd.tiebreak, k.team_id) limit 1;
    if t is null then
      select k.team_id into t
      from picks k join rounds x on x.id = k.round_id
      where x.number < cur.number and k.team_id <> all (taken)
      group by k.team_id order by count(*) desc, array_position(rd.tiebreak, k.team_id) limit 1;
    end if;
    if t is not null then
      taken := taken || t;
      team_id := t;
      return next;
    end if;
  end loop;
end $$;

-- Teams p can't pick in r because of a pending re-entry (empty when they're simply alive).
create function pending_burns(p uuid, r bigint) returns table (team_id bigint)
language sql stable security definer set search_path = public as $$
  select b.team_id from reentry_burns(p, r) b where alive(p, r) is false and in_round(p, r)
$$;

create or replace function make_pick(p_round_id bigint, p_team_id bigint) returns picks
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result picks;
begin
  if round_locked(p_round_id) then
    raise exception 'Picks for this round are locked';
  end if;
  if in_round(me, p_round_id) is not true then
    raise exception 'You are not in this round';
  end if;
  if not exists (
    select 1 from matches where round_id = p_round_id and p_team_id in (home_team_id, away_team_id)
  ) then
    raise exception 'That team is not playing this round';
  end if;
  if exists (select 1 from used_teams(me, p_round_id) u where u.team_id = p_team_id) then
    raise exception 'You have already used that team';
  end if;
  if exists (select 1 from pending_burns(me, p_round_id) b where b.team_id = p_team_id) then
    raise exception 'That team is burned for your buy-back';
  end if;

  insert into picks (round_id, player_id, team_id)
  values (p_round_id, me, p_team_id)
  on conflict (round_id, player_id)
    do update set team_id = excluded.team_id, is_auto = false, updated_at = now()
  returning * into result;
  return result;
end $$;

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
      where in_round(pl.id, r.id) is true
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
        and t.team_id not in (select b.team_id from pending_burns(p.id, r.id) b)
      order by random()
      limit 1
      on conflict (round_id, player_id) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function round_pick_status(r bigint) returns table (player_id uuid, has_pick boolean)
language sql stable security definer set search_path = public as $$
  select p.id, exists (select 1 from picks k where k.round_id = r and k.player_id = p.id)
  from players p
  where in_round(p.id, r) is true
  order by p.name
$$;

-- alive now means "in this round" (buy-backs included); bought_back = in only by a pending buy-back.
drop function round_status(bigint);
create function round_status(r bigint) returns table (player_id uuid, alive boolean, bought_back boolean)
language sql stable security definer set search_path = public as $$
  select id, in_round(id, r), alive(id, r) is false and in_round(id, r) from players
$$;

create or replace function points_table()
returns table (player_id uuid, points int, prediction_points int, exact int, jinx int, alive boolean)
language sql stable security invoker set search_path = public as $$
  select p.id,
    coalesce(sum(rr.prediction_points + rr.jinx_points), 0)::int,
    coalesce(sum(rr.prediction_points), 0)::int,
    (count(*) filter (where rr.exact_score))::int,
    coalesce(sum(rr.jinx_points), 0)::int,
    in_round(p.id, (select id from rounds where settled_at is null order by number limit 1))
  from players p
  left join round_results rr on rr.player_id = p.id
  group by p.id, p.name
  order by 2 desc, 4 desc, p.name
$$;

-- The caller's pending buy-back burns, for the pick screen ("burned").
create function my_pending_burns(r bigint) returns table (team_id bigint)
language sql stable security definer set search_path = public as $$
  select * from pending_burns(auth.uid(), r)
$$;

-- A player who's back in can't jinx; a bought-back player can be jinxed (engine: they're "still in").
drop policy jinxes_insert on jinxes;
drop policy jinxes_update on jinxes;
create policy jinxes_insert on jinxes for insert to authenticated
  with check (
    jinxer_id = auth.uid() and not round_locked(round_id)
    and in_round(jinxer_id, round_id) is false and in_round(target_id, round_id) is true
  );
create policy jinxes_update on jinxes for update to authenticated
  using (jinxer_id = auth.uid() and not round_locked(round_id))
  with check (
    jinxer_id = auth.uid() and not round_locked(round_id)
    and in_round(jinxer_id, round_id) is false and in_round(target_id, round_id) is true
  );

revoke execute on function buyback_used, in_round, reentry_burns, pending_burns, round_status, my_pending_burns
  from public, anon, authenticated;
grant execute on function in_round, round_status, my_pending_burns to authenticated;
