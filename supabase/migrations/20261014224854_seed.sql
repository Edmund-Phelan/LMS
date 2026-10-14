-- Reference data. Teams from src/data/teams.json; pattern is TODO (CLAUDE.md §10).

insert into teams (slug, name, "primary", secondary, text, crest) values
  ('union-bordeaux-begles', 'Bordeaux-Bègles', '#713042', '#ffffff', '#ffffff', 'crests/union-bordeaux-begles.png'),
  ('bath-rugby', 'Bath', '#0054a6', '#000000', '#ffffff', 'crests/bath-rugby.png'),
  ('bristol-bears', 'Bristol', '#212e83', '#ffffff', '#ffffff', 'crests/bristol-bears.png'),
  ('vodacom-bulls', 'Bulls', '#2581c4', '#e30714', '#ffffff', 'crests/vodacom-bulls.png'),
  ('cardiff-rugby', 'Cardiff', '#89bde3', '#1b1310', '#000000', 'crests/cardiff-rugby.png'),
  ('asm-clermont-auvergne', 'Clermont', '#fdea00', '#002f6c', '#000000', 'crests/asm-clermont-auvergne.png'),
  ('connacht', 'Connacht', '#00853f', '#ffffff', '#ffffff', 'crests/connacht.png'),
  ('exeter-chiefs', 'Exeter', '#000000', '#fecc00', '#ffffff', 'crests/exeter-chiefs.png'),
  ('glasgow-warriors', 'Glasgow', '#000000', '#84aed1', '#ffffff', 'crests/glasgow-warriors.png'),
  ('gloucester-rugby', 'Gloucester', '#dd1a32', '#ffffff', '#ffffff', 'crests/gloucester-rugby.png'),
  ('leicester-tigers', 'Leicester', '#094438', '#c8102e', '#ffffff', 'crests/leicester-tigers.png'),
  ('leinster', 'Leinster', '#0053a1', '#ffffff', '#ffffff', 'crests/leinster.png'),
  ('emirates-lions', 'Lions', '#dc2129', '#140404', '#ffffff', 'crests/emirates-lions.png'),
  ('montpellier-herault-rugby', 'Montpellier', '#002c5b', '#0090d4', '#ffffff', 'crests/montpellier-herault-rugby.png'),
  ('munster-rugby', 'Munster', '#c8102e', '#122053', '#ffffff', 'crests/munster-rugby.png'),
  ('northampton-saints', 'Northampton', '#0e6240', '#f2b226', '#ffffff', 'crests/northampton-saints.png'),
  ('section-paloise', 'Pau', '#004231', '#ffffff', '#ffffff', 'crests/section-paloise.png'),
  ('racing-92', 'Racing 92', '#c2e0f7', '#ffffff', '#000000', 'crests/racing-92.png'),
  ('stade-rochelais', 'La Rochelle', '#171412', '#fed100', '#ffffff', 'crests/stade-rochelais.png'),
  ('sale-sharks', 'Sale', '#000050', '#ffffff', '#ffffff', 'crests/sale-sharks.png'),
  ('saracens', 'Saracens', '#120a09', '#c8102e', '#ffffff', 'crests/saracens.png'),
  ('stade-francais-paris', 'Stade Français', '#ea5097', '#002c5b', '#ffffff', 'crests/stade-francais-paris.png'),
  ('dhl-stormers', 'Stormers', '#00358e', '#fec20c', '#ffffff', 'crests/dhl-stormers.png'),
  ('stade-toulousain', 'Toulouse', '#d30c14', '#040000', '#ffffff', 'crests/stade-toulousain.png');

-- Pool locks: Fri 8pm Irish time. Round 1 is IST (UTC+1); clocks go back 25 Oct, so R2-R4 are UTC+0.
insert into rounds (number, stage, name, lock_at) values
  (1, 'pool', 'Round 1', timestamptz '2026-10-16 20:00 Europe/Dublin'),
  (2, 'pool', 'Round 2', timestamptz '2026-12-11 20:00 Europe/Dublin'),
  (3, 'pool', 'Round 3', timestamptz '2027-01-08 20:00 Europe/Dublin'),
  (4, 'pool', 'Round 4', timestamptz '2027-01-15 20:00 Europe/Dublin');
