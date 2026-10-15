-- Settle (CLAUDE.md §6 Admin): the admin page runs the engine, Eddie confirms, and this writes the outcome
-- in one transaction: round_results, burned_teams, the round's tiebreak draw, and settled_at.

-- A clean slate clears burns, so the same team can be burned for the same player again later.
alter table burned_teams drop constraint burned_teams_player_id_team_id_key;
alter table burned_teams add unique (player_id, team_id, round_id);

create function settle_round(p_round_id bigint, p_tiebreak bigint[], p_results jsonb, p_burns jsonb)
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

  insert into round_results (round_id, player_id, outcome, prediction_points, exact_score, jinx_points)
  select p_round_id, x.player_id, x.outcome, x.prediction_points, x.exact_score, x.jinx_points
  from jsonb_to_recordset(p_results)
    as x(player_id uuid, outcome round_outcome, prediction_points int, exact_score boolean, jinx_points int);

  insert into burned_teams (player_id, team_id, round_id, reason)
  select x.player_id, x.team_id, p_round_id, x.reason
  from jsonb_to_recordset(p_burns) as x(player_id uuid, team_id bigint, reason burn_reason);

  update rounds set tiebreak = p_tiebreak, settled_at = now() where id = p_round_id;
end $$;

revoke execute on function settle_round from public, anon, authenticated;
grant execute on function settle_round to authenticated;
