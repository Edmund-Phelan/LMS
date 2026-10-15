import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './Login'
import AdminPage from './AdminPage'
import RoundPage, { CurrentRound } from './RoundPage'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />
  return (
    <Routes>
      <Route path="/" element={<CurrentRound />} />
      <Route path="/round/:number" element={<RoundPage me={session.user.id} />} />
      <Route path="/admin/:number?" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
