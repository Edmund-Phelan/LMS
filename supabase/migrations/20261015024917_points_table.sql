-- Points table (docs/UI-REDESIGN.md §8.2): prediction + jinx points across settled rounds, plus whether each player
-- is still in for the current (lowest unsettled) round. security invoker: round_results and players are readable
-- by every signed-in player already, so this needs no new privileges.
create function points_table()
returns table (player_id uuid, points int, prediction_points int, exact int, jinx int, alive boolean)
language sql stable security invoker set search_path = public as $$
  select p.id,
    coalesce(sum(rr.prediction_points + rr.jinx_points), 0)::int,
    coalesce(sum(rr.prediction_points), 0)::int,
    (count(*) filter (where rr.exact_score))::int,
    coalesce(sum(rr.jinx_points), 0)::int,
    alive(p.id, (select id from rounds where settled_at is null order by number limit 1))
  from players p
  left join round_results rr on rr.player_id = p.id
  group by p.id, p.name
  order by 2 desc, 4 desc, p.name
$$;

revoke execute on function points_table from public, anon, authenticated;
grant execute on function points_table to authenticated;
