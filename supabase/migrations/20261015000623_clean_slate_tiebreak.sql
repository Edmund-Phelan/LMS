-- Eddie's rulings (CLAUDE.md §5): a clean slate is decided when a round opens and stored on the round (Q1);
-- burn-order ties are broken by one random draw, a shuffle of every team id, made at settle and stored
-- with the round (Q4). Both are written by the admin page from the engine's openRound()/settle.
alter table rounds
  add column clean_slate boolean not null default false,
  add column tiebreak bigint[];

-- Q1: a clean slate clears used AND burned teams, from that round on, for everyone in at its start.
-- Replaces the old outcome = 'clean_slate' marker, which the engine no longer writes.
create or replace function used_teams(p uuid, r bigint) returns table (team_id bigint, round_number int)
language sql stable security definer set search_path = public as $$
  with cur as (select number from rounds where id = r),
  slate as (
    select coalesce(max(rd.number), 0) as from_number
    from rounds rd, cur
    where rd.clean_slate and rd.number <= cur.number and alive(p, rd.id) is true
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
  select b.team_id, rd.number
  from burned_teams b join rounds rd on rd.id = b.round_id, slate
  where b.player_id = p and rd.number >= slate.from_number
$$;
