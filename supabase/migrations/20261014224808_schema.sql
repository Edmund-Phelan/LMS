-- Core schema. All times timestamptz (UTC); displayed in Europe/Dublin by the client.

create type stage as enum ('pool', 'r16', 'qf', 'sf', 'final');
create type match_status as enum ('scheduled', 'completed', 'postponed', 'abandoned');
create type payment_kind as enum ('entry', 'buyback');
create type payment_status as enum ('claimed', 'confirmed');
create type burn_reason as enum ('buyback_penalty', 'resurrection_penalty');
create type round_outcome as enum ('through', 'out', 'survived_postponed', 'clean_slate', 'reinstated', 'already_out');

create table players (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  nickname text,
  avatar_url text,
  kit_colour text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table teams (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  "primary" text not null,
  secondary text not null,
  text text not null,
  crest text not null,
  pattern text check (pattern in ('hoops', 'stripes', 'halves', 'plain'))
);

create table rounds (
  id bigint generated always as identity primary key,
  number int not null unique,
  stage stage not null,
  name text not null,
  lock_at timestamptz not null,
  featured_match_id bigint,
  settled_at timestamptz
);

create table matches (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds on delete cascade,
  home_team_id bigint not null references teams,
  away_team_id bigint not null references teams,
  kickoff_at timestamptz not null,
  home_score int check (home_score >= 0),
  away_score int check (away_score >= 0),
  winner_team_id bigint references teams,
  status match_status not null default 'scheduled',
  check (home_team_id <> away_team_id)
);
create index on matches (round_id);

alter table rounds add foreign key (featured_match_id) references matches on delete set null;

create table picks (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds on delete cascade,
  player_id uuid not null references players on delete cascade,
  team_id bigint not null references teams,
  is_auto boolean not null default false,
  is_resurrection boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table predictions (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds on delete cascade,
  player_id uuid not null references players on delete cascade,
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  unique (round_id, player_id)
);

create table jinxes (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds on delete cascade,
  jinxer_id uuid not null references players on delete cascade,
  target_id uuid not null references players on delete cascade,
  unique (round_id, jinxer_id),
  check (jinxer_id <> target_id)
);

create table payments (
  id bigint generated always as identity primary key,
  player_id uuid not null references players on delete cascade,
  kind payment_kind not null,
  amount_eur numeric(8, 2) not null check (amount_eur > 0),
  status payment_status not null default 'claimed',
  claimed_at timestamptz not null default now(),
  confirmed_by uuid references players,
  confirmed_at timestamptz
);

create table burned_teams (
  id bigint generated always as identity primary key,
  player_id uuid not null references players on delete cascade,
  team_id bigint not null references teams,
  round_id bigint not null references rounds,
  reason burn_reason not null,
  unique (player_id, team_id)
);

create table round_results (
  id bigint generated always as identity primary key,
  round_id bigint not null references rounds on delete cascade,
  player_id uuid not null references players on delete cascade,
  outcome round_outcome not null,
  prediction_points int not null default 0,
  exact_score boolean not null default false,
  jinx_points int not null default 0,
  unique (round_id, player_id)
);
