-- Jersey graphic data (CLAUDE.md §8): replaces teams.pattern with the kit object from src/data/teams.json.
-- Generated from teams.json; Jersey.tsx draws it, supabase/tests/lock.test.ts checks the two stay in step.

alter table teams drop column pattern;
alter table teams add column kit jsonb;

update teams set kit = v.kit::jsonb
from (values
  ('union-bordeaux-begles', '{"pattern": "quarters", "colours": ["#6b1e35", "#14213d"], "trim": "#ffffff", "season": "2025/26", "note": "Claret with dark blue quarters.", "accent": null, "jazz": false}'),
  ('bath-rugby', '{"pattern": "hoops", "width": "broad", "colours": ["#0054a6", "#000000", "#ffffff"], "trim": "#000000", "season": "2025/26", "note": "Blue, black and white hoops.", "accent": null, "jazz": false}'),
  ('bristol-bears', '{"pattern": "plain", "colours": ["#1d2b6f"], "accent": "fade", "accentColours": ["#3a6fd8"], "trim": "#ffffff", "season": "2025/26", "note": "Two-tone blue.", "jazz": false}'),
  ('vodacom-bulls', '{"pattern": "plain", "colours": ["#0b1f4b"], "accent": "fade", "accentColours": ["#2581c4"], "trim": "#e30714", "season": "2026/27", "note": "Navy shoulders fading to Loftus blue; real shirt also has a street-map graphic.", "jazz": false}'),
  ('cardiff-rugby', '{"pattern": "quarters", "colours": ["#000000", "#89bde3"], "trim": "#c9a227", "season": "2026/27", "note": "Black and sky blue quarters, thin gold stripe on the cuffs (150th anniversary).", "accent": null, "jazz": false}'),
  ('asm-clermont-auvergne', '{"pattern": "plain", "colours": ["#fdea00"], "accent": "shoulders", "accentColours": ["#002f6c"], "jazz": true, "trim": "#002f6c", "season": "2025/26", "note": "Yellow and blue. Real shirt is plain yellow with a subtle motif; navy yoke added."}'),
  ('connacht', '{"pattern": "plain", "colours": ["#0b3d2a"], "accent": "side-panels", "accentColours": ["#2fbf5f"], "trim": "#2fbf5f", "season": "2026/27", "note": "Very dark green, bright green geometric graphic down the sides.", "jazz": false}'),
  ('exeter-chiefs', '{"pattern": "plain", "colours": ["#000000"], "accent": "side-panels", "accentColours": ["#8fc3e8"], "trim": "#fecc00", "season": "2026/27", "note": "Retro 2006 Sandy Park shirt with light blue panelling. Base colour not confirmed: check.", "jazz": false}'),
  ('glasgow-warriors', '{"pattern": "plain", "colours": ["#0b0b0f"], "accent": "tartan", "accentColours": ["#84aed1", "#3d6a99", "#8d939b"], "trim": "#84aed1", "season": "2026/27", "note": "Black with blue detailing and the club''s Laoch tartan.", "jazz": false}'),
  ('gloucester-rugby', '{"pattern": "hoops", "width": "broad", "colours": ["#c8102e", "#ffffff"], "trim": "#8a8d8f", "season": "2026/27", "note": "Cherry and white hoops, grey collar.", "accent": null, "jazz": false}'),
  ('leicester-tigers', '{"pattern": "plain", "colours": ["#094438"], "accent": "side-panels", "accentColours": ["#c8102e", "#ffffff"], "trim": "#ffffff", "season": "2025/26", "note": "Green block chest with red and white side panels.", "jazz": false}'),
  ('leinster', '{"pattern": "hoops", "width": "broad", "colours": ["#0053a1", "#ffffff"], "trim": "#0a2d5c", "season": "2026/27", "note": "Blue and white hoops, a 2001 throwback.", "accent": null, "jazz": false}'),
  ('emirates-lions', '{"pattern": "plain", "colours": ["#dc2129"], "accent": "chevrons", "accentColours": ["#ffffff"], "jazz": true, "trim": "#ffffff", "season": "traditional", "note": "Red and white. No 26/27 kit info found; white chevrons added."}'),
  ('montpellier-herault-rugby', '{"pattern": "stripes", "width": "broad", "colours": ["#002c5b", "#0090d4"], "trim": "#ffffff", "season": "2025/26", "note": "Vertical stripes; Hummel chevrons on the sleeves.", "accent": null, "jazz": false}'),
  ('munster-rugby', '{"pattern": "plain", "colours": ["#c8102e"], "accent": "shoulders", "accentColours": ["#122053"], "trim": "#122053", "season": "2026/27", "note": "Red with navy shoulders and arms (adidas 2025-27 home). European shirt: red with a Thomond Park graphic, burgundy shorts.", "jazz": false}'),
  ('northampton-saints', '{"pattern": "hoops", "width": "broad", "colours": ["#0e6240", "#000000"], "edge": "#f2b226", "trim": "#000000", "season": "2026/27", "note": "Broad green and black hoops, thin gold line under each black hoop.", "accent": null, "jazz": false}'),
  ('section-paloise', '{"pattern": "plain", "colours": ["#004231"], "accent": "band", "accentColours": ["#ffffff"], "trim": "#ffffff", "season": "2025/26", "note": "Green with a white block across the front.", "jazz": false}'),
  ('racing-92', '{"pattern": "hoops", "width": "broad", "colours": ["#7fc4ef", "#ffffff"], "trim": "#0b1f4b", "season": "traditional", "note": "Sky blue and white hoops (classic look; 25/26 shirt was plainer).", "accent": null, "jazz": false}'),
  ('stade-rochelais', '{"pattern": "plain", "colours": ["#171412"], "accent": "band", "accentColours": ["#fed100"], "jazz": true, "trim": "#fed100", "season": "2025/26", "note": "Black with a yellow collar. Yellow chest band added."}'),
  ('sale-sharks', '{"pattern": "plain", "colours": ["#0a1f6b"], "accent": "side-panels", "accentColours": ["#f2b226", "#b5412a"], "trim": "#ffffff", "season": "2026/27", "note": "Deep blue; Lowry-inspired yellow and burnt red side panels and cuffs.", "jazz": false}'),
  ('saracens', '{"pattern": "plain", "colours": ["#120a09"], "accent": "fade", "accentColours": ["#c8102e"], "trim": "#c8102e", "season": "2025/26", "note": "Black fading to red.", "jazz": false}'),
  ('stade-francais-paris', '{"pattern": "plain", "colours": ["#ea5097"], "accent": "chevrons", "accentColours": ["#002c5b"], "jazz": true, "trim": "#002c5b", "season": "2025/26", "note": "Pink and navy. Real shirt has Eiffel Tower and lightning graphics; navy chevrons added."}'),
  ('dhl-stormers', '{"pattern": "hoops", "width": "broad", "colours": ["#00358e", "#ffffff"], "trim": "#ffffff", "season": "2026/27", "note": "Blue and white hoops, white collar, black shorts.", "accent": null, "jazz": false}'),
  ('stade-toulousain', '{"pattern": "hoops", "width": "thin", "colours": ["#0a0a0a", "#d30c14"], "trim": "#d30c14", "season": "2025/26", "note": "Black with thin red hoops.", "accent": null, "jazz": false}')
) v(slug, kit)
where teams.slug = v.slug;

alter table teams alter column kit set not null;
