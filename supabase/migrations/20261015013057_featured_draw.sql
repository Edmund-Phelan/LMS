-- Featured-match raffle (NEXT.md packet 4): one random draw per round, made on the server by an admin,
-- before the lock, never redrawn. The client only plays the animation over the stored result.

alter table rounds add column featured_drawn_at timestamptz;

-- Nobody writes the draw (or the settle columns) directly, admins included: only these functions do.
revoke insert, update on rounds from anon, authenticated;
grant insert (number, stage, name, lock_at) on rounds to authenticated;
grant update (name, lock_at, clean_slate) on rounds to authenticated;

create function draw_featured_match(p_round_id bigint) returns rounds
language plpgsql security definer set search_path = public as $$
declare
  cur rounds;
begin
  if not is_admin() then
    raise exception 'Only admins can draw the featured match';
  end if;
  select * into cur from rounds where id = p_round_id for update;
  if cur.id is null then
    raise exception 'No such round';
  end if;
  if cur.featured_drawn_at is not null then
    raise exception 'Round %''s featured match has already been drawn', cur.number;
  end if;
  if cur.lock_at <= now() then
    raise exception 'Round % is locked', cur.number;
  end if;
  if not exists (select 1 from matches where round_id = cur.id) then
    raise exception 'Round % has no fixtures yet', cur.number;
  end if;
  update rounds
  set featured_match_id = (select id from matches where round_id = cur.id order by random() limit 1),
      featured_drawn_at = now()
  where id = cur.id
  returning * into cur;
  return cur;
end $$;

revoke execute on function draw_featured_match from public, anon, authenticated;
grant execute on function draw_featured_match to authenticated;

-- The final has one fixture: it's the featured match as soon as it's added.
create function draw_final() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update rounds set featured_match_id = new.id, featured_drawn_at = now()
  where id = new.round_id and stage = 'final' and featured_drawn_at is null;
  return new;
end $$;

revoke execute on function draw_final from public, anon, authenticated;
create trigger matches_draw_final after insert on matches for each row execute function draw_final();
