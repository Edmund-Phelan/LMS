# BBB Last Man Standing (Champions Cup LMS) — project brief for Claude Code

Read this whole file before writing code. It is the spec. When it and your instincts disagree, it wins;
when it is silent, ask Eddie. The human-readable rules live in the Claude Doc
"Champions Cup LMS 26/27: rules proposals" (https://claude.ai/code/artifact/a99ed3c3-a9ae-47f7-9847-4b3f50510d2a);
section 5 below is the same rules, written for the engine.

## 1. What this is

App name: **BBB Last Man Standing** (use it in the title, PWA manifest and link preview).

A private web app for a Last Man Standing comp on the 2026/27 Investec Champions Cup, played by
~11 mates who share a WhatsApp group. Run by Eddie (owner) and Conn (second admin).

- Every round, each player picks one team to win. Win → through. Loss or draw → out. Last one standing takes the pot.
- **Round 1 (16–18 Oct) runs on the app.** Picks lock Fri 16 Oct 2026, 8pm Irish time. The Google Form is only a fallback
  (see NEXT.md). Round 1 rules: no pick = no entry (no auto-pick), no confirmed payment = not in the comp.
- Everyone is on iPhone. Mobile-first, installed to the home screen as a PWA. Desktop is an afterthought.
- Personal and private: no licensing constraints on assets, no scale concerns. Real money is involved (€10 entries),
  so correctness of the lock, the privacy of picks and the rules engine matters more than anything else.
- Aim: a genuinely fun experience. The lads should open it for fun, not just to pick. UI/UX bar is high.

## 2. Stack (agreed — don't change without asking)

| Layer | Choice |
| --- | --- |
| Front end | React + Vite + TypeScript + Tailwind |
| Animation | Motion (formerly Framer Motion); Lottie (`lottie-react`) for set pieces; Rive only if worth it |
| Haptics | `react-haptic` (or WebHaptics for patterns) — see 7 |
| Back end | Supabase free tier: Postgres + row-level security, Auth, Storage, `pg_cron` |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow on push to `main` |
| Tests | Vitest for the rules engine (mandatory), anything else optional |

Hosting notes:
- Vite `base` must be `/<repo-name>/` unless a custom domain is set.
- Use `HashRouter` (or copy `index.html` → `404.html` in the build) so deep links work on Pages.
- Only the Supabase **anon** key and URL go in the front end (as build-time `VITE_` env vars from GitHub Actions secrets).
  The **service-role key never goes in the repo or the front end.** Security comes from RLS, not from hiding the anon key.
- Keep-alive: Supabase pauses idle free projects after ~7 days, and there are 11 weeks between Round 4 (17 Jan) and the
  Round of 16 (2 Apr). Add a daily GitHub Actions job that makes one cheap request to the project. Verify the current pause policy.

## 3. Setup checklist (first session)

1. Repo: Eddie creates it on GitHub. Scaffold Vite React TS, Tailwind, Vitest, ESLint/Prettier.
2. Supabase MCP for Claude Code (verify the current command in Supabase's docs), scoped to this project:
   `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=<ref>"`
   Use migrations (`supabase/migrations/*.sql`) for every schema change, committed to the repo — never click-ops schema.
3. GitHub Pages: Settings → Pages → Source: GitHub Actions. Workflow: install, test, build, deploy (`actions/deploy-pages`).
   Private repo needs GitHub Pro (free with the Student Developer Pack); otherwise make the repo public.
4. Auth email: Supabase's built-in email sender is heavily rate-limited and may only deliver to project team members.
   Check, and if so set up custom SMTP (e.g. Resend free tier) before inviting the lads.
   Edit the "Magic Link" email template to show the 8-digit code (`{{ .Token }}`), not a link.
5. Copy `crests/` → `public/crests/` and `teams.json` → `src/data/teams.json` (both in this handoff folder).
6. Seed: teams (from teams.json), rounds 2–4 with lock times, matches for rounds 2–4, players.

## 4. Data model

All times are `timestamptz`, stored in UTC, displayed in Europe/Dublin. Irish clocks go back 25 Oct 2026, so the
R2–R4 locks are in winter time (UTC+0). Never compute locks from the phone clock.

```
players        id (= auth.users.id), name, nickname, avatar_url, kit_colour, is_admin bool, created_at
teams          id, slug, name, primary, secondary, text, crest, kit jsonb (see §8: pattern, colours, accent …)
rounds         id, number, stage (pool|r16|qf|sf|final), name, lock_at, featured_match_id, featured_drawn_at, settled_at
matches        id, round_id, home_team_id, away_team_id, kickoff_at, home_score, away_score,
               winner_team_id (knockouts: team that goes through), status (scheduled|completed|postponed|abandoned)
picks          id, round_id, player_id, team_id, is_auto bool, is_resurrection bool, updated_at   unique(round_id, player_id)
predictions    id, round_id, player_id, home_score, away_score                                    unique(round_id, player_id)
jinxes         id, round_id, jinxer_id, target_id                                                  unique(round_id, jinxer_id)
payments       id, player_id, kind (entry|buyback), amount_eur, status (claimed|confirmed), claimed_at, confirmed_by, confirmed_at
burned_teams   id, player_id, team_id, round_id, reason (buyback_penalty|resurrection_penalty)
round_results  id, round_id, player_id, outcome (through|out|survived_postponed|clean_slate|reinstated|already_out),
               prediction_points, exact_score bool, jinx_points
```

Storage: bucket `avatars`, public read, each player may write only `avatars/<their id>/*`.

### RLS — the parts that matter most

- **Picks are private until the lock.** `select` on `picks`, `predictions` and `jinxes`: own rows always; everyone's rows
  only when `now() >= rounds.lock_at` for that round. Admins get no exception before the lock — Eddie plays too.
- **Writes only before the lock.** `insert`/`update` on picks/predictions/jinxes: own row, `now() < lock_at`, and
  (picks) the team plays in that round and is not used or burned by that player. Enforce in the policy or a
  `security definer` RPC — the client check is UX only.
- Results, matches, round_results, burned_teams, payment confirmation: admin-only writes (`is_admin()` helper).
- Players can claim a payment (`status = claimed`); only admins can confirm.
- As Supabase project owner Eddie can still read raw tables in the dashboard. That's accepted; the rules page says so.

### At the lock (`pg_cron`, every minute, idempotent)

For each round whose `lock_at` has just passed: every player still in (or eligible) with no pick gets a random team
that plays that round and that they haven't used or burned (`is_auto = true`). If they have none left, see rule 1b.
Picks become visible automatically through RLS — there is no reveal button to forget.

## 5. Rules engine (pure TypeScript, `src/engine/`, fully unit-tested)

The engine is a pure function: `(state before round, round fixtures + results, picks, predictions, jinxes, payments) →
(round_results, new burned teams, who is in)`. No Supabase calls inside it. The admin page runs it, shows a preview of
every outcome, and Eddie confirms before anything is written ("Settle").

Rules:
1. **Pick.** One team per round, to win. Win → through. Loss or draw → out.
2. **Lock.** First kick-off of the round. Pool locks: Fri 8pm Irish time. Knockout locks: first kick-off (set when announced).
3. **Team reuse (1).** Each team once per player for the whole comp. Round 1 picks (imported from the Form) count as used.
4. **Running out (1b).** No unused team available at a lock → out. Exception: if *every* player still in is stuck at the
   same lock, all of them get a clean slate (used teams reset) for that round.
5. **Missed pick (2).** No pick by the lock → random unused team playing that round. (Round 1: no pick = no entry.)
6. **What counts as a win.** Pool: 80-minute result, draw = loss. Knockouts: the team that goes through (extra time /
   kicking competition included) — use `matches.winner_team_id`.
7. **Postponed / abandoned.** Pick's match not completed that weekend → player survives and gets the team back (not used).
8. **Everyone out at once.** If every remaining player goes out in the same round, they all stay in.
9. **Winner / tiebreak (3).** Last one standing wins. If several survive the final: higher on the points table wins;
   still level, most exact scores; still level, split.
10. **Entry and payout (4, 5).** €10 entry. Payout 80% last man standing, 20% top of the points table. Pot = all confirmed payments.
11. **Buy-back (7).** One per player, pool stage only (last chance: Round 4 lock, Fri 15 Jan 2027 8pm). Pay €10 again →
    back in. Used teams stay used. Penalty: burn the most-picked team of the round they went out in, plus one more per
    round sat out (that round's most-picked; if already used/burned, the next most-picked down).
12. **Resurrection (8).** Round 4 only. Every player who's out may make one free pick, which must be an **away** team
    they haven't used. Win → back in for the knockouts; lose → stay out. Costs the same burns as a buy-back.
    In Round 4 a player takes the buy-back or the resurrection, not both; a player who already used their buy-back can
    still resurrect. Players knocked out *in* Round 4 have no way back.
13. **Points table (9).** Every player, in or out, predicts the score of the round's featured match. Wrong winner = 0.
    Right winner = 1; within 10 = 2; within 5 = 3; exact = 5. "Within" = |pred home − actual home| + |pred away − actual away|
    (predict 30–15, ends 27–17 → off by 5 → 3 points). Starts Round 1 (decided 15 Oct 2026).
14. **Jinx (10).** Each round, every player who's out names one survivor. If that survivor goes out that round, the
    jinxer gets 1 point toward the side pot. Jinx points do **not** count for the forfeit.
15. **Forfeit (11).** Fewest prediction points (jinx excluded) does the forfeit. Tied at the bottom: whoever went out of the
    main game first. The forfeit itself is still undecided (open).

Rulings (Eddie, Oct 2026 — answers to the engine's open questions, Q1–Q13):
- **1b is checked when a round opens**, not at the lock (`openRound()`). Every player still in has no unused team playing →
  clean slate: used *and* burned teams cleared for all of them from that round on (`rounds.clean_slate`, home-screen banner),
  and they pick normally. Only some stuck → those are out as soon as the round opens.
- **Rule 8** is judged only among players in at the start of the round who had a pick: stuck (1b) players aren't saved, and
  Round 4 resurrection results don't count towards it (winning resurrections come back alongside).
- **Jinx** lands when the target's pick loses or draws, whatever happens after (rule 8, buy-back). Postponed: no jinx.
- **Burn order:** each round's picked teams ranked by pick count, ties broken by one random draw made at settle and stored with
  the round (`rounds.tiebreak`, shown in results). A burn walks that list past anything used or burned, then the season-wide
  order (same draw); nothing left, no burn.
- **Resurrection:** postponed = still out, team back, no burns. Costs the same burns as a buy-back (this spec, not the rules doc's
  wording). A team the player would have burned if they came back is unavailable (also for a Round 4 buy-back).
- **No winner while a way back exists**: none before Round 4 settles; after that, the comp ends when one player is left.
- **Forfeit tie:** ranked by final exit (a buy-back undoes the first); never out ranks best; still tied, they all do it.
- **Featured knockout match:** official score incl. extra time, no kicking competition; level = a draw for predictions (allow
  draw predictions in knockouts).

Tests: one or more per rule, plus at least: 1b with exactly one player stuck vs all stuck; buy-back burns when the most-picked
team is already used; multiple rounds sat out; resurrection with a home team (rejected); buy-back + resurrection in the same
round (rejected); postponed match then the team is reused later; everyone out in the final; draw in pool vs knockout;
prediction scoring boundaries (off by exactly 5 and exactly 10); jinx on a player who survives.

## 6. Screens

- **Login:** email → 8-digit code (`signInWithOtp` with `shouldCreateUser: false`). Only pre-created players can sign in.
  Not magic links — on iPhone they open in the wrong browser and the session doesn't stick.
- **First login:** upload a photo (crop to a circle), pick a nickname and kit colour.
- **Home ("the field"):** a pitch with every player's avatar. Survivors on the pitch; knocked-out players in the stands.
  Countdown to the next lock. Pot total. Wall of the fallen (each out player + the team that knocked them out).
- **Pick:** the round's fixtures as cards. Used/burned teams greyed out, labelled with the round used. Tap = team takeover
  (7). Featured-match score prediction on the same screen. The featured match is a random server-side draw by an admin when
  the round opens (`draw_featured_match`, one-shot, no re-draws), revealed to each player with a tap-to-open raffle animation. Jinx picker if you're out. Change freely until the lock.
- **Reveal (after lock):** tap-to-flip cards, one per player, like a team-sheet announcement. Lists jinxes.
- **Results:** who's through, who's out, points table.
- **Pay:** "Pay €10" opens Eddie's revolut.me link (`https://revolut.me/eddie1apt`); "I've paid" creates a claimed payment. Paid badge once confirmed.
  Buy-back request flows the same way and shows pending until confirmed.
- **Rules:** in-app rules page, linking to the rules doc, including the note that the owner can see the raw database.
- **Admin (Eddie, Conn):** enter final scores (+ knockout winner, postponed flag), Settle (engine preview → confirm),
  confirm payments, manage rounds/lock times/featured match, import Round 1 CSV, export picks + results CSV after each settle.
- **Share cards:** render an image (canvas / `html-to-image`) for knockouts and round summaries in the losing team's colours,
  with a random banter line from a template bank (30–40 lines with `{name}`, `{team}`, `{margin}` slots). Share via the Web
  Share API straight into WhatsApp. No Claude API in v1.

## 7. Experience rules

- Every animation under 1.5 s and skippable. Respect `prefers-reduced-motion`.
- **Team takeover:** picking a team floods the screen in its primary/secondary, crest drops in, kit stripes wipe across, haptic thud.
- **Elimination:** red card slams in, screen shakes.
- **Jersey graphic:** drawn in SVG from team colours + pattern (no kit photos), so it can be recoloured and animated.
- **Haptics:** iPhones ignore `navigator.vibrate`. Use the hidden-switch trick (`<input type="checkbox" switch>`, Safari 17.4+)
  via `react-haptic`. Only fire from a user tap (pick, card flip). It's a tick, not a buzz — 2–3 quick ticks for a thud.
  It's a bonus layer: everything must work with haptics off.
- Sound on by default, with a mute toggle in the header and on the Me screen; respects the iPhone silent switch. Whistle + crowd roar synthesised with Web Audio (`src/sound.ts`) on picks, saves and settles only; no UI blips on tabs, pills or steppers.
- Link-preview image (Open Graph) so the URL looks good in WhatsApp.
- PWA manifest + icons; a 3-step "Add to Home Screen" guide for iPhone on first visit in Safari.

## 8. Data you have

- `teams.json` — all 24 clubs: slug, short name, primary, secondary, text colour (UI theming), crest path, and a `kit` object
  for the jersey graphic, researched from the 2026/27 kit launches (2025/26 or traditional where 26/27 wasn't findable):
  - `pattern`: plain | hoops | stripes | halves | quarters; `width`: broad | thin (hoops/stripes); `edge`: thin line colour
    between hoops (Northampton's gold)
  - `colours`: base colours in order; `trim`: collar and cuffs
  - `accent`: null | fade | tartan | side-panels | shoulders | band | chevrons, with `accentColours`
  - `jazz: true` = the accent was invented to liven up a plain shirt; `season` and `note` say where it came from
  - Reference renderer and preview: `scripts/kit-preview.py` → `docs/kit-check.html`. Port it to an SVG React component.
- `crests/` — 24 × 192px PNG crests from the official EPCR clubs page.
- Fixtures: Eddie has `champions-cup-26-27-fixtures.ics` (48 pool kick-offs, Irish time) from an earlier session; otherwise
  https://www.epcrugby.com/champions-cup/matches. Seed rounds 2–4 from it. Knockout fixtures get added when announced.

Season:

| Round | Weekend | Lock (Irish time) |
| --- | --- | --- |
| 1 | 16–18 Oct 2026 | Fri 16 Oct 8pm — first round on the app |
| 2 | 11–13 Dec | Fri 11 Dec 8pm |
| 3 | 8–10 Jan 2027 | Fri 8 Jan 8pm |
| 4 | 15–17 Jan | Fri 15 Jan 8pm (last buy-back; resurrection round) |
| R16 | 2–4 Apr | first kick-off, TBC |
| QF | 9–11 Apr | first kick-off, TBC |
| SF | 1–3 May | first kick-off, TBC |
| Final | 22 May | kick-off, TBC |

## 9. Build order

| Dates | Done means |
| --- | --- |
| Week 1 | Repo, CI deploy to Pages, schema + RLS, login, pick flow with server-side lock, reveal via RLS. Ugly but correct. |
| Week 2 | Admin: results, settle, payments, Round 1 import, CSV export. |
| Week 3 | Rules engine complete with tests for every rule in section 5. |
| Weeks 4–5 | Experience: field, team takeover, reveal, share cards, haptics, avatars. |
| Last week | Dry run of a fake round with Conn + two of the lads (incl. admin settle → unsettle → settle), fix, ship by Fri 4 Dec. |

Correctness before polish: no animation work until the lock, privacy and engine are proven.

## 10. Open — ask Eddie

- Players' names and emails (Conn is the second admin).
- The forfeit itself (outfit vs the dog cage) — display only.

## 11. Working rules

- Small commits; every schema change is a migration in the repo.
- Never weaken an RLS policy to make a screen work. If a screen needs data before the lock, it's a bug in the screen.
- Never commit secrets. Anon key + URL via GitHub Actions secrets only.
- Test lock behaviour against the server clock, including across the 25 Oct clock change.
- When a rule is ambiguous, stop and ask; don't invent one. Money depends on it.
