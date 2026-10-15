-- Team card colours: primary/text, except where a single-colour crest would vanish on its own primary.
-- Matches cardBg/cardText in src/data/teams.json (supabase/tests/lock.test.ts checks).

alter table teams add column card_bg text, add column card_text text;
update teams set card_bg = "primary", card_text = text;
update teams set card_bg = v.bg, card_text = v.fg
from (values
  ('sale-sharks', '#ffffff', '#000050'),
  ('leinster', '#ffffff', '#0053a1'),
  ('bristol-bears', '#ffffff', '#212e83'),
  ('connacht', '#ffffff', '#00853f'),
  ('saracens', '#c8102e', '#ffffff'),
  ('leicester-tigers', '#c8102e', '#ffffff')
) v(slug, bg, fg)
where teams.slug = v.slug;
alter table teams alter column card_bg set not null, alter column card_text set not null;
