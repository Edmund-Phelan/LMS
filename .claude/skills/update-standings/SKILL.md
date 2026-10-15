---
name: update-standings
description: Monday update of the Champions Cup pool tables in the BBB LMS app (src/data/standings.json), cross-checked, tested and pushed. Use for "update the standings", "Monday update", /update-standings.
---

# Update the pool standings

The app has no live feed (API-Sports' free plan can't see 2026/27). Standings are a JSON file in the repo, updated by hand
after each match weekend and deployed by pushing to `main`. Results are NOT part of this: admins enter scores and settle in
the app's Admin page.

1. `git switch main && git pull`.
2. `node --experimental-strip-types --no-warnings scripts/standings.ts` (ESPN's public standings JSON, no key).
   If it fails or prints an `UNKNOWN` slug, edit `src/data/standings.json` by hand from
   https://www.epcrugby.com/champions-cup/standings (one row per team, in the official order).
3. Cross-check with a web search of the official standings (epcrugby.com, or Planet Rugby / RTÉ): every pool's order,
   points and played count. If anything differs, the official site wins; fix the file by hand and say what differed.
   Never re-rank teams yourself.
4. `npm test` (the `standings.json` test checks pools, sums and points) and `npm run build`.
5. Show Eddie the diff of `src/data/standings.json` as a short table per pool, then, once he says OK, commit
   ("Standings after Round N") and push to `main`. The Pages workflow deploys it.
6. Optional: list the weekend's scores from the same search next to what's in the app's matches (read-only, via the
   Supabase MCP `select`) and flag any difference to Eddie. Never write to `matches`.
