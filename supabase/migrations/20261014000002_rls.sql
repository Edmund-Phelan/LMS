-- Row-level security. Rules of thumb (CLAUDE.md §4):
--  * picks/predictions/jinxes: own rows always, everyone's only once the round has locked. No admin exception.
--  * writes to picks go through make_pick() (security definer); there is no insert/update policy on picks.
--  * results, matches, rounds, round_results, burned_teams, payment confirmation: admin only.

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from players where id = auth.uid()), false)
$$;

-- Server clock only. Unknown round counts as locked.
create function round_locked(r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select now() >= lock_at from rounds where id = r), true)
$$;

-- Is player p still in for round r? Decided by p's outcome in the round before r.
-- null = unknown: r is the first round, or the previous round isn't settled yet. Callers treat null as "no".
create function alive(p uuid, r bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when prev.settled_at is null then null
    else coalesce((
      select outcome in ('through', 'survived_postponed', 'clean_slate', 'reinstated')
      from round_results where round_id = prev.id and player_id = p
    ), false)
  end
  from rounds cur
  left join lateral (
    select id, settled_at from rounds where number < cur.number order by number desc limit 1
  ) prev on true
  where cur.id = r
$$;

-- Teams player p may not pick in round r: earlier picks (minus postponed ones, which are given back,
-- and anything before p's latest clean slate) plus burned teams. Only rounds before r are looked at,
-- so it never reveals an unlocked pick.
create function used_teams(p uuid, r bigint) returns table (team_id bigint, round_number int)
language sql stable security definer set search_path = public as $$
  with cur as (select number from rounds where id = r),
  slate as (
    select coalesce(max(rd.number), 0) as from_number
    from round_results rr join rounds rd on rd.id = rr.round_id, cur
    where rr.player_id = p and rr.outcome = 'clean_slate' and rd.number < cur.number
  )
  select pk.team_id, rd.number
  from picks pk join rounds rd on rd.id = pk.round_id, cur, slate
  where pk.player_id = p
    and rd.number < cur.number
    and rd.number >= slate.from_number
    and not exists (
      select 1 from round_results rr
      where rr.round_id = pk.round_id and rr.player_id = p and rr.outcome = 'survived_postponed'
    )
  union all
  select b.team_id, rd.number from burned_teams b join rounds rd on rd.id = b.round_id where b.player_id = p
$$;

create function make_pick(p_round_id bigint, p_team_id bigint) returns picks
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result picks;
begin
  if round_locked(p_round_id) then
    raise exception 'Picks for this round are locked';
  end if;
  if alive(me, p_round_id) is not true then
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

  insert into picks (round_id, player_id, team_id)
  values (p_round_id, me, p_team_id)
  on conflict (round_id, player_id)
    do update set team_id = excluded.team_id, is_auto = false, updated_at = now()
  returning * into result;
  return result;
end $$;

-- The caller's own used/burned teams, for greying out the pick screen.
create function my_used_teams(r bigint) returns table (team_id bigint, round_number int)
language sql stable security definer set search_path = public as $$
  select * from used_teams(auth.uid(), r)
$$;

-- Who is in for round r (for the jinx picker etc). Round results are public anyway.
create function round_status(r bigint) returns table (player_id uuid, alive boolean)
language sql stable security definer set search_path = public as $$
  select id, alive(id, r) from players
$$;

-- Supabase grants execute on new functions to anon/authenticated by default; be explicit.
revoke execute on function is_admin, round_locked, alive, used_teams, my_used_teams, make_pick, round_status from public, anon, authenticated;
grant execute on function is_admin, round_locked, alive, my_used_teams, make_pick, round_status to authenticated;

alter table players enable row level security;
alter table teams enable row level security;
alter table rounds enable row level security;
alter table matches enable row level security;
alter table picks enable row level security;
alter table predictions enable row level security;
alter table jinxes enable row level security;
alter table payments enable row level security;
alter table burned_teams enable row level security;
alter table round_results enable row level security;

-- Players: everyone signed in sees everyone; you edit only your own profile fields.
create policy players_read on players for select to authenticated using (true);
create policy players_update_self on players for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on players from anon, authenticated;
grant update (nickname, avatar_url, kit_colour) on players to authenticated;

-- Public-to-players reference/result tables, admin-only writes.
create policy teams_read on teams for select to authenticated using (true);
create policy teams_admin on teams for all to authenticated using (is_admin()) with check (is_admin());
create policy rounds_read on rounds for select to authenticated using (true);
create policy rounds_admin on rounds for all to authenticated using (is_admin()) with check (is_admin());
create policy matches_read on matches for select to authenticated using (true);
create policy matches_admin on matches for all to authenticated using (is_admin()) with check (is_admin());
create policy round_results_read on round_results for select to authenticated using (true);
create policy round_results_admin on round_results for all to authenticated using (is_admin()) with check (is_admin());
create policy burned_teams_read on burned_teams for select to authenticated using (true);
create policy burned_teams_admin on burned_teams for all to authenticated using (is_admin()) with check (is_admin());

-- Picks: hidden until lock; writes only via make_pick().
create policy picks_read on picks for select to authenticated
  using (player_id = auth.uid() or round_locked(round_id));

-- Predictions: everyone (in or out) predicts; hidden until lock; editable until lock.
create policy predictions_read on predictions for select to authenticated
  using (player_id = auth.uid() or round_locked(round_id));
create policy predictions_insert on predictions for insert to authenticated
  with check (player_id = auth.uid() and not round_locked(round_id));
create policy predictions_update on predictions for update to authenticated
  using (player_id = auth.uid() and not round_locked(round_id))
  with check (player_id = auth.uid() and not round_locked(round_id));

-- Jinxes: an out player names a survivor; hidden until lock; editable until lock.
create policy jinxes_read on jinxes for select to authenticated
  using (jinxer_id = auth.uid() or round_locked(round_id));
create policy jinxes_insert on jinxes for insert to authenticated
  with check (
    jinxer_id = auth.uid() and not round_locked(round_id)
    and alive(jinxer_id, round_id) is false and alive(target_id, round_id) is true
  );
create policy jinxes_update on jinxes for update to authenticated
  using (jinxer_id = auth.uid() and not round_locked(round_id))
  with check (
    jinxer_id = auth.uid() and not round_locked(round_id)
    and alive(jinxer_id, round_id) is false and alive(target_id, round_id) is true
  );

-- Payments: visible to all (pot, paid badges). Players claim €10; only admins confirm.
create policy payments_read on payments for select to authenticated using (true);
create policy payments_claim on payments for insert to authenticated
  with check (
    player_id = auth.uid() and status = 'claimed' and amount_eur = 10
    and confirmed_by is null and confirmed_at is null
  );
create policy payments_admin on payments for update to authenticated using (is_admin()) with check (is_admin());

-- Avatars: public read, each player writes only avatars/<their id>/*.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
