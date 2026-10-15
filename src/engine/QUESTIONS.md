# Rules engine: still open

Q1–Q13 are answered; the rulings are in CLAUDE.md §5 and each has a test named after it.

## Literal readings taken (shout if any are wrong)

- Rule 8: players kept in get outcome `through`, and the team they lost with counts as used.
- Buy-back players count as "in at the start of the round" for rule 8.
- Calling a draw when it's a draw counts as the right winner (then the "within" bands apply).
- No prediction, no featured match, or a postponed featured match = 0 points.
- The points table (20% prize, final tiebreak) is prediction + jinx points; ties go to most exact scores, then split.
- A buy-back counts for the first round whose lock is after the payment was _claimed_; Eddie confirms it before settling.
- "Most-picked" counts every pick in that round, auto-picks included.
- Payout is in cents; on a pot that isn't whole euros, the odd cent goes to the points prize.

## Not rules, but needed in the app before buy-backs and resurrections work

- `make_pick` and the lock cron require `alive()`, so a bought-back or resurrecting player can't pick yet,
  and a bought-back player with no pick won't get an auto-pick. The engine treats a missing pick as an error.
- Pick screens must show `reentryBurns()` as unavailable before the lock (Q8), and `make_pick` must refuse them.
- Resurrection picks need an RPC path that allows out players, Round 4 only, away teams only.
- Admin page: run `openRound()` when a round's fixtures are loaded (store `clean_slate`, show who's out with no teams
  left); draw `tiebreak` (a shuffle of every team id) at settle; Round 1's import needs a draw too.
- Predictions UI must allow draws in knockouts (Q12).
