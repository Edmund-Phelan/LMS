-- Undo the latest settle so it can be corrected and settled again. Only while the next round is still open:
-- after its lock, picks are revealed and auto-picks made, so a rewind would no longer be fair.
-- The next round's picks and jinxes are cleared (who's in may change) and players pick again before the lock.
-- Predictions are kept: everyone predicts, in or out.
create function unsettle_round(p_round_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cur rounds;
  nxt rounds;
  n_picks int;
  n_jinxes int;
begin
  if not is_admin() then
    raise exception 'Only admins can unsettle a round';
  end if;
  select * into cur from rounds where id = p_round_id for update;
  if cur.settled_at is null then
    raise exception 'Round % is not settled', cur.number;
  end if;
  if exists (select 1 from rounds where number > cur.number and settled_at is not null) then
    raise exception 'Unsettle the later rounds first';
  end if;
  select * into nxt from rounds where number > cur.number order by number limit 1 for update;
  if nxt.lock_at <= now() then
    raise exception '% has already locked; fix this one by hand', nxt.name;
  end if;

  delete from round_results where round_id = cur.id;
  delete from burned_teams where round_id = cur.id;
  update rounds set settled_at = null, tiebreak = null where id = cur.id;
  delete from picks where round_id = nxt.id;
  get diagnostics n_picks = row_count;
  delete from jinxes where round_id = nxt.id;
  get diagnostics n_jinxes = row_count;
  update rounds set clean_slate = false where id = nxt.id;
  return jsonb_build_object('picks', coalesce(n_picks, 0), 'jinxes', coalesce(n_jinxes, 0));
end $$;

revoke execute on function unsettle_round from public, anon, authenticated;
grant execute on function unsettle_round to authenticated;
