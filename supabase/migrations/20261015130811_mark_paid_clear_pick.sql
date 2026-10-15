-- Eddie, 15 Oct: an admin can mark a player paid without a claim (they paid on Revolut but never tapped "I've paid").
-- Confirms their claim if they made one; refuses if it's already confirmed.
create function mark_paid(p_player uuid, p_kind payment_kind default 'entry') returns payments
language plpgsql security definer set search_path = public as $$
declare
  result payments;
begin
  if not is_admin() then
    raise exception 'Only admins can mark a player paid';
  end if;
  insert into payments (player_id, kind, amount_eur, status, confirmed_by, confirmed_at)
  values (p_player, p_kind, 10, 'confirmed', auth.uid(), now())
  on conflict (player_id, kind) do update
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where payments.status = 'claimed'
  returning * into result;
  if result.id is null then
    raise exception 'Already paid';
  end if;
  return result;
end $$;

revoke execute on function mark_paid from public, anon, authenticated;
grant execute on function mark_paid to authenticated;

-- Eddie, 15 Oct: take your pick back before the lock (tap your team again). Own pick only, server clock.
-- Round 1: no pick = no entry; later rounds: no pick by the lock = a random unused team.
create function clear_pick(p_round_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if round_locked(p_round_id) then
    raise exception 'Picks are locked';
  end if;
  delete from picks where round_id = p_round_id and player_id = auth.uid();
end $$;

revoke execute on function clear_pick from public, anon, authenticated;
grant execute on function clear_pick to authenticated;

-- Eddie, 15 Oct: no Round 1 pick until you've paid, i.e. tapped "I've paid" (a claim is enough; an unconfirmed
-- claim still isn't in at the settle). A trigger, so make_pick itself is unchanged. Later rounds: who's in decides.
create function picks_need_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select number from rounds where id = new.round_id) = 1
     and not exists (select 1 from payments where player_id = new.player_id and kind = 'entry') then
    raise exception 'Pay your €10 entry first, then tap "I''ve paid"';
  end if;
  return new;
end $$;

create trigger picks_need_entry before insert or update on picks
for each row execute function picks_need_entry();
