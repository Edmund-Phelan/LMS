import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './Login'
import AdminPage from './AdminPage'
import RoundPage, { CurrentRound } from './RoundPage'
import Profile, { type Me } from './Profile'
import InstallGuide from './InstallGuide'
import MePage from './MePage'
import TablePage from './TablePage'
import PoolsPage from './PoolsPage'
import RulesPage from './RulesPage'
import { Pushed } from './Shell'
import { EliminationOverlay } from './Elimination'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const uid = session?.user.id
  const loadMe = useCallback(() => {
    if (uid)
      supabase
        .from('players')
        .select('id, name, nickname, avatar_url, kit_colour, is_admin, seen_elimination_round')
        .eq('id', uid)
        .maybeSingle<Me>()
        .then(({ data }) => setMe(data))
  }, [uid])
  useEffect(loadMe, [loadMe])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session)
    return (
      <>
        <InstallGuide />
        <Login />
      </>
    )
  if (me === undefined) return null
  if (!me) return <p className="p-6">You’re signed in but not on the player list. Ask Eddie.</p>
  if (!me.nickname) return <Profile me={me} onSaved={loadMe} /> // first login
  return (
    <>
      <EliminationOverlay me={me.id} seen={me.seen_elimination_round} />
      <Routes>
        <Route path="/round" element={<CurrentRound />} />
        <Route path="/round/:number" element={<RoundPage me={session.user.id} />} />
        <Route path="/pools" element={<PoolsPage me={session.user.id} />} />
        <Route path="/table" element={<TablePage me={session.user.id} />} />
        <Route path="/me" element={<MePage me={me} />} />
        <Route
          path="/me/edit"
          element={
            <Pushed title="Edit profile">
              <Profile me={me} onSaved={() => (loadMe(), history.back())} />
            </Pushed>
          }
        />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/admin/:number?" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/round" replace />} />
      </Routes>
    </>
  )
}
