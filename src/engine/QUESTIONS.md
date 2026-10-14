# Rules engine: open questions for Eddie

Where the spec doesn't settle a case, the engine throws `NeedsRuling` with the question number and won't guess.
The Settle preview shows that error, so a round with one of these cases can't be settled until it's answered.
Each one has an `it.todo` in the tests. Reply with the option letter (or your own answer).

| # | Case | Options |
| --- | --- | --- |
| Q1 | **Everyone still in is stuck (1b).** Clean slate for all, but the lock has already passed with no picks. | a) Re-open picks for them after the lock from all teams (deadline?), random if none. b) Round counts as a pass: all survive, used teams reset from next round. c) Random team for each from a full reset, at the lock. |
| Q2 | **Rule 8 vs 1b.** Everyone goes out in the same round, and one of them went out because they had no team left. | a) All stay in, including the stuck player. b) Stuck player is out; the rest stay in. |
| Q3 | **Jinx vs rule 8.** A jinx target loses but rule 8 keeps everyone in. | a) Jinx lands (they lost). b) Doesn't land (they didn't go out). |
| Q4 | **Tie for most-picked** when choosing a buy-back/resurrection burn. Likely with 11 players. | a) Burn all tied teams. b) Burn one, chosen by the player. c) Burn one, chosen by the admin. d) A fixed order (e.g. alphabetical). |
| Q5 | **Nothing left to burn:** every team picked that round is already used/burned by the player. | a) No burn for that round. b) Burn an unpicked team (which?). |
| Q6 | **Resurrection pick's match postponed/abandoned.** | a) Back in (like rule 7 survival). b) Stays out. c) Another resurrection go (but there is no later round). |
| Q7 | **Resurrection cost.** CLAUDE.md says "the same burns as a buy-back" (most-picked of the round they went out in + one per round sat out). The rules doc says "the same as a buy-back: one team for every round sat out" — one fewer. **Engine follows CLAUDE.md for now**; confirm. | a) CLAUDE.md (current). b) Rules doc: sat-out rounds only. |
| Q8 | **Resurrection team is one that would be burned** (e.g. they come back with the most-picked team of the round they went out in). | a) Invalid pick: burns apply before the pick (as for a buy-back). b) Valid: the pick counts as used, burn the next one down. |
| Q9 | **Rule 8 in Round 4 while a resurrection wins.** Everyone still in loses; an out player comes back by resurrection. | a) Rule 8 still applies: losers stay in, plus the resurrected player. b) Rule 8 doesn't apply: the losers are out, the resurrected player is the one left. |
| Q10 | **One player left before Round 4** (buy-backs still open). | a) They win now. b) Game carries on to Round 4; others can still buy back. |
| Q11 | **Forfeit tiebreak for a bought-back player:** "went out first" = their first exit or their final exit? (Only throws when the answer differs.) | a) First exit. b) Final exit. |
| Q12 | **Featured knockout match level after extra time** (kicking competition). Who's the "winner" for prediction points? | a) The team that went through. b) Treat as a draw. |
| Q13 | **Forfeit still tied** after "went out first" (same round, or both never out). The engine returns all of them. | a) Both do it. b) Admin decides. c) Some further tiebreak. |

## Literal readings taken (shout if any are wrong)

- Rule 8: players kept in get outcome `through`, and the team they lost with counts as used.
- Rules 1b and 8 count buy-back players as "still in"; Round 4 resurrection pickers don't (they're out until they win).
- A jinx on a survivor whose match is postponed doesn't land (they didn't go out).
- Calling a draw when it's a draw counts as the right winner (then the "within" bands apply).
- No prediction, no featured match, or a postponed featured match = 0 points.
- The points table (20% prize, final tiebreak) is prediction + jinx points; ties go to most exact scores, then split.
- A buy-back counts for the first round whose lock is after the payment was *claimed*; Eddie confirms it before settling.
- "Most-picked" counts every pick in that round, auto-picks included.
- Payout is in cents; on a pot that isn't whole euros, the odd cent goes to the points prize.

## Not rules, but blocking buy-back and resurrection in the app

- `make_pick` and the lock cron require `alive()`, so a bought-back or resurrecting player can't pick yet,
  and a bought-back player with no pick won't get an auto-pick. The engine treats a missing pick as an error.
- Buy-back burns must be greyed out on the pick screen before the lock: call `reentryBurns()` there
  (the engine also returns them at settle as `newBurnedTeams`). `make_pick` should check them too.
- Resurrection picks need an RPC path that allows out players, Round 4 only, away teams only.
