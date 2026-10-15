// Rules page copy (docs/UI-REDESIGN.md §10), verbatim from docs/ui-prototype/Rules.dc.html, which was written from the
// rules doc. Edit here; the page renders whatever is in this list.
import { predictionPoints } from '../engine/engine'

export type Section = {
  id: string
  title: string
  sub: string
  paras: { lead: string; text: string }[]
  isMoney?: boolean
  isPoints?: boolean
  isLocks?: boolean
  isOpenRule?: boolean
}

export const RULES_DOC = 'https://claude.ai/code/artifact/a99ed3c3-a9ae-47f7-9847-4b3f50510d2a'

export const SECTIONS: Section[] = [
  {
    id: 's1',
    title: 'The pick and the lock',
    sub: 'One team, to win, before first kick-off',
    paras: [
      { lead: 'The pick.', text: 'One team per round, to win. A win puts you through. A loss or a draw puts you out.' },
      {
        lead: 'The lock.',
        text: 'Picks close at the round’s first kick-off. Change your pick as often as you like before then; the latest one counts.',
      },
      {
        lead: 'Private picks.',
        text: 'Nobody sees anyone’s pick before the lock, admins included. At the lock every pick is revealed.',
      },
    ],
  },
  {
    id: 's2',
    title: 'Each team once',
    sub: 'And what happens if you run out',
    paras: [
      {
        lead: 'Team reuse.',
        text: 'Each team once for the whole comp. Plan ahead: your semi-final pick could be in the final.',
      },
      {
        lead: 'Running out.',
        text: 'No unused team playing at a lock means you’re out. If everyone still in is stuck at once, it’s a clean slate for all of them.',
      },
    ],
  },
  {
    id: 's3',
    title: 'Missed pick',
    sub: 'Round 1 is different',
    paras: [
      { lead: 'From Round 2.', text: 'No pick by the lock gets you a random team you haven’t used.' },
      { lead: 'Round 1.', text: 'No pick means no entry. And no payment means your pick doesn’t count.' },
    ],
  },
  {
    id: 's4',
    title: 'Wins, draws and postponements',
    sub: '80 minutes in the pools',
    paras: [
      { lead: 'Pool stage.', text: 'The 80-minute result. A draw counts as a loss.' },
      { lead: 'Knockouts.', text: 'The team that goes through, extra time or kicking competition included.' },
      {
        lead: 'Postponed or abandoned.',
        text: 'If your team’s match isn’t completed that weekend, you survive and get the team back.',
      },
      {
        lead: 'Everyone out at once.',
        text: 'If every remaining player goes out in the same round, they all stay in.',
      },
    ],
  },
  {
    id: 's5',
    title: 'Winning',
    sub: 'And the tiebreak',
    paras: [
      {
        lead: 'Last one standing',
        text: 'takes 80% of the pot. Nobody can win while there’s still a way back in, so not before Round 4 is settled.',
      },
      {
        lead: 'Several survive the final?',
        text: 'Higher on the points table wins. Still level: most exact scores. Still level: split.',
      },
    ],
  },
  {
    id: 's6',
    title: 'Money',
    sub: '€10 entry, 80/20 payout',
    isMoney: true,
    paras: [
      {
        lead: 'Entry.',
        text: '€10 on Revolut with “LMS” in the note, before the Round 1 lock. Tap Pay in the app, then “I’ve paid”.',
      },
      { lead: 'Proof.', text: 'An admin confirms it and a Paid mark shows next to your name for everyone.' },
      { lead: 'The pot.', text: 'Kept apart from Eddie’s own money. The running total is always on the home screen.' },
    ],
  },
  {
    id: 's7',
    title: 'Buy-back',
    sub: 'The paid way back, pool stage only',
    paras: [
      {
        lead: 'One per person.',
        text: 'Pay €10 again before the next lock and you’re back in. Last chance: the Round 4 lock, Fri 15 Jan, 8pm.',
      },
      {
        lead: 'The cost.',
        text: 'Used teams stay used. You also lose the most-picked team of the round you went out in, plus one more for every round you sat out.',
      },
    ],
  },
  {
    id: 's8',
    title: 'Resurrection',
    sub: 'The free gamble, Round 4 only',
    paras: [
      {
        lead: 'One pick.',
        text: 'Everyone who’s out gets one free pick in Round 4. It must be an away team you haven’t used.',
      },
      {
        lead: 'Win and you’re back',
        text: 'for the knockouts, at the same team cost as a buy-back. Lose and you stay out.',
      },
      {
        lead: 'Either or.',
        text: 'In Round 4 it’s a buy-back or a resurrection, not both. Knocked out in Round 4 itself: no way back.',
      },
    ],
  },
  {
    id: 's9',
    title: 'Points table',
    sub: 'Everyone plays, in or out',
    isPoints: true,
    paras: [
      {
        lead: 'Each round',
        text: 'everyone predicts the score of one featured match, drawn at random when picks open.',
      },
      {
        lead: 'Scoring.',
        text: 'Right winner 1. Within 10 points 2. Within 5 points 3. Exact 5. Wrong winner 0. “Within” adds how far off you were on each team’s score.',
      },
    ],
  },
  {
    id: 's10',
    title: 'Jinx',
    sub: 'Something to do once you’re out',
    paras: [
      {
        lead: 'Each round',
        text: 'every player who’s out names one survivor. If that survivor goes out, you get 1 point toward the side pot.',
      },
      {
        lead: 'Not for the forfeit.',
        text: 'Jinx points don’t count toward the forfeit, so survivors aren’t punished for never getting to jinx.',
      },
    ],
  },
  {
    id: 's11',
    title: 'The forfeit',
    sub: 'Fewest prediction points',
    isOpenRule: true,
    paras: [
      {
        lead: 'Who.',
        text: 'Fewest prediction points at the end does it. Tied at the bottom: whoever went out of the main game first.',
      },
      {
        lead: 'What.',
        text: 'Still to be decided: the group picks his outfit for the next night out, or the dog cage.',
      },
    ],
  },
  { id: 's12', title: 'Lock times', sub: 'Irish time', isLocks: true, paras: [] },
  {
    id: 's13',
    title: 'The fine print',
    sub: 'The record, rule changes, privacy',
    paras: [
      {
        lead: 'The record.',
        text: 'The app is the official record of picks, results, payments and who’s in. WhatsApp is for the banter.',
      },
      {
        lead: 'Rule changes.',
        text: 'Only between rounds, by majority vote. Anything not covered is the admin’s call.',
      },
      {
        lead: 'Privacy.',
        text: 'The app hides picks from everyone until the lock, admins too. Eddie owns the database, so in principle he could look at the raw data; he won’t.',
      },
    ],
  },
]

/** The calculator's result: points straight from the engine (so the page can't disagree with settle), plus why. */
export function explainPoints(ph: number, pa: number, ah: number, aa: number) {
  const n = predictionPoints({ homeScore: ph, awayScore: pa }, { homeScore: ah, awayScore: aa })
  const off = Math.abs(ph - ah) + Math.abs(pa - aa)
  const why =
    n === 0
      ? 'Wrong winner, so nothing, however close the score.'
      : n === 5
        ? 'Exact score. The big one.'
        : n === 3
          ? `Right winner, off by ${off} in total. Within 5.`
          : n === 2
            ? `Right winner, off by ${off} in total. Within 10.`
            : `Right winner, but off by ${off}.`
  return { n, why }
}
