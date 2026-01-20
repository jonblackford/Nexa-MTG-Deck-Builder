import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function ResetPasswordPage() {
  const [session, setSession] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
  }, [])

  const canSubmit = useMemo(() => password.length >= 6, [password])

  async function setNewPassword(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg('Password updated. Sending you to the dashboard…')
      setTimeout(() => navigate('/app'), 800)
    } catch (err) {
      setMsg(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="grid" style={{gridTemplateColumns:'1fr',maxWidth:900,margin:'0 auto'}}>
        <div className="panel">
          <h2 style={{marginTop:0}}>Reset password</h2>
          {!session ? (
            <>
              <p className="muted">Open the reset link from your email in this same browser. If you already did, wait a moment and refresh.</p>
              <Link className="btn" to="/login">Back to login</Link>
            </>
          ) : (
            <>
              <p className="muted">Set a new password for <b>{session.user.email}</b>.</p>
              <form onSubmit={setNewPassword}>
                <label className="muted" style={{display:'block',marginBottom:6}}>New password</label>
                <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="6+ characters" />
                <div style={{marginTop:12}}>
                  <button className="btn primary" disabled={busy || !canSubmit}>{busy ? 'Working…' : 'Update password'}</button>
                </div>
              </form>
              {msg ? <div style={{marginTop:12}} className="tag">{msg}</div> : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
