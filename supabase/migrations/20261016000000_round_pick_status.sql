-- Squad list (docs/UI-REDESIGN.md §8.1): who has picked in round r, never which team.
-- One row per player in the round (alive for it). Read-only; picks RLS is unchanged.
create function round_pick_status(r bigint) returns table (player_id uuid, has_pick boolean)
language sql stable security definer set search_path = public as $$
  select p.id, exists (select 1 from picks k where k.round_id = r and k.player_id = p.id)
  from players p
  where alive(p.id, r) is true
  order by p.name
$$;

revoke execute on function round_pick_status from public, anon, authenticated;
grant execute on function round_pick_status to authenticated;
