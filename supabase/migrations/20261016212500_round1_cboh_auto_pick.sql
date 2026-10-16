-- One-off, Round 1 only (admins' decision, 16 Oct): Cboh missed the Round 1 pick and stays in, with a random
-- team as if the missed-pick rule (2) applied. The general rule is unchanged: auto_pick_locked_rounds still
-- skips Round 1. Draw: uniform server-side random() over the Round 1 teams whose match hadn't kicked off yet
-- (so not Gloucester v Bordeaux-Bègles, 8pm Fri). Logged in pick_draws so the lads can see it was random.

create table pick_draws (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds(id),
  player_id uuid not null references players(id),
  team_id bigint not null references teams(id),
  drawn_at timestamptz not null default now(),
  method text not null,
  candidates bigint[] not null
);
alter table pick_draws enable row level security;
-- Same rule as picks: visible once the round has locked. No write policies: SQL/admin only.
create policy pick_draws_select on pick_draws for select to authenticated
  using (now() >= (select lock_at from rounds where id = round_id));

do $$
declare
  r1 bigint := (select id from rounds where number = 1);
  p uuid := (select id from players where name = 'Cboh');
  pool bigint[];
  team bigint;
begin
  if p is null or exists (select 1 from picks where round_id = r1 and player_id = p) then
    return; -- not this database, or already done
  end if;
  select array_agg(t order by t) into pool from (
    select home_team_id t from matches where round_id = r1 and kickoff_at > now()
    union select away_team_id from matches where round_id = r1 and kickoff_at > now()
  ) x;
  team := pool[1 + floor(random() * array_length(pool, 1))::int];
  insert into picks (round_id, player_id, team_id, is_auto) values (r1, p, team, true);
  insert into pick_draws (round_id, player_id, team_id, method, candidates)
  values (r1, p, team,
    'One-off Round 1 missed pick (admins'' decision): uniform Postgres random() over the '
      || array_length(pool, 1) || ' Round 1 teams whose match had not kicked off at drawn_at', pool);
end $$;
