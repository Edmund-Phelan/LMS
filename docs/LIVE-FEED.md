# LIVE-FEED.md: live scores, match centre and highlights (Highlightly Rugby API)

Packet **5h** in NEXT.md. Planned 18 Oct 2026 (Jarvis session). Replaces the "Not built (needs a feed)" part of packet 5c,
whose API-Sports plan died because the free plan can't see season 2026 (old plan: commit `2f63ba3`). The shape of that plan
still holds (one call covers a day, smart polling, budget guard, admin wins, never auto-settle); the provider changes.

**Goal:** scores update in the app while games are on; when a game finishes the official result lands by itself; tapping
a finished match opens a match centre with the stats the API gives and the highlights video embedded. Admins go from
typing 12 scores to one Settle tap. **Settle stays human.** Updated later on 18 Oct: use the API to its full
potential: pick-week scouting (form, head-to-head, season record, win chance) and team sheets as they're named.

- **API reference:** `docs/highlightly-openapi.json` (Highlightly Rugby API v6.2.4, from Eddie 18 Oct) is the source of truth
  for paths, params and fields. Build the client and the fixtures against it.
- **Mock-up:** `docs/ui-prototype/live-feed/` (Claude Design canvas "BBB LMS · Live scores"): `Main` (Round screen, matchday
  live), `MatchLive` and `MatchFinal` (match centre), `Scouting` (pick week), `Budget` (calls per day). Match it.
  Round wrap (added 18 Oct): `docs/ui-prototype/round-wrap/` (`Main` wrap page, `Admin` highlight check, `Monday` WhatsApp
  post), designed 15 Oct before the feed existed: keep the layout and ideas, restyle to the app tokens (that canvas used
  `#0A1633`/`#C9A43B`/`#7FD3F5`; use navy-900/gold/blue from UI-REDESIGN §1), and its sample data (Ulster etc.) is made up.
- **Superseded:** `docs/ui-prototype/Live.dc.html`'s "LIVE 58'" clock. Highlightly has no match minute; the live pill
  shows the state instead (`live-feed/Main`).

---

## 0. Step 1 result (18 Oct): gate failed on the match list → option 1 (Eddie)

- League **46738** "European Rugby Champions Cup", season **2026** (`leagueName=Champions Cup` finds nothing: list
  `/leagues?limit=100`). Gloucester 36–36 Bordeaux `Finished` ✓. 8 of the 9 finished R1 scores right.
- **Sale v Glasgow: the `/matches` list says 27–45 `Finished`; the real score is 27–47** (club site, ESPN, press). Still
  wrong 19 h after full time. Highlightly's own `/standings` had it right (Glasgow 47 for, 27 against).
- **Eddie, 18 Oct: option 1 + standings.** The list score is **live only**. A pool match's official score is the
  **standings delta** (§4), written only when ESPN's scoreboard agrees; knockouts (no standings): list score + ESPN
  agreeing. Any disagreement → admin. ESPN was right on all 9 R1 games but lagged 18 h on 17 Oct, so a lag just waits.
- `/matches/{id}` for a Champions Cup match: venue, referee, forecast **all null**, `lineups` **null**, `predictions.live`
  **empty**, 21 `prematch` snapshots (`"79.87%"` strings). Nothing beyond the spec (no stats, events, clock, HT score).
  So: no Highlightly team sheets, no venue/ref line, no swing chart unless `live[]` fills on a later match (re-check in R2).
  ESPN's summary has `rosters` (23 per side, shirt numbers, positions, starters) → team sheets from ESPN; its
  `boxscore.teams[].statistics` is empty → **Match stats section dropped**.
- Highlights: 6 for the 9 finished games, all VERIFIED, youtube, `match-highlights`, official EPCR channel,
  `embedUrl` = `www.youtube.com/embed/<id>` (swap to youtube-nocookie). `/last-five-games`, `/head-2-head` (3 meetings),
  `/teams/statistics`, `/standings` (4 groups × 6, team ids) all fine. Fixtures: `supabase/functions/_fixtures/`.

## 1. API facts (from the docs + OpenAPI spec, 18 Oct; verify in step 1)

- Base `https://rugby.highlightly.net`, header `x-rapidapi-key: <key>` (same header name even off RapidAPI).
  Free (BASIC) plan: **100 requests/day**, live scores, all leagues incl. European Rugby Champions Cup, highlights, standings,
  lineups. Not on free: odds, `/highlights/geo-restrictions/{id}`. Paid: $5.99/month = 7,500/day.
- Rate-limit headers on every response: `x-ratelimit-requests-limit`, `x-ratelimit-requests-remaining`. **Use `remaining`
  as the source of truth for the budget**, not our own count.
- `GET /matches?leagueId=&season=&date=YYYY-MM-DD&timezone=Europe/Dublin` → every match that day in **one call**
  (`limit` ≤ 100). List data refreshes **once a minute**. Match: `id`, `date`, `week`, `homeTeam{id,name,logo}`,
  `awayTeam{…}`, `league{id,season,name}`, `state{description, score}`. `score` is a string `"36 - 36"` (home - away):
  split on `-`, trim, parse ints; missing/empty = no score yet.
- `state.description` values: Not started · First half · Half time · Second half · Extra time · Break time · Penalties ·
  Suspended · Interrupted · Finished · Finished after extra time · Postponed · Cancelled · Abandoned · Awarded · Unknown ·
  To be announced. **No clock/minute field and no half-time score** in the spec.
- `GET /matches/{id}` → array with `venue{name,city,capacity}`, `referee{name,nationality}`, `forecast{status,temperature}`,
  `predictions{prematch[],live[]}` (each `probabilities{home,draw,away}`), `lineups{home,away}{initialLineup[],substitutions[]}`
  (player `name`, `shortName`, `position`, `shirtNumber`). **The spec has no team statistics or events (tries, cards,
  scorers).** Step 1 checks whether the real response has more.
- `GET /highlights?leagueId=&date=` (or `matchId=`), `limit` ≤ 40 → `id`, `type` (VERIFIED | UNVERIFIED), `title`,
  `imgUrl`, `url`, `embedUrl`, `source` (youtube | twitter | reddit | espn …), `channel`, `category` (match-highlights,
  try-clip, tries-compilation, full-match-replay, press-conference, pre-match-content, post-match-content, other), `match`.
  Verified highlights land **1–48 h after full time**; unverified clips can appear during the match. Free tier note in the
  docs: "Some results might be hidden with FREE tier."
- `GET /last-five-games?teamId=` → that team's last five finished games (match objects; postponed/cancelled left out).
- `GET /head-2-head?teamIdOne=&teamIdTwo=` → past meetings (match objects).
- `GET /teams/statistics/{id}?fromDate=YYYY-MM-DD` → one row per league + season: `total`, `home`, `away`, each with
  `games{played,wins,loses,draws}` and `points{scored,received}`. Refreshes as soon as a match finishes.
- `/matches/{id}`: the docs say venue, forecast, referee and lineups exist for "certain popular leagues" only: step 1
  confirms the Champions Cup is one. `predictions.live[]` is an array with `generatedAt`; step 1 confirms it's the whole
  in-game history (the swing chart needs that), not just the latest value.
- **No per-match team stats or events anywhere in Highlightly** (no such schema in v6.2.4; `/teams/statistics` is season
  totals). Candidate for tries / possession / tackles / cards: ESPN's unofficial summary JSON,
  `site.api.espn.com/apis/site/v2/sports/rugby/271937/summary?event=<espn event id>`. **Not verified** (couldn't be read
  on 18 Oct). Step 1 checks it; if it has no team stats, the Match stats section is dropped, never scraped from elsewhere.
- `GET /standings?leagueId=&season=` → `groups[]{name, standings[]{team, position, points, wins, loses, draws,
  gamesPlayed, scoredPoints, receivedPoints}}`.
- Second source for the cross-check (free, no key, unofficial): ESPN
  `site.api.espn.com/apis/site/v2/sports/rugby/271937/scoreboard?dates=YYYYMMDD`. It lagged badly on 17 Oct (Gloucester v
  Bordeaux still "Scheduled 0–0" 18 h after a 36–36 draw), so it's a check, never a source.

## 2. Eddie, before Claude Code starts

- Highlightly account (free) → key. Put it in **two places, never in git or chat** (the repo is public):
  `HIGHLIGHTLY_KEY=…` in `.env.local` (gitignored, for the check script) and the Supabase Edge Function secret
  `HIGHLIGHTLY_KEY`. If it isn't in `.env.local`, stop and ask.

## 3. Build order (one shippable commit each; stop at any failed check)

1. **Gate: `scripts/highlightly-check.ts`** (≤ 20 Highlightly calls; ESPN calls don't count). Stop and report to Eddie before anything else.
   - Find the Champions Cup league id and the season number for 2026/27 (`/leagues?leagueName=Champions Cup`).
   - Pull Round 1 (16, 17, 18 Oct). **Must show Gloucester 36 – 36 Bordeaux, `Finished`.** Any wrong R1 score = stop.
   - Print the 24 teams with Highlightly ids; write the mapping migration (`teams.hl_team_id`) by name match, check it
     against the pools in UI-REDESIGN §15, list any team it couldn't match for Eddie to confirm. Store `matches.hl_match_id`
     for R1 by (home, away, date).
   - Dump raw JSON to `supabase/functions/_fixtures/`: the R1 day lists, one `/matches/{id}` (Gloucester v Bordeaux),
     `/highlights` for each R1 day, `/standings`. These are the test fixtures from now on (never test against the live API).
   - Also dump: `/last-five-games` and `/teams/statistics` for Gloucester and Bordeaux, `/head-2-head` for the pair, and
     ESPN's summary for the same match (find its event id from ESPN's scoreboard for 16 Oct). Report: lineups/venue/ref
     present for a Champions Cup match? `predictions.live[]` length (a history or one value)? ESPN team stats present, and
     which ones?
   - Report: does `/matches/{id}` have anything beyond the spec (statistics, events, scorers, clock, HT score)? How many
     R1 highlights came back, verified vs unverified, which `source`s, and what host `embedUrl` points at (YouTube?).
2. **Schema migration + PGlite DB tests.**
   - `teams`: `hl_team_id int unique`, `pool smallint`.
   - `matches`: `hl_match_id int unique`, `live_state text`, `live_home int`, `live_away int`, `live_updated_at timestamptz`,
     `result_source text check in ('api','admin')`, `check_state text check in ('pending','match','espn_lag','mismatch')`,
     `needs_admin text` (null = fine, else the reason: awarded, knockout level, extra time in a pool match),
     `details jsonb`, `details_at timestamptz`.
   - `match_highlights`: `id bigint pk` (Highlightly id), `match_id → matches`, `type`, `category`, `title`, `img_url`,
     `url`, `embed_url`, `source`, `channel`, `fetched_at`.
   - `pool_standings`: one row per team (pool, position, played, won, drawn, lost, points for/against, points,
     `updated_at`), replaced per fetch. Plus `standings_baseline` (round_id, team_id, played, points for/against):
     the delta baseline for §4, copied from `pool_standings` before the round's first kick-off (zeros for Round 1),
     never changed after. Each team plays once a round, so baseline vs now is that team's match.
   - `api_calls`: `at`, `endpoint`, `http_status`, `remaining` (from the header), `note`.
   - `match_scouting`: `match_id` pk, `h2h jsonb`, `home_form jsonb`, `away_form jsonb`, `updated_at`.
   - `team_season_stats`: `team_id`, `season`, `total jsonb`, `home jsonb`, `away jsonb`, `updated_at`.
   - `match_highlights` also: `hidden bool default false` (admin hid it); `matches.highlight_url text` (admin's pasted
     YouTube link, wins over the API's pick).
   - `matches` also: `lineups_at timestamptz` (when a team sheet first appeared), `espn_event_id int`, `stats jsonb`
     (ESPN team stats, only if step 1 passes). "Changes from last week" is computed in the UI by comparing a team's
     lineup with its previous match's stored `details`.
   - `feed_settings` (single row): `enabled bool default false`, `league_id`, `season`, `daily_budget int default 100`.
   - RLS: everyone signed in reads matches/highlights/standings; only the service role writes them; `api_calls` and
     `feed_settings` admin-read only. **Picks/predictions/jinx policies untouched.** Add `matches` and `match_highlights`
     to the `supabase_realtime` publication.
3. **Pure logic in `supabase/functions/_shared/feed.ts` + Vitest (against the fixtures).**
   - `parseScore("36 - 36")`, `mapState(description)` → live | final | postponed | abandoned | awarded | none.
   - `toMatchUpdate(apiMatch, row, stage)`: the write rules in §4.
   - `planCalls(now, weekMatches, remaining, settings)`: what to call this minute, match days and pick-week jobs
     alike (see §5). Unit-test: nothing live,
     one live, overlapping windows, budget low, budget gone, match running long, all final.
4. **Edge Function `hl-sync`** + schedule. `pg_cron` every minute runs a SQL function that does nothing unless today has a
   match in a round (no invocation otherwise); if so it calls `hl-sync` via `pg_net` (project URL + key in Vault).
   The function runs `planCalls`, makes at most the planned calls, logs each in `api_calls`, writes per §4.
   **Deploy only after Eddie OKs. `feed_settings.enabled = false` until the shadow test passes** (logs, doesn't write).
5. **Shadow test before Round 2** on the staging Supabase project: point `feed_settings.league_id` at a URC or
   Premiership weekend in November, let it run a full Saturday, check every result against the real scores and the day's
   calls ≤ budget. Then flip production on for the Round 2 weekend.
6. **UI: live states (UI-REDESIGN §16).** No minute exists, so the pill reads the state: "1ST HALF · 13–10", "HT · 13–10",
   "2ND HALF · 20–17", grey "FULL TIME". Score stacked between the cards, losing card fades at full time (draw dims both).
   "Your pick" pill: Winning / Level / Losing; squad chips "Winning" / "Level" / "Losing", then Through / Out (provisional
   until settle, footnote stays). Realtime subscription on `matches` for the round; keep the 1-minute re-read as a fallback.
   When a score changes, the number flips (≤ 300 ms); no sound or haptic (those only fire from taps, §7 of CLAUDE.md).
   Footer on live matches: "Updated 4 min ago". If the feed is off or stale > 20 min, fall back to today's clock-based
   "On now" (`src/live.ts`) — the app must work with the feed dead.
7. **UI: Match centre** (§6) + highlights, then the **Round wrap** (§6), then the **Scouting sheet** (§6) with the weekday jobs that fill it
   (form, head-to-head, season stats, team sheets; schedule in §5).
8. **Pools tab on `pool_standings`.** Header "Live · updated X min ago" on match days, "Updated 07:00" otherwise. Keep
   `standings.json` + `/update-standings` as the fallback until two rounds have run on the feed, then retire them.
9. **Admin.** "Results in: 9/12 (auto)" banner; per match a source chip (API / Admin) and a check chip (ESPN ✓ /
   ESPN not updated / ⚠ ESPN says 31–36). Admin can still type over any score (that row becomes `admin`, and the feed
   never touches it again). "API today: 63 / 100". Settle preview unchanged; if any match is `mismatch` or has `needs_admin`,
   the confirm needs a second tap ("I've checked these").
   **Highlights panel** (round-wrap `Admin` board, lighter): per match the clip the wrap will show, with "Hide" and
   "Paste a link" (YouTube URL → `matches.highlight_url`). No publish gate: the wrap goes live at the settle and fills
   as clips land. **Copy round wrap for WhatsApp** replaces today's "Copy results for WhatsApp" (`AdminPage.tsx`), in the
   `Monday` board's format (below).

## 4. Write rules (the money part)

- **Live** (First half, Half time, Second half, Break time, Extra time, Penalties, Suspended, Interrupted): write only
  `live_*`. Never the official score.
- **Finished** (Eddie, 18 Oct, §0): the list's score is never the official one. **Pool:** the score is the standings
  delta: each team's `scoredPoints`/`receivedPoints` now minus the last stored `pool_standings` row from before the
  match, valid only if each team's `gamesPlayed` went up by exactly 1 and home scored = away received (and vice versa).
  Not valid yet (standings lag) → wait for the next standings call. Valid → compare with ESPN's scoreboard: same → write
  `home_score`, `away_score`, `status = completed`, `result_source = api`, `check_state = match`; ESPN not final →
  `espn_lag`, wait; different, or standings ≠ list once both final for 1 h → `mismatch`, write nothing, admin types it.
  That's the 80-minute result (rule 6; a draw is a loss). **Knockouts:** list score, written only when ESPN agrees. Knockouts: set `winner_team_id` if the scores differ; level → leave it
  null, `needs_admin = 'knockout level'` (the kicking competition isn't in the score string).
- **Finished after extra time:** knockouts only, as above. In a pool match → don't write; `needs_admin = 'extra time in a pool match'`.
- **Awarded:** write the score and set `needs_admin = 'awarded'` so an admin must look.
- **Postponed / Cancelled** → `status = postponed`; **Abandoned** → `abandoned` (rule 7: survives, team back).
- **Unknown / To be announced / Not started:** write nothing; log.
- **Never overwrite a row with `result_source = admin`.** Never move a match backwards (final → live).
- **Never settle automatically.** The feed only fills the scores the settle preview reads. **Eddie, 18 Oct:** from
  Round 2, once every result is in, admins get an "All N results are in" banner on the Round screen that opens the
  ready-made preview (one tap to settle). Fully automatic settling (all in, nothing flagged, no unconfirmed claims,
  2 h after the last full time, own on/off switch) is to be decided after Round 2 has run this way.
- **While a round is being settled or after `settled_at`, the feed doesn't write that round's matches.**
- **Cross-check:** ESPN's scoreboard for that date when a match's score is ready (and every 30 min while ESPN isn't
  final, up to 24 h): it gates the write above; ESPN itself never writes a score.

## 5. Call schedule and the 100-calls/day budget

The allowance is **per day and can't be banked**, so quiet weekdays in a match week go on scouting and team sheets, and
match days go on live scores. One `/matches?leagueId&season&date` call covers every match that day. Round 2 as the worked
example (mock-up board `Budget`):

| Day | Calls | What |
| --- | --- | --- |
| Mon (week before) | ~4 | Fixture + kick-off check for Fri/Sat/Sun (3 list calls), standings (1) |
| Tue | ~48 | Form: `/last-five-games` × 24 teams; season record: `/teams/statistics` × 24 |
| Wed | ~24 | `/head-2-head` × 12 fixtures; `/matches/{id}` × 12 (win chance, venue, ref, sheets if out) |
| Thu | ~18 | Team sheets: `/matches/{id}` × 12 at 14:00, re-check the ones not named at 19:00 |
| Fri | ~79 | Team sheets × 12 at 12:00 (late changes, before the 20:00 lock); 2 live matches every 2 min; 2 detail calls |
| Sat | ~91 | 7 matches, live ~13:00–22:10 every 6–7 min (~80); 7 detail calls; highlights 3; standings 1 |
| Sun | ~86 | 3 matches, live ~13:00–19:40 every 5 min (~78); 3 detail calls; highlights 4; standings 1 |
| Mon (after) | ~4 | Highlights day+1/+2 sweeps, standings |
| Weeks with no Champions Cup | 0 | Nothing changes, nothing to fetch (19 Oct – 6 Dec, Jan–Mar break) |

- `planCalls`: live poll interval = `ceil(liveMinutesLeftToday / (remaining − reserveLeftToday))`, clamped to 2–15 min.
  The reserve is today's still-due detail, highlights, standings and team-sheet calls plus a margin of 4. Hard stop at
  `remaining ≤ 5` (95 used).
- A match is "live" from kick-off to kick-off + 130 min, or later while the API still says it's in play. After its
  window, if it isn't final: one sweep every 15 min, cap at kick-off + 4 h, then leave it to admins.
- `remaining ≤ reserve` → stop live polling, keep the reserve for results/details. `remaining = 0` → no calls; the app
  falls back to the clock and admins.
- **Details:** one `/matches/{id}` per match, 15 min after it goes final → confirmed team sheets, venue/ref/weather and the
  full `predictions.live[]` history (swing chart). Then `/teams/statistics` for both teams the next morning (Mon/Tue).
- **Team sheets:** Thu 14:00 all, Thu 19:00 the un-named ones, Fri 12:00 all (late changes). Sat/Sun matches get one more
  check at 12:00 on the day only if budget allows after the reserve. A team sheet never costs a call during live windows.
- **Highlights:** one `/highlights?leagueId&date` per match day at last full time + 1 h, + 3 h, next day 09:00 and 21:00,
  day + 2 at 09:00 (verified clips can take 48 h). Upsert into `match_highlights`.
- **Standings:** Monday 07:00 in a match week, plus one 15 min after each kick-off slot's matches go final (the result
  source for pool matches, §4), then every 30 min until each of them has a valid delta (≈ 4–6 a match day).
- **ESPN** (stats + cross-check) costs no Highlightly budget: summary once per match at full time + 30 min (+ retry at
  + 3 h if empty).
- **Upgrade path:** $5.99/month = 7,500/day → poll every minute (the list refreshes once a minute anyway) and call
  `/matches/{id}` during live games so the win-chance bar moves live. One setting (`feed_settings.daily_budget`). Only
  worth it on match months (Dec, Jan, Apr, May). Eddie decides after Round 2; build for the free plan.

## 6. Match centre and scouting (mock-up boards `MatchLive`, `MatchFinal`, `Scouting`)

**Match centre:** tap any fixture after kick-off (Round screen rows, the Your-pick card, Recap's crest-clash card, Profile
road tiles) → a full-height bottom sheet (same slide/swipe/close as §20 profiles). Section order:

- **Header:** both halves in team colours, crests, big score, state pill (live state, HALF TIME, or FULL TIME / DRAW), venue ·
  ref · weather line, "Score updated 18:22 · next check about 18:29" while live.
- **Live:** *Who's riding on it* (backers' avatars per side, after the lock only, with "Winning by 14" / "Needs 2 scores"),
  *Before kick-off* (pre-match win-chance bar), and for the featured match *If it ended now* (every prediction scored
  against the live score, provisional). Highlights placeholder; team sheets collapsed.
- **Full time:** backer call-out (anyone this result knocked out, red-card corner on the avatar), *Upset meter* (pre-match
  chance of what actually happened: "The draw was a 4% shot"), *How it swung* (line chart of `predictions.live[]`, 50%
  line, KO/HT/FT, the biggest swing labelled), *Highlights*, *Match stats* (ESPN, only if step 1 passes), *Pool N now*
  (from `pool_standings`, both teams highlighted), *Season so far* (`team_season_stats`), *Team sheets* as played.
- **Highlights:** best VERIFIED clip first (match-highlights > tries-compilation > try-clip > full-match-replay), then a row
  of three. `imgUrl` + play button; **tap swaps in the iframe** (lazy, never several iframes on load). YouTube:
  `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&rel=0`. Always a "Watch on YouTube" link under it (the free
  plan can't check geo/embed restrictions). Non-YouTube sources: thumbnail + link. Unverified clips hidden. None yet: "The
  official highlights usually land 1 to 48 hours after full time."

**Scouting sheet (pick week):** before the lock, tapping a team card is a pick (takeover), so scouting gets its own
affordance: a "Scout ›" link on each fixture's time row → a bottom sheet with a "Locks in 1d 4h" chip, *Win chance*
(pre-match model, with "A draw knocks out whoever backs either side"), *Form · last five* (W/D/L squares, score on tap),
*Head to head* (last 3 meetings), home/away record tiles for this fixture (home team at home, away team away), *Team
sheets* (a pitch formation of numbered shirts, gold ring = changed from last week, tap a shirt for the name; tab per team;
"not named yet" state with when we'll check), then "Back Bristol" / "Back Munster" buttons in team colours that open the
existing pick confirm (§18). Used/burned teams show "Used in Round N" instead of the button.

**Round wrap page** (`/wrap/:n`, round-wrap `Main` board): the whole round on one screen, linkable from the group.
- Header "Round N · Full time", "Round wrap", chips: "8 of 11 through" · "3 out" (red) · "Featured: +5 Rory" (gold).
- "Results & highlights": one card per match, featured first: both teams with colour chips and scores (winner bold), the
  backers line ("4 picked Leinster · all through", "2 picked Munster · both out", "Draw · nobody picked it"), FEATURED tag,
  a play thumbnail. Tap → the card expands to the 16:9 clip (same lazy embed and "Open in YouTube" link as the match
  centre); one open at a time. Tapping the score row opens that match's match centre.
- Entry points: a "Round wrap ›" banner on the Round screen once a round is settled, the last card of the round recap
  (§19) "Watch the round", and the link in the WhatsApp post. Before the settle the route shows "Wrap lands when the round
  is settled".
- Match with no clip yet: score only, "Highlights land within a day". Hidden clip: score only.

**Monday WhatsApp post** (round-wrap `Monday` board), produced by the admin's copy button, Eddie pastes it:
```
🏉 ROUND 1 DONE

Leinster 31–14 Sale ⭐
Munster 19–22 Bath 💀
…every result, ⭐ = featured match, 💀 = it knocked someone out

Gone: Cboh, Harvey
Featured match: Rory nailed it, +5

Highlights for every game 👇
https://edmund-phelan.github.io/LMS/#/wrap/1

Round 2 picks open now, lock Fri 11 Dec 8pm
```

Reduced motion: no slide, no score flips. Everything works with highlights blocked, ESPN missing or the feed off.

## 7. Done means

On the November shadow weekend (or a replay of recorded responses in tests): live scores land within one poll of the
API changing; every final result lands within 15 min of full time and matches the real score; the day's call count
stays under the budget (check `api_calls`); an admin-typed score is never overwritten; postponed / abandoned / awarded
behave as in §4; the app still works with `feed_settings.enabled = false`; highlights for a finished match appear in its
match centre once Highlightly has them, play inline on an iPhone in the installed PWA, and the YouTube link works when
the embed doesn't; settle still needs a human tap. In pick week: form, head-to-head, season records and win chance are in by Wednesday
night, team sheets appear in the Scouting sheet within one check of being published, and the week's calls match §5. The round
wrap opens from the WhatsApp link, shows every result with its backers line, plays a clip inline, and respects the
admin's Hide / pasted link; the copy button produces the Monday post with the right ⭐, 💀, names and lock time. Unit tests: `parseScore`, `mapState`, `toMatchUpdate` (every state,
admin row, settled round), `planCalls` (the cases in step 3), cross-check outcomes.
