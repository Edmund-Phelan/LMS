-- Pool round 1 fixtures, Irish time (IST, UTC+1, before the 25 Oct clock change).
-- Source: rugbyworld.com/rugby-fixtures/champions-cup-fixtures, checked 15 Oct 2026. Home team first.

insert into matches (round_id, home_team_id, away_team_id, kickoff_at)
select r.id, h.id, a.id, (f.ko || ' Europe/Dublin')::timestamptz
from (values
  ('2026-10-16 20:00', 'gloucester-rugby', 'union-bordeaux-begles'),
  ('2026-10-17 13:00', 'sale-sharks', 'glasgow-warriors'),
  ('2026-10-17 13:00', 'vodacom-bulls', 'stade-francais-paris'),
  ('2026-10-17 15:15', 'asm-clermont-auvergne', 'leinster'),
  ('2026-10-17 15:15', 'dhl-stormers', 'bristol-bears'),
  ('2026-10-17 17:30', 'connacht', 'saracens'),
  ('2026-10-17 17:30', 'stade-rochelais', 'emirates-lions'),
  ('2026-10-17 20:00', 'bath-rugby', 'montpellier-herault-rugby'),
  ('2026-10-17 20:00', 'munster-rugby', 'racing-92'),
  ('2026-10-18 13:00', 'section-paloise', 'leicester-tigers'),
  ('2026-10-18 15:15', 'stade-toulousain', 'exeter-chiefs'),
  ('2026-10-18 17:30', 'northampton-saints', 'cardiff-rugby')
) f(ko, home, away)
join rounds r on r.number = 1
join teams h on h.slug = f.home
join teams a on a.slug = f.away;

-- Guard: every team exactly once, and lock = first kick-off.
do $$ begin
  if exists (
    select 1 from rounds r
    where r.number = 1 and (
      (select count(*) from matches where round_id = r.id) <> 12
      or (select count(distinct t) from matches m, unnest(array[m.home_team_id, m.away_team_id]) t where m.round_id = r.id) <> 24
      or (select min(kickoff_at) from matches where round_id = r.id) <> r.lock_at)
  ) then raise exception 'fixtures r1 failed sanity check'; end if;
end $$;
