-- LIVE-FEED.md §3 step 1: Highlightly ids. Teams by name from the Round 1 match lists, pools from Highlightly's
-- /standings (agrees with src/data/standings.json and UI-REDESIGN §15); Round 1 matches by (home, away, kick-off).
-- Fixtures: supabase/functions/_fixtures/ (18 Oct). League 46738, season 2026.

alter table teams add column hl_team_id int unique, add column pool smallint check (pool between 1 and 4);
alter table matches add column hl_match_id int unique;

update teams t set hl_team_id = v.id, pool = v.pool
from (values
  (85033, 'asm-clermont-auvergne', 1),
  (50142, 'bath-rugby', 4),
  (50993, 'bristol-bears', 3),
  (520745, 'cardiff-rugby', 4),
  (339482, 'connacht', 2),
  (529255, 'dhl-stormers', 3),
  (253531, 'emirates-lions', 2),
  (51844, 'exeter-chiefs', 2),
  (346290, 'glasgow-warriors', 1),
  (52695, 'gloucester-rugby', 3),
  (54397, 'leicester-tigers', 1),
  (347141, 'leinster', 1),
  (87586, 'montpellier-herault-rugby', 4),
  (347992, 'munster-rugby', 3),
  (56099, 'northampton-saints', 4),
  (89288, 'racing-92', 3),
  (56950, 'sale-sharks', 1),
  (57801, 'saracens', 2),
  (90139, 'section-paloise', 1),
  (90990, 'stade-francais-paris', 4),
  (85884, 'stade-rochelais', 2),
  (91841, 'stade-toulousain', 2),
  (82480, 'union-bordeaux-begles', 3),
  (250978, 'vodacom-bulls', 4)
) as v(id, slug, pool)
where t.slug = v.slug;

update matches m set hl_match_id = v.id
from (values
  (46181150, 'gloucester-rugby', 'union-bordeaux-begles', '2026-10-16T19:00:00.000Z'),
  (46187958, 'munster-rugby', 'racing-92', '2026-10-17T19:00:00.000Z'),
  (46187107, 'bath-rugby', 'montpellier-herault-rugby', '2026-10-17T19:00:00.000Z'),
  (46186256, 'stade-rochelais', 'emirates-lions', '2026-10-17T16:30:00.000Z'),
  (46185405, 'connacht', 'saracens', '2026-10-17T16:30:00.000Z'),
  (46184554, 'dhl-stormers', 'bristol-bears', '2026-10-17T14:15:00.000Z'),
  (46183703, 'asm-clermont-auvergne', 'leinster', '2026-10-17T14:15:00.000Z'),
  (46182852, 'sale-sharks', 'glasgow-warriors', '2026-10-17T12:00:00.000Z'),
  (46182001, 'vodacom-bulls', 'stade-francais-paris', '2026-10-17T12:00:00.000Z'),
  (46190511, 'northampton-saints', 'cardiff-rugby', '2026-10-18T16:30:00.000Z'),
  (46189660, 'stade-toulousain', 'exeter-chiefs', '2026-10-18T14:15:00.000Z'),
  (46188809, 'section-paloise', 'leicester-tigers', '2026-10-18T12:00:00.000Z')
) as v(id, home, away, kickoff), teams h, teams a
where h.slug = v.home and a.slug = v.away
  and m.home_team_id = h.id and m.away_team_id = a.id and m.kickoff_at = v.kickoff::timestamptz;

do $$ begin
  if (select count(*) from teams where hl_team_id is null) > 0 then raise exception 'unmapped team'; end if;
  if (select count(*) from matches m join rounds r on r.id = m.round_id where r.number = 1 and m.hl_match_id is null) > 0
    then raise exception 'unmapped Round 1 match'; end if;
end $$;
