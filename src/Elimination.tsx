import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { crestUrl, supabase, type Match, type Round, type Team } from './lib/supabase'
import { koReason } from './live'

// Knocked out (docs/UI-REDESIGN.md §17): the round that put me out, and the red-card overlay that plays once.

export type Knockout = {
  round: Round
  team?: Team // no team: out under rule 1b (nothing left to pick)
  line: string // "Munster 20–20 Racing 92"
  reason: string // "a draw is a loss"
}

/** My latest elimination, or null if I've never gone out. */
export async function loadKnockout(me: string): Promise<Knockout | null> {
  const { data: outs } = await supabase
    .from('round_results')
    .select('round_id')
    .eq('player_id', me)
    .eq('outcome', 'out')
  if (!outs?.length) return null
  const { data: rounds } = await supabase
    .from('rounds')
    .select('*')
    .in(
      'id',
      outs.map((o) => o.round_id),
    )
    .order('number', { ascending: false })
    .limit(1)
    .returns<Round[]>()
  const round = rounds?.[0]
  if (!round) return null
  const [pick, matches, teams] = await Promise.all([
    supabase.from('picks').select('team_id').eq('round_id', round.id).eq('player_id', me).maybeSingle(),
    supabase.from('matches').select('*').eq('round_id', round.id).returns<Match[]>(),
    supabase.from('teams').select('*').returns<Team[]>(),
  ])
  const byId = new Map((teams.data ?? []).map((t) => [t.id, t]))
  const tid = pick.data?.team_id
  const m = (matches.data ?? []).find((m) => m.home_team_id === tid || m.away_team_id === tid)
  if (!tid || !m || m.home_score === null) return { round, line: '', reason: 'no team left to pick' }
  return {
    round,
    team: byId.get(tid),
    line: `${byId.get(m.home_team_id)?.name} ${m.home_score}–${m.away_score} ${byId.get(m.away_team_id)?.name}`,
    reason: koReason(m, tid, round.stage !== 'pool'),
  }
}

/** App-level: the overlay plays once per elimination, on the first open after the settle. */
export function EliminationOverlay({ me, seen }: { me: string; seen: number | null | undefined }) {
  const { ko, dismiss } = useElimination(me, seen)
  return <KnockedOut ko={ko} onDone={dismiss} />
}

/** Shown while `seen < round`, then stored on the player. */
function useElimination(me: string, seen: number | null | undefined) {
  const [ko, setKo] = useState<Knockout | null>(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    loadKnockout(me).then(setKo)
  }, [me])
  const show = !!ko && !done && ko.round.number > (seen ?? 0)
  const dismiss = () => {
    setDone(true)
    void supabase.from('players').update({ seen_elimination_round: ko!.round.number }).eq('id', me)
  }
  return { ko: show ? ko : null, dismiss }
}

/** Full-screen red card. Silent on its own (no tap yet); Replay plays the sound from its tap. Tap dismisses. */
export function KnockedOut({ ko, onDone }: { ko: Knockout | null; onDone: () => void }) {
  const still = useReducedMotion()
  useEffect(() => {
    if (!ko) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [ko, onDone])
  if (!ko) return null
  return (
    <button
      type="button"
      onClick={onDone}
      aria-label={`You're out. ${ko.line} ${ko.reason}. Tap to continue.`}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-[18px] overflow-hidden px-7 text-center text-white ${still ? '' : 'ko'}`}
      style={{ background: 'radial-gradient(circle at 50% 38%, #7a1020, #24060e 72%)' }}
    >
      <span className="ko-shake flex flex-col items-center gap-[22px]">
        <span
          aria-hidden
          className="ko-card h-[178px] w-32 rotate-[-8deg] rounded-[14px] bg-[linear-gradient(160deg,#ff3b4a,#c8102e)] shadow-[0_30px_70px_rgba(0,0,0,.55),inset_0_0_0_3px_rgba(255,255,255,.22)]"
        />
        <span className="ko-title disp text-[68px] leading-[.88] font-extrabold uppercase">
          You’re
          <br />
          out
        </span>
      </span>
      {ko.team && (
        <span className="ko-sub flex items-center gap-2.5 rounded-full bg-black/35 py-2 pr-3.5 pl-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white grayscale">
            <img src={crestUrl(ko.team)} alt="" className="h-6 w-6 object-contain" />
          </span>
          {ko.line}
        </span>
      )}
      <span className="ko-sub2 max-w-[280px] text-[15px] leading-[1.4] opacity-85">
        {ko.reason === 'a draw is a loss' && 'A draw is a loss. '}
        {/* Rules 11/12: buy-back and resurrection only exist up to Round 4; out in Round 4 or later is final. */}
        {ko.round.number < 4
          ? 'You’re in the stands, but there are still ways back in. Tap to see them.'
          : 'You’re in the stands. You’re still playing for the 20%.'}
      </span>
    </button>
  )
}
