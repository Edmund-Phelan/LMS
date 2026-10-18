-- Eddie, 18 Oct: once they claim a buy-back ("I've paid") they're allowed to play, like a Round 1 entry claim. Only
-- confirmed money is in the pot, so the settle refuses while a claim for that round is unconfirmed (engine); an admin
-- confirms it or rejects it, and a rejected claim drops the pick it allowed.

-- Same as 20261015170000 with status claimed or confirmed.
create or replace function in_round(p uuid, r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when alive(p, r) is not false then alive(p, r)
    else exists (
      select 1 from rounds cur join payments pay on pay.player_id = p
      where cur.id = r and cur.stage = 'pool' and cur.number > 1
        and pay.kind = 'buyback' and pay.claimed_at < cur.lock_at
        and exists (select 1 from round_results rr where rr.player_id = p and rr.outcome = 'out')
        and not buyback_used(p, r)
    )
  end
$$;

-- A buy-back claim puts them in, so before the lock: a Round 4 resurrection pick becomes their normal pick (rule 12:
-- not both; always a valid one, as it already avoids their used teams and the buy-back's burns, the same teams), and
-- their jinx goes (a player who's in can't jinx).
create or replace function buyback_drops_resurrection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'buyback' then
    update picks k set is_resurrection = false
    where k.player_id = new.player_id and k.is_resurrection and not round_locked(k.round_id);
    delete from jinxes j where j.jinxer_id = new.player_id and not round_locked(j.round_id);
  end if;
  return new;
end $$;

-- A rejected claim: drop the picks it allowed (unsettled rounds the player is only in by that buy-back).
create function buyback_rejected() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'buyback' then
    delete from picks k using rounds rd
    where rd.id = k.round_id and rd.settled_at is null and k.player_id = old.player_id
      and alive(old.player_id, k.round_id) is false and not k.is_resurrection;
  end if;
  return old;
end $$;

revoke execute on function buyback_rejected from public, anon, authenticated;

create trigger payments_buyback_rejected after delete on payments
  for each row execute function buyback_rejected();
