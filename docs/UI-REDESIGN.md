# UI redesign: build spec (15 Oct 2026)

Eddie signed this design off on 15 Oct. It replaces the "basic HTML" look with an Investec Champions Cup navy-and-gold app shell, a bottom tab bar,
team takeovers with sound, a points table, a profile hub, a redesigned admin flow and a proper rules page.

**Sources (read both before writing code):**
- Clickable prototype (Eddie's canvas): https://claude.ai/artifact/V2XhvcJM87nzYvwmH7fpRW. Three artboards: player app, admin, rules.
- The same three screens as files: `docs/ui-prototype/Main.dc.html`, `Admin.dc.html`, `Rules.dc.html`. They use a design-tool
  templating format (`<x-dc>`, `<sc-if>`, `<sc-for>`, `{{holes}}`, a `renderVals()` class), **not React**. Port the markup, the
  CSS in `<helmet><style>`, the copy and the Web Audio code by hand. Don't import or run them. Crest URLs in them (`/_blob/…`) are
  canvas uploads: use `crestUrl(team)` from `src/lib/supabase.ts`.
- The rules and CLAUDE.md still win on behaviour. This spec only changes presentation, plus the two read-only RPCs in §8.

**The comp (15 Oct)**
- **11 players:** Eddie (owner, admin), Conn (admin), Cboh, Kevin, Conor, Ed, Harvey, Rory, Eoin, Mark, Michael. Eddie and Ed
  are different people. Design every list for 11 rows and every avatar strip for 11 avatars (it wraps; see §9). Full pot = €110
  (€88 / €22).
- **The side game starts in Round 1** (Eddie, 15 Oct). Every player, in or out, predicts the featured match every round
  starting now, so the prediction card (§3.4), the Table (§6) and the points on Me (§7) are live from Round 1's settle. CLAUDE.md
  rule 13 and the rules doc already say so.
- The prototype screens now use these names; their statuses, scores and points are still sample data.

**Ground rules**
- Land this after Round 1 is settled (Sun 18 Oct), unless Eddie says otherwise. Nothing in it may touch picks, RLS or the lock
  while a round is live.
- CLAUDE.md §7 still applies: every animation under 1.5 s, skippable, `prefers-reduced-motion` gives still frames, haptics stay
  a bonus layer.
- **Change to CLAUDE.md §7:** the "Sound (whistle, crowd) muted by default" line becomes "Sound on by default, with a mute
  toggle in the header and on the Me screen; respects the iPhone silent switch". Update that line in CLAUDE.md as part of this
  packet.
- Accessibility: real `<button>`/`<a>`, `aria-label` on icon-only buttons, 44 px touch targets, text contrast 4.5:1.

Suggested commit order (each one shippable): tokens + shell + tabs → Round screen → takeover + sound → squad RPC → Me → Table
(points RPC) → Rules → Admin. The knocked-out screens (§17) belong to this packet too; the Pools tab and live states
(§15–16) arrive with packet 5c.

---

## 1. Design tokens (`src/index.css`, Tailwind v4 `@theme`): Investec Champions Cup theme

Eddie (15 Oct): the app takes the **Investec Champions Cup colours**: Investec navy as the ground, Investec blue as the
secondary accent, Champions Cup star gold as the main accent. Colours only: **no Investec, EPCR or Champions Cup logos,
wordmarks or zebra mascot** anywhere in the app (private app, and they're trademarks). The BBB tile stays our own mark.

| Token | Value | Use |
| --- | --- | --- |
| `navy-950` | `#050a1f` | behind the app (desktop margins) |
| `navy-900` | `#0b1742` | **Investec navy**: app background, `theme-color` meta, manifest `background_color`/`theme_color`, text on gold buttons |
| `navy-800` | `#14224f` | surfaces / cards |
| `navy-700` | `#1c2d63` | raised: step dots, inactive fills |
| `navy-600` | `#233873` | avatar fill (no photo) |
| `stripe-a` / `stripe-b` | `#13235a` / `#0f1d4c` | hero stripes: `repeating-linear-gradient(90deg, a 0 12.5%, b 12.5% 25%)` + `radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,.18), transparent 60%)` on top |
| `chalk` | `#f4f1e8` | primary text |
| `chalk-2` | `#dde3f2` / `#cdd5ea` | body and secondary text |
| `muted` | `#a8b3d1` | labels, captions |
| `gold` | `#f2b226` (hover `#ffd166`) | **the accent**: current tab, your pick, CTAs, locked-in ring |
| `blue` / `blue-text` | `#5e9ad3` / `#9cc3ec` | **Investec blue**: "Picked" chips, squad progress bar, admin has-picked badges, links/focus where gold would clash |
| `in` / `in-text` | `#3ccf7a` / `#6fe3a1` | still in, saved, confirmed |
| `out-text` | `#ff8a8a` | out, reject, sign out |
| `warn` | `#ffb35c` | unpaid, OPEN rule |
| hairline | `rgba(255,255,255,.06)` | card inset `box-shadow: inset 0 0 0 1px`, row dividers |
| border | `rgba(255,255,255,.12–.16)` | outline buttons |
| tab bar | `rgba(8,17,50,.92)` + `blur(16px)` | bottom bar |

Wherever this spec or the prototypes say "pitch", read navy. The prototype files already use these values.

- **Type:** display **Barlow Condensed** 600/700/800 (titles, numbers, team names); body **Barlow** 400–700. Add a Google
  Fonts `<link>` in `index.html` (or `@fontsource/barlow` + `@fontsource/barlow-condensed`). Numbers use `tabular-nums`.
- **Radii:** big cards 20–24, fixture cards 18, buttons 12–16, chips 999.
- Update `index.html` `theme-color`, the PWA manifest colours, the favicon/apple-touch-icon backgrounds and `og.png` to the
  navy + gold scheme.
- Team colours are untouched: fixture cards and takeovers keep each club's own colours on top of the navy.

## 2. App shell and navigation

New `src/Shell.tsx` wraps every signed-in route except first-login profile setup.

- **Top bar** (64 px + `env(safe-area-inset-top)`): a 36 px gold tile reading "BBB" (Barlow Condensed 800, navy-900 text);
  eyebrow "LAST MAN STANDING" (12 px, letter-spacing .18em, muted); screen title (20 px/800); on the right a 44 px round
  **sound toggle** (speaker icon gold on a `rgba(242,178,38,.12)` fill when on; speaker-with-x in muted when off).
- **Scroll area:** flex 1, `overflow-y: auto`, padding 8 16 24, scrollbar hidden. Scroll to the top on tab change.
- **Bottom tab bar** (84 px including `env(safe-area-inset-bottom)`, `rgba(7,23,15,.92)` + `backdrop-filter: blur(16px)`, top
  hairline): four tabs: **Round** (rugby ball icon) `/round/:n`, **Pools** (grid) `/pools` (§15), **Table** (trophy)
  `/table`, **Me** (person) `/me`. Active:
  gold icon and label, plus a 34×3 gold indicator at the top edge that grows in (`scaleX 0→1`, .35 s spring). Inactive: muted.
  Use `NavLink`; keep `HashRouter`.
- **Pushed pages** (no tab bar, back chevron top-left, 44 px): `/me/edit` (the existing Profile form, restyled dark), `/rules`,
  `/admin/:n`. Back = `navigate(-1)`, falling back to `/me`. This fixes "Profile has no way back".
- **Round switcher** (top of the Round tab, replaces the `← Round n →` links): a horizontal scroll row of pills, 58×52, radius
  14: label (R1 R2 R3 R4 R16 QF SF Final, condensed 17/800) over the weekend date (10 px). Current: gold fill, navy-900 text.
  Others: `rgba(255,255,255,.04)` fill, 1 px border. Silent (no sound). A round that isn't open yet shows a dashed card: lock
  icon, round title and "Opens when Round N−1 is settled. Picks lock Fri DD Mon, 20:00." (knockouts: "Lock time set once
  kick-offs are announced").
- **Transitions:** each tab screen enters with `screenIn` (opacity 0→1, translateY 16→0, .34 s `cubic-bezier(.2,.8,.2,1)`);
  its direct children `rise` in with a 40 ms stagger (.5 s, translateY 22 + scale .98 → rest).

## 3. Round screen (`RoundPage.tsx`), top to bottom

### 3.1 Hero
- Pitch stripes + radial highlight, radius 24, padding 20 18 18.
- **Before the lock:** eyebrow "PICKS LOCK IN" (gold, 13/700, .22em); four countdown tiles (70 px wide, `rgba(0,0,0,.32)`,
  radius 14): number in condensed 38/800, unit (DAYS HRS MIN SEC) in 10/700. The seconds number re-animates every tick: alternate
  two identical keyframe classes `sec-a`/`sec-b` (translateY −40% + fade → rest, .5 s) by `s % 2`. Under them: "Fri 16 Oct · 20:00
  Irish time".
- **After the lock:** lock icon (gold), "Picks are locked" (condensed 34/800), "Locked Fri 16 Oct · 20:00. Flip the cards below."
  Enters with `pop`.
- Chips row: "Pot **€X**" (amount in gold with a moving shimmer: gold/`#fff2c4`/gold gradient clipped to text, 3.5 s linear
  loop), "N still in", "X/Y picked" (after the lock: "X/Y locked in").

### 3.2 Your pick card (Eddie's rule: never say "locked in" before the lock)
| State | Look |
| --- | --- |
| No pick, before the lock | 2 px dashed gold border, gold 7% fill, pulsing gold glow (`box-shadow` 0→8 px, 1.8 s loop), clock icon, "No pick yet", sub: Round 1 "No pick in Round 1 means no entry. Tap a team below."; later rounds "No pick by the lock gets you a random team you haven't used." |
| Picked, before the lock | Full card in team `primary` with team `text` colour; decorative 140 px circle in `secondary` at 18% top-right; crest in a 52 px white circle; eyebrow "YOUR PICK"; name condensed 26/800; sub "Change it any time before the lock". **No gold ring, no lock icon.** Tapping it replays the takeover (and its sound). |
| After the lock | The same card plus a gold ring `0 0 0 3px #f2b226, 0 0 34px rgba(242,178,38,.45)` (`box-shadow` transition .5 s), a lock icon before the eyebrow, eyebrow "LOCKED IN", sub "Locked at 20:00 Friday. Good luck." Plays `pop` once if the lock passes with the screen open. Not tappable. |
| No pick, after the lock | Round 1: "You missed the Round 1 lock, so you're not in this year." Later rounds: show the auto-pick once it lands. |

### 3.3 Fixtures
- Grouped by day: heading "FRIDAY 16 OCT" (condensed 15/700, .14em, muted).
- Per fixture: a time row (12/600 muted), plus a gold "FEATURED" chip if it's the featured match; then a grid
  `1fr 22px 1fr`: home card, gold condensed "v", away card.
- **Card:** 118 px tall, radius 18, `card_bg`/`card_text` from the teams table, crest 48 px, name condensed 19/800 with
  ellipsis, "Home"/"Away" 11 px at 75%.
  - hover: translateY −2 px. Press: `scale(.93)`. Transitions use the spring `cubic-bezier(.3,1.5,.5,1)` .22 s.
  - **picked:** gold ring `0 0 0 3px #f2b226, 0 12px 34px rgba(242,178,38,.38)`, `scale(1.03)`, plus a **24 px gold check badge
    inside the card's top-right corner** (top 8, right 8, pops in). The old "YOUR PICK" chip at `top: -9px` collided with the
    time / FEATURED row above. Nothing may sit outside the card's bounds.
  - **other cards once you've picked:** opacity .55 + `saturate(.7)`.
  - used/burned: keep the existing disabled grayscale + "used R1" label.
  - after the lock: every card disabled.
  - `aria-label` "Pick Munster (home)" or "Your pick: Munster (home)"; `aria-pressed`.

### 3.4 Featured-match prediction (after the existing Raffle reveal)
- Card (navy-800, radius 24): title "Predict the featured match" + gold "EXACT = 5 PTS".
- Two columns: crest in a 56 px white circle, team name, then **− [n] +** steppers: 36×44 buttons on a `rgba(255,255,255,.08)`
  fill, number condensed 40/800 tabular, clamp 0–99. This replaces the two text inputs.
- Caption: "Right winner 1 · within 10 = 2 · within 5 = 3 · exact 5".
- Gold "Save prediction" button (50 px). On save it turns green with a check that pops in, label "Prediction saved". Any change
  after that returns it to the unsaved state. Saving plays a short whistle + small roar (§5). The steppers are silent.

### 3.5 The squad (bottom of the screen)
- Title "The squad", right "X of Y picked"; a 6 px Investec-blue progress bar (`width` transition .6 s).
- One row per player in the round (11 in Round 1): Avatar (kit ring), name, a paid line ("Paid" muted, or "Entry not paid yet" in warn),
  and a chip on the right:
  - before the lock: picked → Investec-blue chip with a check, "Picked"; not picked → dashed outline "Thinking…".
  - after the lock: gold "Locked in" / dashed "No pick".
- Footer: "Teams stay hidden until the lock, admins included. Then the cards flip."
- **Never shows a team before the lock.** Data comes from `round_pick_status` (§8).
- After the lock, the existing `RevealCards` team sheet sits above the squad, restyled to the dark cards.

### 3.6 Jinx picker (players who are out)
Replace the `<select>` with a row of survivor avatars to tap (single select, gold ring on the chosen one, same upsert).

## 4. Team takeover (`Pick.tsx` → `Takeover`)
Match the prototype's choreography (CSS keyframes or `motion`, both fine):

| Layer | Animation |
| --- | --- |
| Container | fixed inset, bg team `primary`, colour team `text`; `clip-path: circle(0% → 150% at 50% 60%)`, .5 s `cubic-bezier(.7,0,.2,1)` |
| 3 stripes | team `secondary` at 45%, 70 px tall, `rotate(-14deg)`, at top 20/44/68%; sweep `translateX(-130% → 130%)` .9 s `cubic-bezier(.6,0,.2,1)`, delays 0/.08/.16 s |
| Confetti | 16 pieces, 10×16, radius 2; colours [secondary, white, gold] (drop white when secondary is white); burst radially to 150–230 px with rotation, fade out; 1 s from .55 s |
| Crest | white 168 px circle, crest 124 px, big shadow; drops from `translateY(-460px) scale(1.5) rotate(-18deg)`, .75 s `cubic-bezier(.3,1.45,.5,1)`, delay .18 s |
| Name | condensed 52/800 uppercase; slams `scale(2.4) → 1` with fade, .5 s `cubic-bezier(.2,1.5,.4,1)`, delay .5 s |
| Shake | the crest + name group shakes .32 s at .62 s (±6 px decaying) |
| Sub | "Your pick. Change it any time before the lock." fades up at .8 s |

Auto-dismiss at 1.5 s; tap anywhere skips. With reduced motion: a still frame for .8 s. The haptic thud is unchanged. Sound: §5.

## 5. Sound (`src/sound.ts`, new)
- **Synthesised with Web Audio, no audio files.** Port `ctx()`, `noise()`, `roar()` and `whistle()` from
  `docs/ui-prototype/Main.dc.html` exactly:
  - **Crowd roar:** a cached 3 s stereo pink-noise buffer (Paul Kellet filter) → highpass 220 Hz → lowpass sweeping
    1400 → 3200 Hz (.35 s) → 1600 Hz → peaking 850 Hz Q 1.4 +9 dB → peaking 1350 Hz Q 2 +5 dB → "flutter" gain re-randomised
    22×/s between .72 and 1 → envelope: .0001 → peak (.55 × intensity) by .28 s, hold to .7 s, 45% at 1.4 s, silent at 2.6 s.
    Start at a random 0–.3 s offset into the buffer.
  - **Referee whistle:** two sines at 2850 + 3020 Hz, both frequency-modulated by a 38 Hz LFO (depth 90 Hz); gain .16 with a
    20 ms attack and 50 ms release.
- **Events:**
  | Event | Sound |
  | --- | --- |
  | Pick a team / replay the takeover | whistle .22 s, then roar ×1.0 at +140 ms |
  | Save the prediction | whistle .15 s + roar ×.45 |
  | Turn sound on | whistle .18 s |
  | Admin: confirm a payment | whistle .18 s |
  | Admin: settle (full time) | whistles .22 s @0, .22 s @.32, .9 s @.64 + roar ×.55 @.7 |
- **No UI blips.** Tab switches, round pills, steppers, accordions and other navigation are silent (Eddie: no "bloop").
- Create or resume the `AudioContext` inside the first user gesture (iOS rule, same as haptics). Leave the iPhone silent switch
  respected (don't force `navigator.audioSession` to playback).
- **Toggle:** the header button and the Me switch share one store, persisted in `localStorage['lms.sound']` (`'on'`/`'off'`,
  read and write inside try/catch). Default on.
- Reduced motion doesn't mute sound.

## 6. Table screen (`/table`, new)
- Title "Points table".
- Two pot tiles: gold gradient (`#f2b226 → #d9951a`, 160°) "LAST MAN · 80%" + €; surface tile "TOP OF TABLE · 20%" + €.
  Amounts come from the confirmed-payments pot.
- Table card: header row (# · PLAYER · EXACT · PTS, 11/700 muted), then one row per player: rank (condensed 20/800, gold for
  #1), avatar, name, status line ("STILL IN" in-text, or "OUT · IN THE STANDS" out-text, with the row at 60% opacity), exact
  count, points (condensed 22/800). Your own row gets a gold 8% fill.
- **Points = prediction points + jinx points** (side pot). When a player has jinx points, show "+N jinx" in 11 px under their
  points. Order: points desc, exact desc, name. (The forfeit uses prediction points only, so don't sort by it here.)
- "How points work" card: four tiles 5 Exact (gold) / 3 Within 5 / 2 Within 10 / 1 Right winner, plus "Everyone predicts, in or
  out. Fewest points does the forfeit."
- Empty state until Round 1 is settled: every player listed on 0, with the caption "Points land when Round 1 is settled (Sun 18
  Oct)".

## 7. Me screen (`/me`, new hub)
- Avatar 112 px with a 5 px kit-colour ring and a deep shadow; nickname condensed 34/800; "Full name · Admin" (if admin) in muted.
- Status pill: "Still standing" (green dot), "Out · Round N" (red), "Bought back" (gold).
- Three stat tiles: **Points** (gold), **#rank** "of N on the table", **Exact scores**.
- **Your road:** one tile per round (R1–R4, then knockouts as they're added). Picked: tile in the team's card colours, crest in a
  white circle, short name. Not yet: dashed empty circle and "—". Your own current pick shows before the lock (only you see
  it). Header right: "X of 24 teams used" (+ "N burned" if any).
- Settings list (navy-800 card, rows 15 px padding, chevrons):
  1. Edit photo, nickname and kit colour → `/me/edit`
  2. Crowd and whistle sounds: a 50×30 switch (green on, knob slides with a spring)
  3. Rules → `/rules`
  4. Admin · Round N (admins only, gold): badge with the number of claimed payments → `/admin/N`
  5. Sign out (out-text)

## 8. Backend: two read-only RPCs (migration + DB tests)
1. **`round_pick_status(r bigint) returns table(player_id uuid, has_pick boolean)`**: `security definer`, `stable`, granted
   to `authenticated`. One row per player in the round. **Never returns `team_id`.** DB tests: before the lock a normal player
   gets other players' `has_pick` but can still read only their own pick row; an admin gets the same and no teams; the `picks`
   RLS is unchanged.
2. **`points_table()`**: per player, sum of `prediction_points`, count of `exact_score`, sum of `jinx_points` across settled
   rounds, plus alive status. Settled results are public, so this needs no new privileges. Prefer `security invoker` if
   existing RLS allows it.
Nothing else changes server-side. Admin keeps using `confirm_payment`, `draw_featured_match`, the settle RPCs, etc.

## 9. Admin (`/admin/:n`): same logic, new presentation
A pushed page: back chevron, eyebrow "ADMIN" in gold, title "Round N", "Pot €X" chip.

- **Stage stepper:** four 32 px dots joined by a track that fills gold: **Open · Locked · Results · Settle**. The default step
  comes from the round's state (before the lock → Open; locked with results missing → Locked/Results; all in → Settle;
  settled → Settle in its done state). Tapping a dot shows that panel (screenIn). Done/current dots are gold; the current one
  is `scale(1.12)` with a 4 px gold halo.
- **Open**
  - *Payments:* "X of Y paid". Each claim is a gold-outlined row: avatar, "[name] says they've paid", "€10 entry · 2h ago · check
    Revolut", a 40 px ✕ reject button and a gold **Confirm** button. Confirm → whistle, then a green line "[name] confirmed. Paid
    mark is live for everyone."
  - *Picks:* a wrapping grid of 11 avatars (6 per row, name under each), each with a blue check badge if `has_pick` (from §8: no teams, admins included); "Teams are hidden
    from admins too until 20:00 Friday." Button **Copy WhatsApp nudge**: copies "LMS Round {n}: picks lock {Fri 8pm}. Still to
    pick: {names}." (Round 1 adds "No pick, no entry."), then shows green "Copied. Paste it in the group".
  - *Featured match:* drawn → both crests + "Drawn {time} · no re-draws". Not drawn → gold "Draw featured match" with
    hold-to-confirm (below).
  - *Lock:* clock row, "Lock: Fri 16 Oct, 20:00" + "{first fixture} kick-off".
  - The existing OpenPanel (clean slate / stuck players) becomes a banner card here.
- **Locked**
  - Pitch banner: "Picks locked at 20:00", "N picks in · {names with no pick/payment} not in".
  - *How the picks fell:* one bar per picked team (crest, name, bar in team colour, count), most-picked first. Caption: "Most
    picked decides buy-back burns. Ties broken by the stored random draw at settle."
  - Gold **Copy the reveal for WhatsApp** ("LMS Round {n} picks:\n{name}: {team}…").
- **Results**
  - "X of N in" + gold progress bar.
  - One card per match: time + a segmented control **FT | P-P | ABD** (maps to completed / postponed / abandoned; nothing chosen =
    scheduled); then home crest + name, two 44×44 numeric inputs (`inputmode="numeric"`, condensed 22/800, gold focus ring), away
    name + crest. P-P and ABD disable the inputs. A complete card gets a green edge.
  - Knockouts: once FT, a "Went through" toggle between the two teams (`winner_team_id`), required when level. Keep the existing
    validation ("The winner must be the team with the higher score") as an inline message.
  - **Autosave** each match on blur / status tap (debounced) with a small saving → ✓ indicator, replacing the per-row Save button.
  - Gold **Preview settle** → Settle step.
- **Settle**
  - The existing `runEngine` preview: two tiles (Through N, green / Out N, red), then a list: crest, name, detail ("Leinster · won
    26–19 away", "Munster · drew 20–20 (a draw is a loss)") and an outcome chip: THROUGH / OUT / SURVIVES (P-P) / CLEAN SLATE /
    BACK IN / ALREADY OUT. Show the winners banner when the engine returns winners. Caption about prediction points.
  - **Hold to settle Round N:** a 56 px button whose gold fill grows left → right over 1.1 s while held (linear); releasing
    early cancels. On completion: call settle, play the full-time whistles + roar, then a "Round N settled" card (pops in
    with a scale overshoot): "X through · Y out · Round N+1 is open". Then a gold **Copy results for WhatsApp** and a red-outline
    **Unsettle (fix a result)** (also hold-to-confirm).
- **Replace every `window.confirm`** in admin with hold-to-confirm, or with a bottom sheet for rejects.

## 10. Rules (`/rules`)
Copy lives in `src/data/rules.ts` so it's easy to edit; take it verbatim from the `S` array in `docs/ui-prototype/Rules.dc.html`
(written from the rules doc: https://claude.ai/code/artifact/a99ed3c3-a9ae-47f7-9847-4b3f50510d2a).

- Pitch hero: "Pick a winner. Every round. Lose or draw and you're gone." + "Last one standing takes 80% of the pot. Agreed by the
  group, Oct 2026."
- Four quick tiles: **1 team** per round, to win · **Once** each team, all season · **Fri 8pm** picks lock (pool rounds) ·
  **€10** in, before the Round 1 lock.
- 13 accordion sections, one open at a time (the first open by default): number badge (gold when open), title (condensed 20/800),
  one-line sub, chevron that rotates 180°, card edge turns gold 45% when open, body enters with `openIn` (.35 s). Sections: The
  pick and the lock · Each team once · Missed pick · Wins, draws and postponements · Winning · Money (with an 80/20 split bar and
  "On 11 entries: €88 and €22") · Buy-back · Resurrection · Points table · Jinx · The forfeit (warn **OPEN** badge until it's
  decided) · Lock times (table from the `rounds` table, "TBC" when null) · The fine print (the record, rule changes, privacy note
  per CLAUDE.md §6).
- **Points calculator** inside Points table: "You said" / "It ended" rows with home/away steppers (default 30–15 vs 27–17), then
  a big condensed result number and the reason ("Right winner, off by 5 in total. Within 5."). **Use the engine's prediction
  scoring function**, not a copy, so the page can't disagree with settle.
- A "Full rules doc ↗" outline button at the bottom.

## 11. Motion catalogue
All in `docs/ui-prototype/*.dc.html` `<helmet><style>`: `screenIn`, `rise` (+ stagger), `pop`, `pulse`, `tickA`/`tickB`,
`shim`, `wipe`, `sweep`, `drop`, `slam`, `shake`, `fadeUp`, `burst`, `grow`, `openIn`, `boom`; the spring press
`cubic-bezier(.3,1.5,.5,1)`; and a `prefers-reduced-motion` block that zeroes durations.

## 12. Done means
On a real iPhone, from the home-screen icon:
- The tab bar sits above the home indicator; every screen reaches every other screen in two taps or fewer, and Profile edit, Rules and
  Admin all have a working back button.
- Picking a team plays the takeover + whistle + roar. Tabs, round pills and steppers make no sound. The mute toggle persists.
- "Your pick" never says "locked in" before the lock; after it, the card has the gold ring. No element overlaps the fixture
  time/FEATURED row.
- The squad shows who has picked with no team leak (DB test). Table and Me show real points from `points_table()`.
- The admin flow (open → results → settle → unsettle → settle) runs on local Supabase with the new UI and no `window.confirm`.
- The rules calculator matches the engine's prediction scoring at the boundaries (off by exactly 5 and exactly 10).
- Reduced motion: nothing moves, everything still works.

## 13. Not in this packet
Team-specific sounds (§14). §15–17 need packet 5c's data (live scores, standings); build their UI with packet 5c, not in
this packet. Also not here: special symbols on plain cards (e.g. Munster), the field (avatars on a pitch), elimination red card,
share cards.

## 14. Team sounds: research notes (decision pending)
- Club anthems and walk-out songs (e.g. Munster's "The Fields of Athenry") are copyrighted recordings and songs: don't ship clips.
- Options, best first: (a) each of the lads records a 2-second chant for teams of their choice ("MUN-STER!"), stored as small
  files; (b) a CC BY 4.0 crowd-cheering library (Gregor Quendel, itch.io: 11 tracks incl. rhythmic chanting) as a richer roar
  base, credited on the rules page; (c) public-domain traditional tunes (e.g. "Molly Malone" for Leinster) played as a short
  synth phrase.

## 15. Pools screen (`/pools`): Champions Cup standings (data from packet 5c)
> Built manual (15 Oct): data from `src/data/standings.json`, updated Mondays; header says "Updated <date>" / "Updates every
> Monday", no live dot. See NEXT.md 5c.
Prototype board "Pools / standings" (`docs/ui-prototype/Pools.dc.html`; the same tab exists on every board).
- **Real 2026/27 pools** ([Planet Rugby](https://www.planetrugby.com/news/investec-champions-cup-and-epcr-challenge-cup-pools-confirmed-ahead-of-2026-27-season)):
  1 Leinster, Glasgow, Pau, Sale, Leicester, Clermont · 2 Toulouse, Lions, Saracens, La Rochelle, Exeter, Connacht ·
  3 Bordeaux-Bègles, Stormers, Racing 92, Munster, Bristol, Gloucester · 4 Northampton, Bath, Cardiff, Montpellier, Stade
  Français, Bulls. Store `teams.pool`. The data comes from the API; the pools are a check that the team mapping is right.
- **Format** (same source): top 3 of each pool go to the last 16, plus the 4 best of the rest across all pools by match
  points; level on points → more wins goes higher (not points difference). Try bonus only when a team scores 3+ tries more
  than the opposition. Show the API's ranking as it comes; the app never recalculates standings itself.
- Header: "Pools" + freshness ("Updates daily, live on match days" / "Updated 07:00 today" / red pulsing dot "Live · updated
  1 min ago" while a match is on). Before Round 1: a blue note "Season starts Fri 16 Oct. Tables fill in as results land."
- Segmented control Pool 1–4 (gold when selected).
- Table card: `# · TEAM · P · W · L · PD · PTS` (grid `26px 1fr 24px 24px 24px 36px 34px`). Left 3 px bar: green = top 3,
  Investec blue = currently in the best-4-of-the-rest. Crest in a 26 px white circle. Your current pick's row gets a gold 9%
  fill and a "YOUR PICK" tag (red "KNOCKED YOU OUT" if it did). Tap a row → it expands to Drawn / For / Against / Try BP /
  Losing BP tiles.
- Legend row, then **"Race for the last four places"**: every non-top-3 team ranked across pools (top 6 shown), with a
  dashed cut line after 4th.

## 16. Live match states (fed by packet 5c)
> Built manual (15 Oct): "LIVE" from the kick-off clock with no minute or score; scores, Through/Out and the fade once an
> admin enters the result. Live chip reads "On now". See NEXT.md 5c.
Prototype board "Matchday live".
- Fixture time row: red pill with a pulsing dot, "LIVE 58'", while on; grey "FULL TIME" after.
- The middle column between the two cards widens from 22 px to 46 px and shows the score stacked (home / – / away):
  red while live, chalk at full time. After full time the losing card fades (`.card.lost`: opacity .4, grayscale .7); a
  draw dims neither.
- "Your pick" card after the lock gets a status pill under the sub: amber "LIVE 58' · Level 13–13", green "Winning",
  red "Losing", each with a pulsing dot.
- **After the lock the squad shows everyone's team** (picks are public then): crest + team name under each name, and a
  chip: "Locked in" (gold, not started, any day; Eddie 17 Oct: no "Sun 15:15" chip), "Winning 61'" / "Level 58'" / "Losing"
  (live, pulsing dot), "Through" (green), "Out" (red). Through/Out are provisional until settle: footnote "Official once
  the round is settled".
- The Pools table refreshes on the standings schedule (packet 5c).

## 17. Knocked out (the out player's experience)
Prototype board "Knocked out".
- **The moment:** the first time a player opens the app after the settle that knocked them out (store
  `seen_elimination_round` per player so it plays once), a full-screen overlay: dark-red radial background; a red card
  (128×178, red gradient, white inner edge) flies in from the top, rotating to −8°, and slams (.6 s spring); "YOU'RE OUT"
  slams in (condensed 68/800, .5 s at .55 s); the group shakes at .62 s; then a pill with the greyscale team crest and the
  score ("Munster 20–20 Racing 92"); then "A draw is a loss. You're in the stands, but there are still ways back in. Tap to
  see them." Tap anywhere dismisses; under 1.5 s; reduced motion → still frame. Sound plays from a tap only, so the
  auto-play is silent and the hero's "Replay" button plays it: a long whistle (.9 s) + a **crowd groan** (the roar noise
  through a lowpass sliding 2000 → 380 Hz and a peaking filter sliding 700 → 320 Hz over 2.4 s, gain .5, starting at
  +.5 s). Port `groan()` from the prototype.
- **Round screen for an out player** (the next round). There are no fixtures to pick. In order:
  1. Red-tinted hero (stripes `#3a1020`/`#2e0c19`): a small red card, "YOU'RE OUT", "Round N · {score line} · {reason}",
     chips: "N still in", the pot, and a **Replay** button.
  2. **Get back in** card (gold edge), with "X DAYS LEFT" to the buy-back deadline:
     - *Buy back · €10* (pool stage only, one per person): "Pay before the Round N+1 lock … you also lose …", then the
       cost as chips: the burned team(s) from `reentryBurns()` (red, struck through, "burned") and already-used teams
       (grey). Gold "Buy back for €10" → the existing payment flow (kind `buyback`) → blue "Claim sent. Back in once Eddie or
       Conn confirms." Hidden after the Round 4 lock, or once used.
     - *Resurrection · Round 4* (blue info card): "Free. One away team you haven't used…". In Round 4 it becomes the
       actual away-team picker (packet 7).
  3. **Jinx a survivor**: a 4-column grid of survivor avatars (48 px). Tapping one gives it a gold ring and scale 1.1, with
     the line "Jinxing Conn. Locked in at the lock; everyone sees it at the reveal." This replaces the `<select>` (§3.6).
  4. **Still playing for the 20%** card: their points and table position + "Everyone predicts, in or out", then the
     normal prediction card once the featured match is drawn.
- That player's Round 1 screen: the "Your pick" card becomes "KNOCKED OUT" with a red ring and the reason.
- **Me:** status pill "Out · Round 1" (red); the Your road R1 tile turns red with "R1 · OUT". **Table:** unchanged (out
  players still score). **Squad:** their chip reads "Out".

## 18. Pick confirmation (Eddie, 15 Oct: add friction before a pick)
Prototype board "Pick confirmation" (`docs/ui-prototype/PickConfirm.dc.html`): the sheet, hold fill, early-release nudge
("Keep holding to confirm") and the takeover after confirm. Its `holdMs` tweak is the hold length; 600 ms until Eddie says otherwise.
Tapping a team card no longer picks straight away. It opens a confirm sheet; the pick (and the §4 takeover + sound) only
happens on confirm. Each team can be used once all season, so the sheet makes that cost visible.
- **Bottom sheet** (navy-800, radius 24 top corners, slides up .3 s spring, dimmed backdrop). Content:
  - Crest in a 72 px white circle on a strip of the team's `primary`; team name condensed 30/800; the fixture line
    "Munster v Racing 92 · Sat 20:00 · Home".
  - Warning line (warn colour): "You can only use Munster once all season." In knockout rounds where the team is the last
    unused one, add "It's your last unused team."
  - **Changing an existing pick:** title "Swap Leinster for Munster?" and the line "Leinster goes back in your pool."
  - Primary button (gold, 54 px): **hold to confirm**, 0.6 s fill sweep left → right, same component as the admin
    hold-to-confirm; label "Hold to back Munster" (never "lock in": nothing is locked before the lock, §3.2). A light haptic
    tick at the start of the hold, the takeover's thud on completion. Releasing early resets the fill.
  - Secondary button (outline): "Pick another" → closes the sheet, nothing saved, no sound.
  - Tap on the backdrop or swipe down = "Pick another".
- Tapping your **current** pick does not open the sheet; it replays the takeover as now (§3.2).
- After the lock the cards are disabled, so the sheet can't open. If the lock passes while the sheet is open, the confirm
  button disables and reads "Picks are locked"; the server refuses the write anyway (RLS).
- Reduced motion: no slide or sweep; the hold still takes 0.6 s (it's friction, not decoration).
- **Done means:** on iPhone, tap a team → sheet; "Pick another" saves nothing (check `picks` row unchanged); hold → saved +
  takeover; swap wording shows when a pick exists; a short tap on the hold button does nothing.

## 19. Round recap on open (Eddie, 15 Oct: tell each player what happened as they open the app)
Prototype board "Round recap on open" (`docs/ui-prototype/Recap.dc.html`) is the reference for every animation,
timing and sound in this section: **match it**, don't reinterpret it. Six scenarios (the "Demo · next scenario" button
cycles them): R1 survivor (through + exact), R1 out on a loss (out + points), R1 out on a draw (out + zero), R2 survivor
jinxed (through + zero + jinx shaken off), R2 in the stands (points + jinx landed / jinx missed). Signed off by Eddie
15 Oct. Port its keyframes (`rc-*`, `bigPop`, `stamp`, `crossIn`, gold rays, the clash set) and its sound functions.
The first time a player opens the app after a round is settled, they get a short **recap sequence**: full-screen cards
played like an Instagram story (Story controls below), "Skip" top-right. It plays once per player per round and replaces the standalone §17
overlay (the red-card "YOU'RE OUT" moment becomes the recap's first card for players who went out).

**Storage:** new column `players.seen_recap_round smallint` (own row only, same grants pattern as
`seen_elimination_round`; migrate the existing value across and drop the old column, or keep the old one unused, your
call, with a DB test either way). The recap shows when `latest settled round > seen_recap_round`. Write the new value
when the sequence ends or is skipped. **Unsettle** of round N sets `seen_recap_round = N - 1` for anyone at N, so a corrected
result gets its own recap. Data comes from the settled round only (results, `points_table()`, jinxes): never live/provisional.

**Story controls (Eddie, 15 Oct): the recap behaves like an Instagram story.** Segmented progress bars at the top, one
per card, the current one filling over the card's time (clash cards 4.3 s + 4.5 s, other cards 5.5 s), then it moves on by
itself; the last card stops and waits. Tap the **left third** = previous card (on the first card: restart it); tap the
**right two thirds** = next card (during the clash, the first tap skips the clash to the result card; on the last card it
finishes). **Press and hold = pause**: every animation and the bar freeze (`animation-play-state: paused` on the subtree),
the Web Audio context suspends so sounds freeze in place, the bars and buttons fade out; release resumes. Going to a card
replays its entrance and its sounds from the start, and cuts the previous card's sounds (all sound runs through one
gain bus that is faded and dropped on every navigation). Tap zones are real buttons ("Previous card" / "Next card").

**The clash (Eddie, 15 Oct: ceramic, slower, heavier)** plays before the outcome card (through or out), 4.3 s; a right tap
skips it. Both crests are **ceramic plates** (128 px: glazed off-white radial gradient, rim in the team `primary`
between two cream rings, glossy highlight top-left, crest painted in the middle; your team also gets a gold glow).
Background: the two teams' `primary` colours split diagonally under a dark vignette, "FULL TIME" eyebrow. Every beat has
its own sound, scheduled on the Web Audio clock at the same times as the CSS:
| Time | Picture | Sound |
| --- | --- | --- |
| 0–0.75 s | Plates fly in from opposite corners on a heavy ease-in, spinning and tumbling in 3D while the pair orbits the centre (−200° → 360° by 2.8 s) | Low whoosh rising |
| 0.75 s | Hit 1: rims meet and **hold for 0.1 s** (hit-stop), flash, porcelain chips, small shake; then a slow recoil | **Punch** + a low knock (`chunk`, 240 Hz) |
| 0.86–1.65 s | Drift apart, swing back in | Whoosh out, whoosh in |
| 1.65 s | Hit 2, same, harder | Bigger punch + low knock |
| 2.2–2.55 s | Wind-up: spin slows almost to a stop, they pull back further, the edges of the screen darken | Long rising whoosh |
| 2.8 s | The smash: they charge in and **freeze for 0.15 s**; crack lines appear on the loser (the same edges the shards break along); big flash, big shake | **Ground thud** + punch |
| 2.95 s | The loser **bursts** into 14 jagged shards that arc up, tumble in 3D and fall out of frame by 4.3 s; porcelain dust | Bass-heavy crunch (noise through a 700 → 220 Hz band-pass and hard drive) + low body + punch, then chunks: 9 low driven knocks (160–380 Hz) as pieces break off, 10 more (110–280 Hz) as they land 0.6–1.3 s later. **No glassy highs** (Eddie, 15 Oct: more bassy) |
| 2.95–3.6 s | Winner recoils, then rises to the centre at 1.85× and hangs | Whoosh up |
| 3.8 s | **Slam** down to 1.18×: gold flash, dust ring, gold sparks, biggest shake | Whoosh down, then the biggest **ground thud** |
| 3.95 s | Score fades in. 4.3 s: the through/out card. | The card's own sounds (below) |
- **Loss:** the same, with your plate the one that breaks and theirs slamming in. **Draw:** both plates crack and shatter
  (two layered shatters), no winner; "DRAW" slams in at 3.8 s with the boom. Reduced motion: no clash, straight to the card.
- **Hit sounds (Eddie, 15 Oct: punches and ground thuds, loud):** `punch()` = a driven sine dropping 230 → 46 Hz through
  a soft-clip `WaveShaper` (k 10) + a 170 → 95 Hz triangle knock + a 1 kHz band-passed noise slap (75 ms) + a 2.6 kHz
  noise snap (22 ms). `groundThud()` = a driven sine 120 → 34 Hz (k 14) + a 150 → 70 Hz triangle + low-passed noise body
  (420 Hz, .35 s) + rumble tail (180 Hz, .9 s) + a punch on top. The soft-clip and the 100–200 Hz layers are what make
  them audible on iPhone speakers, which barely play below ~150 Hz. Everything runs through one master
  `DynamicsCompressor` (threshold −22 dB, ratio 10, attack 1 ms, release 160 ms) with 2.6× make-up gain. Every card
  "thwack" below is a punch.
- **Card sounds, paired with each card's entrance:** through = thwack on the title slam (.45 s) + whistle, roar from .6 s;
  out = long whistle, thwack as the red card lands (.62 s), crowd groan; exact = thwack + ground thud and chime on the +5
  (.6 s) + roar; points = thwack + chime; zero = soft thwack + a descending "womp"; jinx landed = pop as the avatar
  appears, thwack as the red card stamps (.5 s), rising blip + small roar; jinx missed = pop, soft thwack, womp; jinxed you
  = pop, rising blip + a small punch as the shield lands, small roar.
- Port from the prototype: `clashData()` (shard + crack geometry), `fx()` (compressor), `curve()` (soft clip),
  `bus()`/`cutSound()`, `noiseHit()`, `punch()`, `groundThud()`, `chunk()`, `shatter()`, `whoosh()`, `thwack()`,
  `blip()`, `womp()`, `chime()`, `clashSound()`, `cardSound()`, plus `whistle()`/`roar()`/`groan()` with their new
  `when` argument (scheduled on the audio clock, not `setTimeout`), the story clock
  (`elapsed()`/`schedule()`/`pause()`/`resume()`) and the `orbit`/`spin3d`/`armLose`/`armWin`/`shard`/`sh-*` keyframes.

**Cards, in this order** (each only if it applies; skip the sequence entirely if none apply):
1. **Outcome** (everyone who had a pick in the round):
   - *Through:* after the clash, green radial background, the team crest pops in (`pop`), "YOU'RE THROUGH" slams in
     (condensed 68/800), score pill "Munster 27–13 Racing 92", then "N still in. Round N+1 picks lock {date, time}."
     Sounds: see "Card sounds". In the final round the winner gets "LAST MAN STANDING" + gold confetti instead.
   - *Out:* after the clash, the §17 red card moment (copy, groan, reasons: loss, draw, postponed-as-loss, etc.).
   - *Back in via buy-back/resurrection* (packet 7): "YOU'RE BACK" in gold. Not needed for Round 1.
2. **Featured-match prediction** (anyone who saved a prediction for a featured match that wasn't postponed):
   - *Exact:* gold burst + "EXACT SCORE" (condensed 60/800) + "+5", your prediction vs the real score side by side, crests.
   - *Points but not exact:* "+3 / +2 / +1" big with the band in words ("Within 5 points"), your prediction vs the result.
   - *Zero:* muted, "No points this time", prediction vs result. Keep it light, not a fail screen.
   - Footer on all three: "You're {nth} in the race for the 20% · {total} pts".
   - No prediction saved: one muted line on the outcome card ("No prediction this round") instead of a card.
3. **Jinx** (Round 2 on, since nobody is out before Round 1 settles):
   - *Your jinx landed* (you're out, you jinxed someone who then went out): their avatar with a red-card stamp, "JINX
     LANDED", "+1 point". *Missed:* "{name} survived your jinx", no points.
   - *You were jinxed* (survivors): "{name} jinxed you." If you're through: "Jinx shaken off." If you went out, add the line
     to the out card instead of a separate card. Several jinxers → list them.
- Motion and sound: each card's own entrance is under 1.5 s (the clash is the one long moment, 4.3 s, skippable);
  reduced motion = still frames and no clash. iOS only plays audio after a tap, so the first card's entrance is silent;
  the speaker button top-left replays the current card (and its clash) with sound, and every tap after that has sound.
- Progress bars at the top show the number of cards (Story controls). The last card's gold button reads "Into Round N+1"
  (out players: "See ways back in") → Round screen.
- **Done means:** on local Supabase, settle a test round with one survivor who predicted exactly, one out player whose
  jinx landed, and one player with no prediction → each sees the right cards once, in order; reopening shows nothing;
  unsettle → resettle shows the recap again; DB test: `seen_recap_round` own row only. On a real iPhone (sound on),
  side by side with the prototype: the clash, shatter, slam and every sound land on the same beats; left tap goes back
  and replays, right tap skips the clash then advances, hold pauses picture and sound; a draw breaks both plates.

## 20. Player profiles (Eddie, 15 Oct: "who is that nickname?")
Prototype: `docs/ui-prototype/Profile.dc.html` (interactive: tap rows, the sheet slides up) and `ProfileOut.dc.html`.
- **Entry points:** every row of the Squad (§3.5) and every row of the Table (§6) opens that player's profile sheet. Rows
  become buttons with a 16 px chevron (`#6f7ba0`) on the right. Your own row goes to `/me` instead. Out players drop off
  the squad, so the Table is how you reach them.
- **Squad row subtitle:** the real name goes in front of the paid line when the player has a nickname that differs from
  their name: "Harvey · Paid", "Cboh · Payment waiting for a confirm". No nickname: unchanged ("Paid").
- **Sheet:** bottom sheet over a `rgba(3,6,20,.62)` backdrop, ~86% of the viewport tall, `max-w-[480px]`, top radius 28,
  navy-800, drag handle, a 44 px close X top right. Closes on the X, a backdrop tap, a swipe down > 80 px or Escape.
  Scrolls inside if the phone is short. Top to bottom:
  1. **Identity:** Avatar 76 px (4 px kit ring + deep shadow), nickname condensed 32/800, real name 14 px chalk-2
     ("No nickname" if none) + " · Admin" for admins. Pills: status — "Still standing" (green dot), "Out · Round N" (red,
     mini red card), "Bought back" (gold), "Not in this year" (grey, §22) — and payment — "Entry paid" (check),
     "Payment pending" / "Not paid" (warn).
  2. **Three stat tiles** (navy-900): **Points** (gold), **#rank** "of N on the table" (shared ranks as `rankOf`),
     **Exact scores**. From `points_table()`.
  3. **Their road** (header right: "X of 24 teams used"): 4-column grid of 106 px tiles, R1–R4 then knockouts as they're
     added. Picked: the team's card colours, crest in a white circle, short name, result line from the match ("Beat
     Exeter 38–12", "Won at Bristol 25–23", "Lost 18–24 to Gloucester", "Drew 20–20", "Postponed · team back"). The round
     they went out in: `#3a1020` tile, 2 px `#e5484d` inset ring, greyscale crest, "R2 · OUT". Locked but not settled:
     the team + "Locked in". **Current round before its lock: dashed tile with a lock icon, "Hidden till Fri 20:00"**.
     Rounds after their exit: dashed "In the stands". Future: dashed "—".
  4. **Featured-match predictions:** one row per settled round: "R1", the fixture, "Said 21–26 · finished 20–27", points
     on the right ("5 ★" gold, 0 muted). Header right "Jinx points: N" when they have any.
- **Privacy:** read-only, from data already readable: `players`, `points_table()`, `round_results`, and picks/predictions
  for **locked** rounds only (RLS already hides the rest). No new RPC, no RLS change. The sheet must never show the current
  round's pick, prediction or jinx before the lock; a test renders another player's profile before a lock and checks it.
- **Motion (all under 1.5 s, skippable by closing):** backdrop fades in .25 s; the sheet **slides up from the bottom** .38 s
  `cubic-bezier(.3,1.25,.5,1)` (the §18 `sheetUp`); the content rises in a stagger (`rise` .45 s, steps of 60 ms from
  .10 s); the avatar pops (.45 s, .12 s delay); road tiles pop one after another (from .30 s, +70 ms each); **Points
  count up** from 0 over .6 s (ease-out cubic) starting at .25 s. Close: the sheet slides down .22 s ease-in while the
  backdrop fades, then unmounts. Reduced motion: appears and disappears instantly, no count-up. No sound, no haptic (it's
  browsing, not an action).

## 21. Removing your pick: hold to remove (Eddie, 15 Oct)
Replaces §18's one-tap "Remove pick". Prototype: `docs/ui-prototype/RemoveHold.dc.html`.
- Same mechanics as "Hold to back": `HOLD_MS` 600, pointer + Space/Enter handlers, `touch-none`, no context menu, a light
  tick on press and the thud when the hold completes, refused once locked.
- **Red:** track `rgba(229,72,77,.2)` with a 1 px `rgba(255,138,138,.55)` inset edge; the fill `#e5484d` grows left to
  right, linear, over 600 ms; white label "Hold to remove Munster" → "Keep holding…", same hand icon. "Keep Munster"
  underneath as before.
- **The filling bar is the only animation in the remove flow** (Eddie): when the sheet opens from your pick card it
  appears without the `sheet` spring and without the `sheet-crest` pop; early release shows "Keep holding to remove" as
  plain text (no `nudge` shake); on completion the sheet closes at once, `clear_pick` runs and the card shows "No pick
  yet". No takeover, no sound.

## 22. Not in this year (players who never got in)
Prototype: `docs/ui-prototype/NotIn.dc.html`. Today (A2 on the design canvas) they get a normal countdown hero, a "Pay €10"
card, fixtures that silently don't respond and a jinx picker.
- **Who:** Round 1 is settled and their Round 1 `round_results.outcome` is `already_out` (no confirmed entry, or no Round 1
  pick). Not the same as `out` (§17).
- **Round screen, later rounds:** grey hero (stripes `#1a2140`/`#161c38`, hairline), a ticket-with-a-slash icon, "NOT IN
  THIS YEAR" condensed 38/800, "You didn't have a confirmed €10 entry and a pick at the Round 1 lock. You can still follow
  every round.", chips: pot, N still in, lock time. Under it, muted: "Think that's wrong? Message Eddie or Conn." Then
  "Round N fixtures · VIEW ONLY" (cards as plain tiles, not buttons), the squad (rows open §20), the reveal after the lock.
  **Hidden:** the pay card, pick card, jinx picker, Get back in, Still playing.
- **Side game: decided 15 Oct (Eddie).** We will always get everybody in, so this path is a fallback only. If it still
  happens: no prediction card and no jinx picker, and nothing server-side changes.
- **Between the Round 1 lock and the settle:** a player with a pick and only a *claimed* entry sees, in place of the pay
  card: "Payment pending. Eddie or Conn must confirm it before Sunday's settle, or your pick doesn't count." After the
  Round 1 settle the pay card is gone for everyone.
- **Round 1 page after the settle**, non-entrant with a pick: the pick card reads "NOT COUNTED · no confirmed entry"
  (grey ring) instead of a result chip.
- **Me:** status pill "Not in this year" (grey). **Table:** listed at the bottom at 50% opacity, "NOT IN THIS YEAR".
- **Admin, Round 1 settle preview:** a warn panel above Confirm: "Not counted: Harvey (claim not confirmed), Rory (no pick)"
  with a Confirm-payment button per unconfirmed claim, so nobody is dropped by accident.

## 23. Back in after a buy-back
Prototype: `docs/ui-prototype/BoughtBack.dc.html`. Today (B2 on the design canvas) a confirmed buy-back still shows "You're
out", can't pick, isn't auto-picked, and the settle then fails. The server half is NEXT.md packet 7.
- **When:** a `buyback` claim ("I've paid", confirmed or not: Eddie, 18 Oct) before this round's lock, unused, pool stage (Rounds 2–4).
- **Hero:** stripes with a gold glow (`radial rgba(242,178,38,.28)`, hairline `rgba(242,178,38,.35)`); a "BOUGHT BACK" pill
  (ticket icon, gold on gold/18); "YOU'RE BACK IN" condensed 44/800; the cost in one line from `reentryBurns()` + used
  teams ("Munster burned · Clermont used · pick like everyone else"); then "Picks lock in" + the countdown (62 px boxes,
  32 px digits) and the pot / still in / picked chips.
- **Below:** the normal pick flow: "No pick yet" card, fixtures with burned teams greyed, name struck through, "burned",
  and used ones "used R1"; the prediction. **Hidden:** jinx picker, resurrection card, Get back in. The red card doesn't
  replay.
- **Squad:** they're listed, subtitle in gold "Conor · Bought back". **Me:** "Bought back" pill (today it's keyed on
  `alive`, which is false until the settle: key it on this state too).
- Claimed after this round's lock: B1 ("Claim sent. You pick again next round.").
