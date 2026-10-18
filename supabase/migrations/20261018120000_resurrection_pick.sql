-- NEXT.md packet 7, the rest: the Round 4 resurrection pick (rule 12). Out players (gone out at least once, not back in
-- by a buy-back) pick one away team they haven't used and that their re-entry wouldn't burn; free. The settle already
-- handles is_resurrection picks (engine settleRound: reinstated on a win, the same burns as a buy-back).

create function make_resurrection_pick(p_round_id bigint, p_team_id bigint) returns picks
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result picks;
begin
  if round_locked(p_round_id) then
    raise exception 'Picks for this round are locked';
  end if;
  if not exists (select 1 from rounds where id = p_round_id and stage = 'pool' and number = 4) then
    raise exception 'The resurrection is Round 4 only';
  end if;
  -- in_round is true for a bought-back player (a buy-back or the resurrection, not both) and for anyone out in Round 4
  -- itself (they were in at its start); null until Round 3 is settled.
  if in_round(me, p_round_id) is not false
     or not exists (select 1 from round_results where player_id = me and outcome = 'out') then
    raise exception 'The resurrection is for players who are out';
  end if;
  if not exists (select 1 from matches where round_id = p_round_id and away_team_id = p_team_id) then
    raise exception 'A resurrection pick must be an away team this round';
  end if;
  if exists (select 1 from used_teams(me, p_round_id) u where u.team_id = p_team_id) then
    raise exception 'You have already used that team';
  end if;
  if exists (select 1 from reentry_burns(me, p_round_id) b where b.team_id = p_team_id) then
    raise exception 'That team is burned if you come back';
  end if;

  insert into picks (round_id, player_id, team_id, is_resurrection)
  values (p_round_id, me, p_team_id, true)
  on conflict (round_id, player_id)
    do update set team_id = excluded.team_id, is_auto = false, is_resurrection = true, updated_at = now()
  returning * into result;
  return result;
end $$;

-- Same as 20261015170000, plus is_resurrection = false on the upsert (a pick made while in is never a resurrection).
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
    do update set team_id = excluded.team_id, is_auto = false, is_resurrection = false, updated_at = now()
  returning * into result;
  return result;
end $$;

-- A confirmed buy-back wins over a resurrection pick (rule 12: not both): drop it so they pick (or are auto-picked)
-- as a bought-back player. ponytail: only unlocked rounds; a buy-back confirmed after the Round 4 lock with a
-- resurrection pick in makes the settle refuse ("not both"), and the admins sort it out by hand.
create function buyback_drops_resurrection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'buyback' and new.status = 'confirmed' then
    delete from picks k where k.player_id = new.player_id and k.is_resurrection and not round_locked(k.round_id);
  end if;
  return new;
end $$;

revoke execute on function buyback_drops_resurrection from public, anon, authenticated;

create trigger payments_buyback_drops_resurrection after insert or update of status on payments
  for each row execute function buyback_drops_resurrection();

-- The pick screen's "burned" teams: a pending buy-back's, or in Round 4 an out player's resurrection cost.
create or replace function my_pending_burns(r bigint) returns table (team_id bigint)
language sql stable security definer set search_path = public as $$
  select b.team_id from pending_burns(auth.uid(), r) b
  union
  select b.team_id from rounds rd, reentry_burns(auth.uid(), r) b
  where rd.id = r and rd.stage = 'pool' and rd.number = 4 and in_round(auth.uid(), r) is false
$$;

revoke execute on function make_resurrection_pick from public, anon, authenticated;
grant execute on function make_resurrection_pick to authenticated;
