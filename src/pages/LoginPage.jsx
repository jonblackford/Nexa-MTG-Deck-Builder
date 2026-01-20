import React, { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const canSubmit = useMemo(() => email.includes('@') && password.length >= 6, [email, password])

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname + '#/app',
          },
        })
        if (error) throw error
        setMsg('Check your email to confirm your account (if confirmations are enabled in Supabase Auth).')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setMsg(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    setMsg('')
    if (!email.includes('@')) {
      setMsg('Enter your email first, then click “Forgot password?”.')
      return
    }
    setBusy(true)
    try {
      const redirectTo = window.location.origin + window.location.pathname + '#/reset'
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setMsg('Password reset email sent. Open the link, then set a new password.')
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
          <h2 style={{marginTop:0}}>Welcome</h2>
          <p className="muted" style={{marginTop:-6}}>
            Sign in to create Commander decks, drag-and-drop cards into categories, balance mana, and check for combos.
          </p>

          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <button className={'btn ' + (mode==='login'?'primary':'')} onClick={() => setMode('login')} type="button">Log in</button>
            <button className={'btn ' + (mode==='signup'?'primary':'')} onClick={() => setMode('signup')} type="button">Create account</button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="muted" style={{display:'block',marginBottom:6}}>Email</label>
            <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />

            <div style={{height:10}} />

            <label className="muted" style={{display:'block',marginBottom:6}}>Password</label>
            <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="6+ characters" />

            <div style={{display:'flex',gap:8,marginTop:12,alignItems:'center'}}>
              <button className="btn primary" disabled={busy || !canSubmit}>
                {busy ? 'Working…' : (mode==='signup' ? 'Create account' : 'Log in')}
              </button>
              <button className="btn" type="button" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            </div>
          </form>

          {msg ? (
            <div style={{marginTop:12}} className="tag">{msg}</div>
          ) : null}

          <hr />
          <div className="muted" style={{fontSize:13}}>
            <div><b>Supabase Auth</b> controls who can see which decks. Make sure your database RLS is enabled (included in the SQL file).</div>
          </div>
        </div>
      </div>
    </div>
  )
}
