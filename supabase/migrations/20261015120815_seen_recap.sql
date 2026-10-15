-- Packet 5e (spec §19): the round recap plays once per player per round, replacing the §17 overlay's flag.
-- seen_elimination_round is kept (unused from now on) so the build that's live while Round 1 picks are open keeps
-- loading players until this one deploys. Cosmetic, so each player may set their own, like the old column.
alter table players add column seen_recap_round smallint;
update players set seen_recap_round = seen_elimination_round;
grant update (seen_recap_round) on players to authenticated;

-- Unsettle of round N sets seen_recap_round back to N - 1 for anyone at N, so the corrected settle plays again.
create or replace function unsettle_round(p_round_id bigint) returns jsonb
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
  -- §19: a corrected result gets its own recap.
  update players set seen_recap_round = cur.number - 1 where seen_recap_round >= cur.number;
  return jsonb_build_object('picks', coalesce(n_picks, 0), 'jinxes', coalesce(n_jinxes, 0));
end $$;

