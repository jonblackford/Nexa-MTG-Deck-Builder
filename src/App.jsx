import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

function useSupabaseSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      sub?.subscription?.unsubscribe()
    }
  }, [])

  return { session, loading }
}

function Protected({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { session, loading } = useSupabaseSession()
  const navigate = useNavigate()

  const userEmail = useMemo(() => session?.user?.email ?? '', [session])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="container">
        <div className="topbar">
          <div className="brand"><div className="logo" /><h1>Commander Deckbuilder</h1></div>
        </div>
        <div style={{ marginTop: 14 }} className="panel">Loading…</div>
      </div>
    )
  }

  return (
    <>
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="logo" />
            <h1>Commander Deckbuilder</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {session ? (
              <>
                <span className="tag">{userEmail}</span>
                <button className="btn" onClick={() => navigate('/app')}>Dashboard</button>
                <button className="btn" onClick={signOut}>Log out</button>
              </>
            ) : (
              <Link className="btn" to="/login">Log in</Link>
            )}
          </div>
        </div>
      </div>

      <Routes>
        <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route
          path="/app/*"
          element={
            <Protected session={session}>
              <DashboardPage session={session} />
            </Protected>
          }
        />
        <Route path="/" element={<Navigate to={session ? '/app' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
