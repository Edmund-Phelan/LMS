-- LIVE-FEED.md §3 step 2: storage for the Highlightly feed. The feed (Edge Function hl-sync, service role) writes;
-- everyone signed in reads; picks/predictions/jinx policies untouched. Results rules are §4: the guard trigger below
-- is the database half (never overwrite an admin's score, never touch a settled round's result).

alter table matches
  add column live_state text,
  add column live_home int,
  add column live_away int,
  add column live_updated_at timestamptz,
  add column result_source text check (result_source in ('api', 'admin')),
  add column check_state text check (check_state in ('pending', 'match', 'espn_lag', 'mismatch')),
  add column needs_admin text, -- null = fine, else why: awarded, knockout level, extra time in a pool match, mismatch
  add column details jsonb, -- raw /matches/{id}
  add column details_at timestamptz,
  add column lineups_at timestamptz,
  add column espn_event_id int,
  add column highlight_url text; -- admin's pasted YouTube link, wins over the API's clip

-- An admin typing a result makes it theirs; the feed (service_role) can't change an admin's result or a settled
-- round's. Live fields are always free to change.
create function matches_result_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.home_score, new.away_score, new.status, new.winner_team_id)
     is not distinct from (old.home_score, old.away_score, old.status, old.winner_team_id) then
    return new;
  end if;
  if current_user = 'service_role' then
    if old.result_source = 'admin' then
      raise exception 'Match % has an admin result; the feed never overwrites it', old.id;
    end if;
    if (select settled_at from rounds where id = old.round_id) is not null then
      raise exception 'Match % is in a settled round', old.id;
    end if;
  elsif auth.uid() is not null then
    new.result_source := 'admin';
  end if;
  return new;
end $$;

create trigger matches_result_guard before update on matches
  for each row execute function matches_result_guard();

create table match_highlights (
  id bigint primary key, -- Highlightly's id
  match_id bigint not null references matches on delete cascade,
  type text,
  category text,
  title text,
  img_url text,
  url text,
  embed_url text,
  source text,
  channel text,
  hidden boolean not null default false, -- admin hid it
  fetched_at timestamptz not null default now()
);
create index on match_highlights (match_id);

create table pool_standings (
  team_id bigint primary key references teams,
  pool smallint not null,
  position smallint not null,
  played smallint not null,
  won smallint not null,
  drawn smallint not null,
  lost smallint not null,
  points_for int not null,
  points_against int not null,
  points smallint not null,
  updated_at timestamptz not null default now()
);

-- §4: the standings delta baseline, taken before the round's first kick-off and never changed after.
create table standings_baseline (
  round_id bigint not null references rounds on delete cascade,
  team_id bigint not null references teams,
  played smallint not null,
  points_for int not null,
  points_against int not null,
  primary key (round_id, team_id)
);

create table api_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  endpoint text not null,
  http_status int,
  remaining int, -- x-ratelimit-requests-remaining: the budget's source of truth
  note text
);
create index on api_calls (at);

create table match_scouting (
  match_id bigint primary key references matches on delete cascade,
  h2h jsonb,
  home_form jsonb,
  away_form jsonb,
  updated_at timestamptz not null default now()
);

create table team_season_stats (
  team_id bigint not null references teams,
  season int not null,
  total jsonb,
  home jsonb,
  away jsonb,
  updated_at timestamptz not null default now(),
  primary key (team_id, season)
);

-- One row. Off until the shadow test passes (§3 step 5).
create table feed_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  league_id int not null default 46738,
  season int not null default 2026,
  daily_budget int not null default 100
);
insert into feed_settings default values;

alter table match_highlights enable row level security;
alter table pool_standings enable row level security;
alter table standings_baseline enable row level security;
alter table api_calls enable row level security;
alter table match_scouting enable row level security;
alter table team_season_stats enable row level security;
alter table feed_settings enable row level security;

create policy match_highlights_read on match_highlights for select to authenticated using (not hidden or is_admin());
create policy match_highlights_admin on match_highlights for update to authenticated
  using (is_admin()) with check (is_admin());
create policy pool_standings_read on pool_standings for select to authenticated using (true);
create policy standings_baseline_read on standings_baseline for select to authenticated using (true);
create policy match_scouting_read on match_scouting for select to authenticated using (true);
create policy team_season_stats_read on team_season_stats for select to authenticated using (true);
create policy api_calls_admin on api_calls for select to authenticated using (is_admin());
create policy feed_settings_admin on feed_settings for select to authenticated using (is_admin());

-- Live scores push to open screens. (No publication in the PGlite tests.)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table matches, match_highlights;
  end if;
end $$;
