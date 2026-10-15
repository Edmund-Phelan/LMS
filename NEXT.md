# NEXT.md — work packets (updated 15 Oct, late)

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
- **Decided 15 Oct: the side game starts in Round 1.** Every player predicts the score of the Round 1 featured match
  (Gloucester v Bordeaux-Bègles, already drawn) before the lock, and Round 1 settles prediction points like any other round.
  The engine already scores any round with a featured match; CLAUDE.md rule 13 and the rules doc are updated to say Round 1.
  Packet 4's "only if Eddie starts the side game in Round 1" condition is therefore met; the raffle is done.

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

---

## After Round 1 (before the Round 2 lock, Fri 11 Dec 8pm)
5b. ~~UI redesign~~ **DONE 15 Oct** (merged as PR #1, `ui-redesign`). Spec §1–12 of `docs/UI-REDESIGN.md` is built.
   Spec §15–17 were added after the merge and are packets 5c (Pools + live states) and 5d (knocked-out experience).
5c. **Live results + standings feed (API-Sports Rugby), before the Round 2 lock** (Eddie, 15 Oct). Scores update in the
   app while games are on, the Pools tab shows the real Champions Cup standings, admins still settle by hand. UI: spec
   `docs/UI-REDESIGN.md` §15 (Pools), §16 (live states); prototype boards `docs/ui-prototype/Live.dc.html` and
   `Pools.dc.html`. Plan:
   - **Eddie provides (before Claude Code starts):** a free API-Sports account and its key. The key goes in two places,
     never in git or chat: `APISPORTS_KEY=…` in `.env.local` (gitignored; for the local check script), and the Supabase
     Edge Function secret `APISPORTS_KEY` (Dashboard → Edge Functions → Secrets). If the key isn't in `.env.local`, stop and
     ask for it.
   - **Build order (one shippable commit each, stop at any failed check):** 1) `scripts/apisports-check.ts`: league id,
     confirm season 2026 is reachable on the plan, print the 24 teams with ids, write the mapping migration
     (`teams.api_team_id`, `teams.pool`) and check it against spec §15's pools → 2) schema: live columns,
     `result_source`, `pool_standings`, `api_calls` + DB tests → 3) Edge Function `sync-games` + the polling decision
     (unit-tested) + `pg_cron`/`pg_net` schedule → 4) Edge Function `sync-standings` + schedule → 5) UI §16 live states →
     6) UI §15 Pools tab (4th tab, between Round and Table) → 7) admin "auto/manual" + "Results in: X/12".
     Deploy the functions only after Eddie OKs; while Round 1 runs, nothing may write to `matches`. Test against recorded
     JSON fixtures in `supabase/functions/_fixtures/`, not the live API.
   - **API facts (from the docs, 15 Oct):** base `https://v1.rugby.api-sports.io`, header `x-apisports-key`.
     `GET /games` (needs one of `id`, `date`, `league`, `season`, `team`; add `timezone=Europe/Dublin`), **updated every
     15 s**. Statuses: NS not started · 1H/2H/HT/ET/BT/PT in play · INTR interrupted · FT finished · AET after extra time
     (finished) · AW awarded · POST postponed · CANC cancelled · ABD abandoned. `GET /standings` (required `league`,
     `season`; optional `team`, `stage`, `group`), **updated every hour**; `GET /standings/stages` and `/standings/groups`
     list the valid stage/group values. `season` is 4 characters (find out with `/seasons` or `/leagues` whether 2026/27 is
     `2026`). Free plan: 100 requests/day, 10/minute.
   - **Check first (stop if it fails):** with Eddie's key, one `/leagues?search=champions` call to get the league id and
     confirm the free plan returns season 2026 (some free plans only cover past seasons; this wasn't in the docs Eddie pasted).
     Then map all 24 teams to `teams.slug` (`teams.api_team_id`) and check them against the pools in the spec §15. If the free
     plan can't see 2026, tell Eddie (paid tier, or ESPN's unofficial scoreboard JSON as the source).
   - **One call covers a whole day:** `games?league=…&season=…&date=…` returns every match that day. The budget is per day;
     Saturday (8 matches, 13:00 to ~21:45) is the tight one.
   - **Smart polling (games):** `pg_cron` ticks every minute (free, no API call) and runs an Edge Function that calls the
     API only while a match of the current round is **live**: from kick-off to kick-off + 130 min, or later while the API
     still says in play. Live → every **5 min**; nothing live → no calls. After the last window, one sweep every 15 min
     until every match is final (cap at kick-off + 4 h, then leave it to admins). Round 1 estimate: Fri ~21, Sat ~85,
     Sun ~65 calls.
   - **Standings:** once a day at 07:00, plus on match days once at the day's last kick-off + 3.5 h (about 1.5 h after
     full time, since the table updates hourly), so at most 2 calls/day. Store the whole response in `pool_standings` (pool/group, position,
     team_id, played, won, drawn, lost, points for/against, bonus points if given, points, description, `updated_at`),
     replaced per fetch, readable by everyone. Show the API's order as it comes; never recalculate.
   - **Budget guard:** log every call in `api_calls` (date, endpoint, status). Hard cap 95/day; above 80, games back off to
     every 10 min and standings skip. One retry on an empty or failed response, then stop; read the `errors` field first.
   - **Writes (games):** live score + clock into `live_home`, `live_away`, `live_status`, `live_minute`,
     `live_updated_at`. Official `home_score`/`away_score`/`status = completed` **only** on FT / AET (pool: the 80-minute
     result; knockouts: set `winner_team_id`, extra time and kicking competition included). AW (awarded) → write the
     score but flag it for an admin to confirm. POST/CANC → `postponed`, ABD → `abandoned`, INTR → stays live. **Never
     overwrite a result an admin entered** (`result_source`: `api` | `admin`; admin wins). Never settle automatically.
   - **UI:** spec §15 (Pools tab), §16 (LIVE pills, scores between the cards, live status on "Your pick" and in the squad).
     Admin Results screen shows "auto" vs "manual" per match and a "Results in: X/12" banner with Settle once all are final.
   - **Secrets:** the API key lives only in a Supabase Edge Function secret, never in the front end.
   - **Monday cross-check (optional):** a scheduled Claude task, Monday 09:00, compares the stored results with a web
     search and messages Eddie if anything differs. It never writes.
   - **Done means:** on a real weekend (or a replay of recorded API responses in tests) results land within 5 min of full
     time, standings refresh within 2 h of a day's last match, the day's call count stays under 95, an admin-entered score is
     never overwritten, postponed/abandoned/awarded are handled as above, and settle still needs a human. Unit tests for
     the polling decision (live / not live / budget), the status mapping, and the API → match/standings mapping.

5d. **Knocked-out experience: spec `docs/UI-REDESIGN.md` §17**, prototype `docs/ui-prototype/Out.dc.html`. Needed by the
   Round 1 settle (Sun 18 Oct night), since that's when the first players go out. The one-time red-card overlay
   (`players.seen_elimination_round`) + whistle and crowd `groan()`; the out player's Round screen (red hero + Replay,
   "Get back in" with buy-back cost chips from `reentryBurns()` and the Round 4 resurrection info, jinx avatar grid,
   "Still playing for the 20%"); "KNOCKED OUT" pick card; Me status "Out · Round N" and red road tile. The buy-back button
   uses the existing payments flow (kind `buyback`); the re-entry plumbing that lets a bought-back player pick is packet 7.
   **Done means:** settle a test round locally where a player loses → on their next open the overlay plays once, Replay
   plays it with sound, the out screen shows the right burn chips, and a jinx saves.

6. **Rest of the experience:** the field (avatars on the pitch, out players in the stands), wall of the fallen, elimination
   animation, share cards with banter lines, rules page.
7. **Re-entry plumbing:** `make_pick` and the lock job accept bought-back players; pick screen greys out `reentryBurns()` and
   `make_pick` refuses them (Q8); resurrection RPC for Round 4 (out players, away teams, unused/unburned, not with a buy-back).
   Someone out in Round 1 can buy back for Round 2, so the buy-back half is needed by 11 Dec.
8. **Round controls:** edit lock times, add/edit knockout fixtures, "who went through" field; knockout predictions allow draws (Q12).
   No changes once a round is locked.
9. **CSV export:** one button after each settle downloads picks, results, payments and points (backup / disputes).

## Only if Eddie asks
- **Round 1 import from the Google Form** (fallback if Round 1 can't run on the app): local script, match players by email,
  latest submission before the lock counts, unpaid = not in, fixtures + picks inserted in one transaction (or flag Form rounds so
  the lock job skips them), settle through the normal admin page.
