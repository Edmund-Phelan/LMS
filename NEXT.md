# NEXT.md — work packets (updated 15 Oct, late)

Read CLAUDE.md first; it is the spec. **Change from the spec: Round 1 runs on the app, not the Google Form.**
Round 1 picks lock **Fri 16 Oct 2026, 8pm Irish time** (first kick-off). That is the deadline for packets 1–4.
Packets are in priority order. Do one per session. "Done means" is the acceptance test.

Ground rules: the lock, pick privacy and money correctness come first: packets 1–2 before any polish.
Every schema change is a migration with a DB test. Never weaken RLS to make a screen work.

---

## Before Friday — Eddie (not Claude Code)
- Login emails: done (Gmail SMTP, 8-digit code), 15 Oct.
- Players: send Claude Code the list (name, nickname, email; Conn is admin). It creates the auth users and player rows via the
  Supabase MCP.
- Decide: does the points table / featured match start in Round 1 now that it's on the app? (Rules doc says Round 2.)

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
