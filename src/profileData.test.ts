import { expect, it } from 'vitest'
import type { Match, Pick, Round, Team } from './lib/supabase'
import { predictionRows, road } from './profileData'

const NOW = Date.parse('2026-12-10T12:00:00Z')
const round = (id: number, lock: string, settled: boolean, featured: number | null = null): Round => ({
  id,
  number: id,
  stage: 'pool',
  name: `Round ${id}`,
  lock_at: lock,
  featured_match_id: featured,
  featured_drawn_at: null,
  settled_at: settled ? lock : null,
  clean_slate: false,
  tiebreak: null,
})
const rounds = [
  round(1, '2026-10-16T19:00:00Z', true, 10),
  round(2, '2026-12-11T20:00:00Z', false), // current, not locked yet
  round(3, '2027-01-08T20:00:00Z', false),
  round(4, '2027-01-15T20:00:00Z', false),
]
const team = (id: number, name: string) => ({ id, name }) as Team
const teams = new Map(
  [team(1, 'Exeter'), team(2, 'Toulouse'), team(3, 'Munster'), team(4, 'Racing')].map((t) => [t.id, t]),
)
const match = (id: number, r: number, h: number, a: number, hs: number | null, as: number | null) =>
  ({ id, round_id: r, home_team_id: h, away_team_id: a, home_score: hs, away_score: as, status: 'completed' }) as Match
const matches = [match(10, 1, 2, 1, 38, 12), match(20, 2, 3, 4, null, null)]
const pick = (r: number, t: number): Pick => ({ round_id: r, player_id: 'x', team_id: t, is_auto: false })

it('never shows the current round’s pick before its lock, even if the row is passed in', () => {
  const tiles = road(
    rounds,
    [pick(1, 2), pick(2, 3)],
    [{ round_id: 1, outcome: 'through', prediction_points: 0, exact_score: false }],
    matches,
    teams,
    true,
    NOW,
  )
  expect(tiles.map((t) => t.kind)).toEqual(['pick', 'hidden', 'future', 'future'])
  expect(tiles[0]).toMatchObject({ team: { name: 'Toulouse' }, line: 'Beat Exeter 38–12', out: false })
  expect(JSON.stringify(tiles)).not.toContain('Munster')
})

it('locked but unsettled shows "Locked in"; the exit round is red; later rounds are in the stands', () => {
  const after = Date.parse('2026-12-12T12:00:00Z') // Round 2 locked, not settled
  const lost = [{ round_id: 1, outcome: 'out', prediction_points: 0, exact_score: false }]
  const exeter = [match(10, 1, 2, 1, 38, 12)]
  expect(road(rounds, [pick(1, 1)], lost, exeter, teams, false, after)).toMatchObject([
    { kind: 'pick', label: 'R1 · OUT', out: true, line: 'Lost 12–38 to Toulouse' },
    { kind: 'stands' },
    { kind: 'future' },
    { kind: 'future' },
  ])
  expect(road(rounds, [pick(1, 2), pick(2, 3)], [], matches, teams, true, after)[1]).toMatchObject({
    line: 'Locked in',
  })
})

it('prediction rows: settled rounds only', () => {
  const res = [{ round_id: 1, outcome: 'through', prediction_points: 3, exact_score: false }]
  const preds = [
    { round_id: 1, home_score: 30, away_score: 15 },
    { round_id: 2, home_score: 20, away_score: 20 },
  ]
  expect(predictionRows(rounds, preds, res, matches, teams)).toEqual([
    { label: 'R1', fixture: 'Toulouse v Exeter', said: '30–15', finished: '38–12', points: 3, exact: false },
  ])
})
