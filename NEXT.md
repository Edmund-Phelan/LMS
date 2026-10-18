# NEXT.md — work packets (updated 15 Oct, afternoon)

Read CLAUDE.md first; it is the spec. **Change from the spec: Round 1 runs on the app, not the Google Form.**
Round 1 picks lock **Fri 16 Oct 2026, 8pm Irish time** (first kick-off). That is the deadline for packets 1–4.
Packets are in priority order. Do one per session. "Done means" is the acceptance test.

Ground rules: the lock, pick privacy and money correctness come first: packets 1–2 before any polish.
Every schema change is a migration with a DB test. Never weaken RLS to make a screen work.

---

## Before Friday — Eddie (not Claude Code)
- Login emails: done (Gmail SMTP, 8-digit code), 15 Oct.
- Players (11, from Eddie 15 Oct): **Eddie** (admin, the owner), **Conn** (admin), Cboh, Kevin, Conor, Ed, Harvey, Rory, Eoin,
  Mark, Michael. Eddie and Ed are two different people. **Done 15 Oct:** all 11 auth users + player rows exist (Eddie's row kept
  as is; the other 10 have `name` set, `nickname` null, Conn admin). The 10 have placeholder emails `<name>@pending.invalid` and
  can't sign in until swapped. **Still needed from Eddie: each player's real email.** Swap one (via the Supabase MCP, never in a
  committed file — the repo is public):
  ```sql
  update auth.users set email = 'real@x.com' where email = 'conn@pending.invalid';
  update auth.identities set identity_data = identity_data || jsonb_build_object('email','real@x.com')
   where provider = 'email' and identity_data->>'email' = 'conn@pending.invalid';
  ```
  Then test a code sign-in with that player.
  **15 Oct: 8 of 10 emails in.** The swap SQL is in `player-emails.sql.local` at the repo root (gitignored, never commit it or
  paste the emails into a tracked file). **Done 15 Oct: all 10 swapped, Eoin and Cboh included; nobody is `@pending.invalid`.**
  All 8 are confirmed, Harvey's included.
- **Decided 15 Oct: the side game starts in Round 1.** Every player predicts the score of the Round 1 featured match
  (Gloucester v Bordeaux-Bègles, already drawn) before the lock, and Round 1 settles prediction points like any other round.
  The engine already scores any round with a featured match; CLAUDE.md rule 13 and the rules doc are updated to say Round 1.
  Packet 4's "only if Eddie starts the side game in Round 1" condition is therefore met; the raffle is done.

- **16 Oct, after the lock (one-off, admins' decision):** Cboh missed the Round 1 pick and stays in with a random team
  (migration `20261016212500_round1_cboh_auto_pick.sql`, applied): Stade Français, `is_auto`, drawn by Postgres
  `random()` over the 22 teams not yet kicked off, logged in `pick_draws`. No prediction = 0 points. The general rule
  (no Round 1 auto-pick) is unchanged. Harvey missed it too and got the same one-off
  (`20261016213500_round1_harvey_auto_pick.sql`): La Rochelle, from the same 22 teams. All 11 now have a Round 1 pick.
  Round 2 auto-pick checked. Since 16 Oct (`20261016220000_auto_pick_at_lock_time.sql`) each round has its own job,
  `auto-pick-round-<id>`, at the minute after its lock, rescheduled by a trigger whenever `lock_at` is set or edited;
  no fallback job (a lock edited into the past needs a manual `select auto_pick_locked_rounds()`). It covers every round > 1 for players
  `alive()` after the Round 1 settle (DB test in `lock.test.ts`). Bought-back players are only covered once packet 7's
  migration is applied.

## 1. Round 1 on the app
- Migration: Round 1's 12 fixtures, same format as `20261014230557_fixtures_r2_r4.sql`. Irish time (UTC+1 until 25 Oct).
  Source: rugbyworld.com/rugby-fixtures/champions-cup-fixtures, checked 15 Oct. Home team first.

  | Kick-off (Irish time) | Home | Away |
  | --- | --- | --- |
  | Fri 16 Oct 20:00 | gloucester-rugby | union-bordeaux-begles |
  | Sat 17 Oct 13:00 | sale-sharks | glasgow-warriors |
  | Sat 17 Oct 13:00 | vodacom-bulls | stade-francais-paris |
  | Sat 17 Oct 15:15 | asm-clermont-auvergne | leinster |
  | Sat 17 Oct 15:15 | dhl-stormers | bristol-bears |
  | Sat 17 Oct 17:30 | connacht | saracens |
  | Sat 17 Oct 17:30 | stade-rochelais | emirates-lions |
  | Sat 17 Oct 20:00 | bath-rugby | montpellier-herault-rugby |
  | Sat 17 Oct 20:00 | munster-rugby | racing-92 |
  | Sun 18 Oct 13:00 | section-paloise | leicester-tigers |
  | Sun 18 Oct 15:15 | stade-toulousain | exeter-chiefs |
  | Sun 18 Oct 17:30 | northampton-saints | cardiff-rugby |

- Round 1 rules (rules doc): **no pick = no entry**, so the lock job must NOT auto-pick in Round 1; and **no payment = the pick
  doesn't count**, so at the Round 1 settle anyone without a confirmed entry payment is not in the comp. Engine + DB tests for both.
- Check the round page with Round 1 as the first round (no "waiting for the previous round" state).
- **Done means:** Round 1 shows its 12 fixtures with the right times; picking works; DB tests prove no auto-pick in Round 1 and that
  unpaid players are excluded at settle.

## 2. Payments (entry must be paid before the Round 1 lock)
- Player: "Pay €10" opens `https://revolut.me/eddie1apt` (one config constant), then "I've paid" creates a claimed payment.
- Admin: list of claims → confirm. Paid badge next to each name for everyone; pot total = confirmed payments.
- Buy-back requests use the same flow later (packet 7); build the table/kind now.
- **Done means:** claim → confirm updates the badge and pot for every viewer; a non-admin can't confirm (DB test).

## 3. The app itself: BBB Last Man Standing (as much as fits before Friday)
In this order; each step shippable on its own:
1. Branding: name **BBB Last Man Standing** in title, header, PWA manifest + icons, link-preview image for WhatsApp.
2. `<Jersey kit={…} />` SVG component, ported from `scripts/kit-preview.py`; migration replacing `teams.pattern` with `kit jsonb`
   seeded from `src/data/teams.json`. Must match `docs/kit-check.html`.
3. Pick screen: fixture cards with crests + jerseys; **team takeover** on pick (team colours flood the screen, crest drops in,
   haptic thud via the hidden-switch trick). Under 1.5 s, skippable.
4. Home screen: countdown to the lock, pot total, paid badges, who's in.
5. Reveal at the lock: tap-to-flip cards, one per player.
6. First login: photo (crop to circle), nickname, kit colour.
7. iPhone "Add to Home Screen" 3-step guide on first visit in Safari.
8. ~~Pick confirmation sheet~~ **DONE 15 Oct (PR, `pick-confirm`); merged before the real-iPhone check: confirm the thud fires at the end of the hold (it runs from a 0.6 s timer, not the tap itself; if not, move it to release).** spec `docs/UI-REDESIGN.md` §18. Tapping a team opens a
   sheet; "Pick another" or hold-to-confirm "Hold to back Munster" (0.6 s). Takeover only after the confirm. Prototype:
   `docs/ui-prototype/PickConfirm.dc.html` (signed off). Do this before 1–7's polish if time is short: it changes how every
   pick is made on Friday.
9. **Hold to remove your pick (Eddie, 15 Oct afternoon).** Spec `docs/UI-REDESIGN.md` §21, prototype
   `docs/ui-prototype/RemoveHold.dc.html`. Same 0.6 s hold as backing a team, in red; the filling bar is the only
   animation (no sheet spring, no crest pop, no nudge shake, no takeover). **Built 15 Oct** (`src/Pick.tsx`). Still to
   do: on a real iPhone, tap your pick → hold → the red bar fills → the card shows "No pick yet"; letting go early
   leaves the pick in place; refused after the lock.
- **Done means:** on a real iPhone from the home-screen icon: log in, set up profile, pick (takeover + haptic), change pick,
  see the countdown and pot.

## 4. Featured-match raffle (only if Eddie starts the side game in Round 1; otherwise before Round 2)
- RPC `draw_featured_match(round_id)`: `security definer`, admin-only, server-side `order by random()` over the round's fixtures,
  stores `featured_match_id` + `featured_drawn_at`. One-shot: refused if already drawn or the round is locked.
  One-fixture rounds (the final) draw automatically. Postponed featured match = 0 points, no re-draw.
- Reveal: sealed raffle card → tap → crests shuffle with haptic ticks → land on the drawn match, two crests pop in with a thud.
  Theatre over the stored draw; the client never picks. Under 1.5 s, skippable, reduced-motion → straight to the result.
- **Done means:** DB tests: admin-only, one-shot, before the lock only, always a fixture of that round.

## 5. Admin page, signed in (by Sun 18 Oct evening, to settle Round 1)
- Run open → results → settle → unsettle → settle on a throwaway round (local Supabase via `supabase start`, not live).
  Fix whatever breaks. Then enter Round 1 results and settle it for real on Sunday night.
- **Done means:** Round 1 settles; survivors, used teams and the stored tiebreak are right; Round 2 opens.

## 5g. Not in this year (by the Round 1 settle, Sun 18 Oct night)
**Built 15 Oct** (admin `NotCounted` panel + `notCounted()` in `adminData.ts`; Round/Me/Table states). PGlite test in
`admin-flow.test.ts`. Still to do: eyeball the admin panel at Sunday's preview.
Spec `docs/UI-REDESIGN.md` §22, prototype `docs/ui-prototype/NotIn.dc.html`. The first non-entrants appear the moment Round 1
settles, and today they get a normal countdown, a pay card, dead fixtures and a jinx picker (their Round 1 outcome is
`already_out`, which the Round screen doesn't handle; `loadKnockout` only looks for `out`).
- **Admin first (needed for Sunday):** Round 1 settle preview lists who won't count and why (claim not confirmed / no pick),
  with a Confirm button per unconfirmed claim.
- Round screen "Not in this year" state; pay card copy between the Round 1 lock and settle; "NOT COUNTED" on their Round 1
  pick card; Me pill; Table at the bottom, greyed.
- **Decided 15 Oct (Eddie): we will always get everybody in.** Chase picks and confirm every entry before Sunday's
  settle so nobody lands on this screen. The Not-in UI is a fallback if a pick or payment is still missing; hide
  prediction and jinx there (no engine change — today a jinx from a non-entrant would still score). The admin preview
  is how you catch that before you confirm the settle.
- **Done means:** PGlite test: a Round 1 with one unconfirmed claim and one no-pick → the preview names both; after the
  settle both see the Not-in screen in Round 2 with no pay card, pick, jinx or prediction.

---

## After Round 1 (before the Round 2 lock, Fri 11 Dec 8pm)
5b. ~~UI redesign~~ **DONE 15 Oct** (merged as PR #1, `ui-redesign`). Spec §1–12 of `docs/UI-REDESIGN.md` is built.
   Spec §15–17 were added after the merge and are packets 5c (Pools + live states) and 5d (knocked-out experience).
5c. ~~Live results + standings feed~~ **DONE 15 Oct, manual version** (branch `results-feed`). API-Sports' free plan
   can't see season 2026 ("Free plans do not have access to this season, try from 2022 to 2024"; Champions Cup = league
   54), so Eddie chose no feed for now:
   - **Standings:** `src/data/standings.json`, updated every Monday with the project skill `/update-standings`
     (`scripts/standings.ts` pulls ESPN's public standings JSON, no key; cross-check vs epcrugby.com; test; push to `main`).
     The `standings.json` test checks every team is in its §15 pool and the numbers add up.
   - **Live states (§16):** from kick-off time (`src/live.ts`: live = kick-off to +100 min, then "Result due") plus the
     scores admins enter. No live score or minute. The Round screen re-reads every minute while a match is on.
   - **Admin:** "Results in: X/N"; Preview settle only once every match is in. No auto/manual flag (all manual).
   - **Not built (needs a feed):** `result_source`, `live_*` columns, `pool_standings`, `api_calls`, Edge Functions, cron.
     If an API turns up later: ESPN's scoreboard (`site.api.espn.com/apis/site/v2/sports/rugby/271937/scoreboard?dates=
     YYYYMMDD`) had the full 2026/27 fixtures with team ids (15 Oct), or a paid API-Sports plan. The old plan is in git
     history (commit 2f63ba3). **Superseded 18 Oct by 5h (Highlightly).**

5h. **Live feed v2: Highlightly (Eddie, 18 Oct). Plan: `docs/LIVE-FEED.md` (read it whole).** Replaces 5c's "not built"
   part with the Highlightly Rugby API (free: 100 calls/day, live scores, Champions Cup, highlights, standings, lineups).
   Live scores in the app, official results land by themselves (admins only tap Settle), a match centre (who backed who,
   upset meter, team sheets, highlights embedded from YouTube, stats only if the API has them), Pools on live standings.
   **Updated 18 Oct:** plus a pick-week Scouting sheet (form, head-to-head, season record, win chance, team sheets as they're
   named), filled by weekday jobs from the same 100 calls/day. API reference: `docs/highlightly-openapi.json`. Mock-up:
   `docs/ui-prototype/live-feed/` (Main, MatchLive, MatchFinal, Scouting, Budget).
   **Also in 5h (18 Oct):** the round wrap from the 15 Oct canvas: a `/wrap/:n` page with every result + highlights, an
   admin Highlights panel (Hide / Paste a link, no publish gate) and "Copy round wrap for WhatsApp" in the Monday-post
   format. Prototypes `docs/ui-prototype/round-wrap/` (restyle to the app tokens). `Live.dc.html`'s "LIVE 58'" clock is
   superseded: no match minute in the API. Spec: `docs/LIVE-FEED.md` §6.
   **Order vs packet 7:** packet 7 (buy-back re-entry) is money-correctness and also due by the Round 2 lock: finish it first.
   **Step 1 is a gate** (`scripts/highlightly-check.ts`): it must show Gloucester 36–36 Bordeaux `Finished` and report what
   `/matches/{id}` really contains; stop and report to Eddie before step 2. Needs `HIGHLIGHTLY_KEY` in `.env.local` (Eddie).
   **Step 1 done 18 Oct:** gate failed on Sale v Glasgow (list 27–45, real 27–47); Eddie chose option 1 + standings
   (LIVE-FEED.md §0, §4). Ids mapped (`20261018140000_highlightly_ids.sql`, applied). **Steps 2–3 done 18 Oct:** schema
   (`20261018150000_live_feed_schema.sql`, applied, feed off) and `supabase/functions/_shared/feed.ts` + tests.
   **Step 4 done 18 Oct (Eddie OK'd):** `hl-sync` deployed, `20261018160000_hl_sync_cron.sql` applied (cron every
   minute, match days only). `feed_settings.enabled = false`: shadow mode, logs to `api_calls`, writes no results.
   Highlightly's venue/ref/weather/team sheets/live win chance are empty for every R1 match checked (3): show those
   sections only when present ("Couldn't get this for this match"); team sheets from ESPN. Next: step 5 shadow test.
   Nothing writes to `matches` until the November shadow test on staging passes (§3 step 5). Never auto-settle.
   **Done means:** `docs/LIVE-FEED.md` §7.

5d. **Built 15 Oct on `results-feed`; migration `20261015034119_seen_elimination.sql` applied 15 Oct. Eyeball the overlay
   + out screen on a real settle.** Knocked-out experience: spec `docs/UI-REDESIGN.md` §17, prototype `docs/ui-prototype/Out.dc.html`. Needed by the
   Round 1 settle (Sun 18 Oct night), since that's when the first players go out. The one-time red-card overlay
   (`players.seen_elimination_round`) + whistle and crowd `groan()`; the out player's Round screen (red hero + Replay,
   "Get back in" with buy-back cost chips from `reentryBurns()` and the Round 4 resurrection info, jinx avatar grid,
   "Still playing for the 20%"); "KNOCKED OUT" pick card; Me status "Out · Round N" and red road tile. The buy-back button
   uses the existing payments flow (kind `buyback`); the re-entry plumbing that lets a bought-back player pick is packet 7.
   **Done means:** settle a test round locally where a player loses → on their next open the overlay plays once, Replay
   plays it with sound, the out screen shows the right burn chips, and a jinx saves.

5e. ~~Round recap on open~~ **DONE 15 Oct (`recap`), all cards incl. jinx; migration `20261015120815_seen_recap.sql` applied
   15 Oct (`seen_elimination_round` kept, unused: drop it later). No local Supabase here (no Docker), so the "Done means" scenario
   is a PGlite DB test instead (`admin-flow.test.ts`: exact-score survivor, out player whose jinx landed, no prediction, seen
   once, unsettle → replays). Shatter sounds follow the spec table (low `chunk()` knocks), not the prototype file's glassy
   `clink()`s. **Still to do: the real-iPhone side-by-side with the prototype (sound on) at the Round 1 settle.** Spec `docs/UI-REDESIGN.md` §19.
   One-time sequence after each settle, played like an Instagram story (progress bars, left tap back, right tap next,
   hold to pause): the **ceramic crest clash** (plates twirl, two punches, the loser cracks and shatters, the winner slams
   in; a draw breaks both), then the outcome (through / out, the out card is the existing §17 overlay), the featured-match
   prediction result (exact / points / zero), and the jinx result (from Round 2). Every beat has its paired sound (punches,
   ground thuds, bass crunch, no glassy highs). Prototype `docs/ui-prototype/Recap.dc.html` is signed off: match it.
   `players.seen_recap_round` replaces `seen_elimination_round`; unsettle resets it. Build order for Sunday: storage +
   story shell + clash + outcome + prediction; the jinx cards can follow before Round 2 (no one is out until Round 1
   settles). Its "Done means" is in §19.

5f. **Player profiles (Eddie, 15 Oct). Built 15 Oct** (`src/PlayerSheet.tsx`, pure road/predictions in
   `src/profileData.ts` with the before-the-lock privacy test). Still to do: real-iPhone check of the slide, swipe and count-up. Spec `docs/UI-REDESIGN.md` §20, prototypes `docs/ui-prototype/Profile.dc.html`
   (interactive) and `ProfileOut.dc.html`. Tap any Squad or Table row → a bottom sheet slides up: nickname + real name,
   still in / out / bought back, paid, points, rank, exact scores, their road (locked rounds only) and their prediction
   record. Squad rows also show the real name under a nickname. Read-only, no migration, no RLS change: safe to ship before
   the Round 1 lock if packets 1–5 are done, otherwise next week.
   **Done means:** tap Bonzo → the sheet slides up, points count up, tiles pop in; before a lock it shows no current pick
   (test); swipe down / backdrop / X close it with the slide down; reduced motion = instant.

6. **Rest of the experience (before the Round 2 lock, nice to have).** Already built elsewhere: the rules page (5b, §10)
   and the elimination red card (5d). Still to do, **design first**: no prototypes or spec exist yet for 6a–6c, so the first
   step is a Claude Design canvas Eddie signs off, then a spec section in `docs/UI-REDESIGN.md`, then the build.
   - 6a. **The field:** home-screen pitch with every player's avatar; survivors on the pitch, out players in the stands.
   - 6b. **Wall of the fallen:** each out player beside the team (crest + score) that knocked them out.
   - 6c. **Share cards:** an image in the losing team's colours for a knock-out or a round summary, with a random banter line
     from a 30–40 line template bank (`{name}`, `{team}`, `{margin}`), shared into WhatsApp with the Web Share API (CLAUDE.md §6).
   - 6d. **Share the rules:** the rules card (`docs/ui-prototype/rules-card/Main.dc.html`, 1080 x 2800, made 15 Oct for the
     group) as a static image in `public/`, with a "Share the rules" button on the Rules page (Web Share, file share on iPhone).
     Update its copy first: the Round 1 payment deadline line is past, and the forfeit is still TBC.
   - **Done means:** each of 6a–6d matches its signed-off prototype on a real iPhone; share sheets open with the image attached;
     reduced motion respected.
7. **DONE 18 Oct.** Buy-back re-entry (`20261015170000_buyback_reentry.sql`) and the Round 4 resurrection
   (`20261018120000_resurrection_pick.sql`: `make_resurrection_pick`, away teams only, not used or burned for the comeback;
   a buy-back claim turns an unlocked resurrection pick into a normal pick) both **applied to the live project 18 Oct**. Tests in
   `admin-flow.test.ts`. Burns are computed in SQL (`reentry_burns`, mirrors the engine; the tests check they agree) and
   still written by the settle. UI: in Round 4 an out player's fixtures become the pick list with home teams disabled.
   **18 Oct (Eddie): a claim is enough to play** (`20261018130000_buyback_claim_counts.sql`, applied): the settle refuses
   while a claim is unconfirmed; rejecting it drops the pick. Still to do: eyeball the Round 4 resurrection screen on a real iPhone (no prototype; it reuses the pick flow).
   **Re-entry plumbing + "You're back in" (needed by the Round 2 lock, Fri 11 Dec).** Spec `docs/UI-REDESIGN.md` §23,
   prototype `docs/ui-prototype/BoughtBack.dc.html`. **Today a confirmed buy-back breaks the round:** `alive()` stays false
   until the settle, so `make_pick` refuses them ("You are not in this round"), the lock job doesn't auto-pick them, they're
   not in `round_pick_status`, the jinx picker still shows, and the settle then throws ("has no pick but has teams left", or
   "is still in and can't jinx" if they jinxed).
   - Server: one helper (e.g. `in_round(p, r)` = `alive()` OR a confirmed, unused buy-back claimed before this round's lock in
     a pool round ≤ 4) used by `make_pick`, `auto_pick_locked_rounds`, `round_pick_status` and the jinx insert policy (a
     player who's in can't jinx). `make_pick` and the pick screen refuse the `reentryBurns()` teams (Q8): decide whether the
     burns are written when the buy-back is confirmed (admin RPC with the engine preview) or computed in SQL; engine and
     DB must agree. Ask Eddie if it isn't clear.
   - UI: the §23 "You're back in" screen, Squad "Bought back" subtitle, Me pill keyed on the new state.
   - Resurrection RPC for Round 4 (out players, away teams, unused/unburned, not with a buy-back) as before.
   - **Done means:** PGlite tests: confirmed buy-back → can pick, can't pick a burned team, the lock job auto-picks them
     if they don't, can't jinx, Round 2 settles with them through or out; claimed-only → still out.
8. **Round controls:** edit lock times, add/edit knockout fixtures, "who went through" field; knockout predictions allow draws (Q12).
   No changes once a round is locked.
9. **CSV export:** one button after each settle downloads picks, results, payments and points (backup / disputes).

## Only if Eddie asks
- **Round 1 import from the Google Form** (fallback if Round 1 can't run on the app): local script, match players by email,
  latest submission before the lock counts, unpaid = not in, fixtures + picks inserted in one transaction (or flag Form rounds so
  the lock job skips them), settle through the normal admin page.
