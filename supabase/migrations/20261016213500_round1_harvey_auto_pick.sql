-- One-off, Round 1 only (admins' decision, 16 Oct): Harvey missed the Round 1 pick too and stays in, same way as
-- Cboh (20261016212500_round1_cboh_auto_pick.sql): uniform random() over the Round 1 teams not yet kicked off,
-- logged in pick_draws. The general rule is unchanged.

do $$
declare
  r1 bigint := (select id from rounds where number = 1);
  p uuid := (select id from players where name = 'Harvey');
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
