-- Pool rounds 2-4 fixtures, Irish/UK time (both UTC+0 in Dec/Jan).
-- Source: rugbyworld.com/rugby-fixtures/champions-cup-fixtures, checked 15 Oct 2026. Home team first.

insert into matches (round_id, home_team_id, away_team_id, kickoff_at)
select r.id, h.id, a.id, (f.ko || ' Europe/Dublin')::timestamptz
from (values
  (2, '2026-12-11 20:00', 'stade-francais-paris', 'northampton-saints'),
  (2, '2026-12-11 20:00', 'glasgow-warriors', 'section-paloise'),
  (2, '2026-12-12 13:00', 'emirates-lions', 'stade-toulousain'),
  (2, '2026-12-12 15:15', 'leicester-tigers', 'asm-clermont-auvergne'),
  (2, '2026-12-12 15:15', 'montpellier-herault-rugby', 'vodacom-bulls'),
  (2, '2026-12-12 17:30', 'leinster', 'sale-sharks'),
  (2, '2026-12-12 17:30', 'saracens', 'stade-rochelais'),
  (2, '2026-12-12 20:00', 'bristol-bears', 'munster-rugby'),
  (2, '2026-12-12 20:00', 'cardiff-rugby', 'bath-rugby'),
  (2, '2026-12-13 13:00', 'exeter-chiefs', 'connacht'),
  (2, '2026-12-13 15:15', 'union-bordeaux-begles', 'dhl-stormers'),
  (2, '2026-12-13 17:30', 'racing-92', 'gloucester-rugby'),

  (3, '2027-01-08 20:00', 'glasgow-warriors', 'leicester-tigers'),
  (3, '2027-01-09 13:00', 'gloucester-rugby', 'dhl-stormers'),
  (3, '2027-01-09 15:15', 'exeter-chiefs', 'stade-rochelais'),
  (3, '2027-01-09 15:15', 'vodacom-bulls', 'bath-rugby'),
  (3, '2027-01-09 17:30', 'leinster', 'section-paloise'),
  (3, '2027-01-09 17:30', 'montpellier-herault-rugby', 'northampton-saints'),
  (3, '2027-01-09 20:00', 'connacht', 'stade-toulousain'),
  (3, '2027-01-09 20:00', 'stade-francais-paris', 'cardiff-rugby'),
  (3, '2027-01-10 13:00', 'racing-92', 'bristol-bears'),
  (3, '2027-01-10 15:15', 'union-bordeaux-begles', 'munster-rugby'),
  (3, '2027-01-10 15:15', 'saracens', 'emirates-lions'),
  (3, '2027-01-10 17:30', 'sale-sharks', 'asm-clermont-auvergne'),

  (4, '2027-01-15 20:00', 'northampton-saints', 'vodacom-bulls'),
  (4, '2027-01-15 20:00', 'cardiff-rugby', 'montpellier-herault-rugby'),
  (4, '2027-01-16 13:00', 'emirates-lions', 'exeter-chiefs'),
  (4, '2027-01-16 13:00', 'section-paloise', 'sale-sharks'),
  (4, '2027-01-16 15:15', 'bristol-bears', 'union-bordeaux-begles'),
  (4, '2027-01-16 15:15', 'dhl-stormers', 'racing-92'),
  (4, '2027-01-16 17:30', 'stade-rochelais', 'connacht'),
  (4, '2027-01-16 17:30', 'munster-rugby', 'gloucester-rugby'),
  (4, '2027-01-16 20:00', 'asm-clermont-auvergne', 'glasgow-warriors'),
  (4, '2027-01-16 20:00', 'leicester-tigers', 'leinster'),
  (4, '2027-01-17 15:15', 'stade-toulousain', 'saracens'),
  (4, '2027-01-17 17:30', 'bath-rugby', 'stade-francais-paris')
) f(round, ko, home, away)
join rounds r on r.number = f.round
join teams h on h.slug = f.home
join teams a on a.slug = f.away;

-- Guard: every team exactly once per round, and lock = first kick-off.
do $$ begin
  if exists (
    select 1 from rounds r
    where r.number between 2 and 4 and (
      (select count(*) from matches where round_id = r.id) <> 12
      or (select count(distinct t) from matches m, unnest(array[m.home_team_id, m.away_team_id]) t where m.round_id = r.id) <> 24
      or (select min(kickoff_at) from matches where round_id = r.id) <> r.lock_at)
  ) then raise exception 'fixtures r2-r4 failed sanity check'; end if;
end $$;
