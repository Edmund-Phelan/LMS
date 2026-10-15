# UI redesign: build spec (15 Oct 2026)

Eddie signed this design off on 15 Oct. It replaces the "basic HTML" look with a dark pitch-green app shell, a bottom tab bar,
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
(points RPC) → Rules → Admin.

---

## 1. Design tokens (`src/index.css`, Tailwind v4 `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `pitch-950` | `#050f0a` | behind the app (desktop margins) |
| `pitch-900` | `#0a1f15` | app background, `theme-color` meta, manifest `background_color` |
| `pitch-800` | `#11301f` | surfaces / cards |
| `pitch-700` | `#173d28` | raised: step dots, inactive fills |
| `pitch-600` | `#1c4630` | avatar fill (no photo) |
| `stripe-a` / `stripe-b` | `#0f5132` / `#0c4529` | hero pitch stripes: `repeating-linear-gradient(90deg, a 0 12.5%, b 12.5% 25%)` + `radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,.18), transparent 60%)` on top |
| `chalk` | `#f4f1e8` | primary text |
| `chalk-2` | `#dfe6e1` / `#cfd8d2` | body and secondary text |
| `muted` | `#a9b8ae` | labels, captions |
| `gold` | `#f2b226` (hover `#ffd166`) | the accent: current tab, picks, CTAs |
| `in` / `in-text` | `#3ccf7a` / `#6fe3a1` | still in, picked, saved |
| `out-text` | `#ff8a8a` | out, reject, sign out |
| `warn` | `#ffb35c` | unpaid, OPEN rule |
| hairline | `rgba(255,255,255,.06)` | card inset `box-shadow: inset 0 0 0 1px`, row dividers |
| border | `rgba(255,255,255,.12–.16)` | outline buttons |

- **Type:** display **Barlow Condensed** 600/700/800 (titles, numbers, team names); body **Barlow** 400–700. Add a Google
  Fonts `<link>` in `index.html` (or `@fontsource/barlow` + `@fontsource/barlow-condensed`). Numbers use `tabular-nums`.
- **Radii:** big cards 20–24, fixture cards 18, buttons 12–16, chips 999.
- Update `index.html` `theme-color` and the PWA manifest colours to `#0a1f15`.

## 2. App shell and navigation

New `src/Shell.tsx` wraps every signed-in route except first-login profile setup.

- **Top bar** (64 px + `env(safe-area-inset-top)`): a 36 px gold tile reading "BBB" (Barlow Condensed 800, pitch-900 text);
  eyebrow "LAST MAN STANDING" (12 px, letter-spacing .18em, muted); screen title (20 px/800); on the right a 44 px round
  **sound toggle** (speaker icon gold on a `rgba(242,178,38,.12)` fill when on; speaker-with-x in muted when off).
- **Scroll area:** flex 1, `overflow-y: auto`, padding 8 16 24, scrollbar hidden. Scroll to the top on tab change.
- **Bottom tab bar** (84 px including `env(safe-area-inset-bottom)`, `rgba(7,23,15,.92)` + `backdrop-filter: blur(16px)`, top
  hairline): three tabs: **Round** (rugby ball icon) `/round/:n`, **Table** (trophy) `/table`, **Me** (person) `/me`. Active:
  gold icon and label, plus a 34×3 gold indicator at the top edge that grows in (`scaleX 0→1`, .35 s spring). Inactive: muted.
  Use `NavLink`; keep `HashRouter`.
- **Pushed pages** (no tab bar, back chevron top-left, 44 px): `/me/edit` (the existing Profile form, restyled dark), `/rules`,
  `/admin/:n`. Back = `navigate(-1)`, falling back to `/me`. This fixes "Profile has no way back".
- **Round switcher** (top of the Round tab, replaces the `← Round n →` links): a horizontal scroll row of pills, 58×52, radius
  14: label (R1 R2 R3 R4 R16 QF SF Final, condensed 17/800) over the weekend date (10 px). Current: gold fill, pitch-900 text.
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
- Card (pitch-800, radius 24): title "Predict the featured match" + gold "EXACT = 5 PTS".
- Two columns: crest in a 56 px white circle, team name, then **− [n] +** steppers: 36×44 buttons on a `rgba(255,255,255,.08)`
  fill, number condensed 40/800 tabular, clamp 0–99. This replaces the two text inputs.
- Caption: "Right winner 1 · within 10 = 2 · within 5 = 3 · exact 5".
- Gold "Save prediction" button (50 px). On save it turns green with a check that pops in, label "Prediction saved". Any change
  after that returns it to the unsaved state. Saving plays a short whistle + small roar (§5). The steppers are silent.

### 3.5 The squad (bottom of the screen)
- Title "The squad", right "X of Y picked"; a 6 px green progress bar (`width` transition .6 s).
- One row per player in the round (11 in Round 1): Avatar (kit ring), name, a paid line ("Paid" muted, or "Entry not paid yet" in warn),
  and a chip on the right:
  - before the lock: picked → green chip with a check, "Picked"; not picked → dashed outline "Thinking…".
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
- Settings list (pitch-800 card, rows 15 px padding, chevrons):
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
  - *Picks:* a wrapping grid of 11 avatars (6 per row, name under each), each with a green check badge if `has_pick` (from §8: no teams, admins included); "Teams are hidden
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
Team-specific sounds (§14), special symbols on plain cards (e.g. Munster), the field (avatars on a pitch), elimination red card,
share cards.

## 14. Team sounds: research notes (decision pending)
- Club anthems and walk-out songs (e.g. Munster's "The Fields of Athenry") are copyrighted recordings and songs: don't ship clips.
- Options, best first: (a) each of the lads records a 2-second chant for teams of their choice ("MUN-STER!"), stored as small
  files; (b) a CC BY 4.0 crowd-cheering library (Gregor Quendel, itch.io: 11 tracks incl. rhythmic chanting) as a richer roar
  base, credited on the rules page; (c) public-domain traditional tunes (e.g. "Molly Malone" for Leinster) played as a short
  synth phrase.
