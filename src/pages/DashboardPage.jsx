import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DeckBoard from '../ui/DeckBoard.jsx'

async function ensureDefaultColumns(deckId, userId) {
  const { data: existing, error } = await supabase
    .from('deck_columns')
    .select('id')
    .eq('deck_id', deckId)
    .limit(1)

  if (error) throw error
  if (existing && existing.length > 0) return

  const names = ['Commander','Creatures','Instants','Sorceries','Artifacts','Enchantments','Planeswalkers','Lands','Maybe']
  const rows = names.map((name, idx) => ({
    deck_id: deckId,
    user_id: userId,
    name,
    column_order: idx,
  }))

  const { error: insErr } = await supabase.from('deck_columns').insert(rows)
  if (insErr) throw insErr
}

function DeckList({ session }) {
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  const userId = session.user.id

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('decks')
      .select('id,name,format,created_at,updated_at')
      .order('updated_at', { ascending: false })

    if (error) {
      setMsg(error.message)
      setDecks([])
    } else {
      setMsg('')
      setDecks(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('decks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'decks', filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function createDeck() {
    if (!name.trim()) return
    setBusy(true)
    setMsg('')
    try {
      const { data, error } = await supabase
        .from('decks')
        .insert({ user_id: userId, name: name.trim(), format: 'commander' })
        .select('id')
        .single()

      if (error) throw error
      await ensureDefaultColumns(data.id, userId)
      setName('')
      navigate(`/app/deck/${data.id}`)
    } catch (err) {
      setMsg(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteDeck(deckId) {
    if (!confirm('Delete this deck? This cannot be undone.')) return
    const { error } = await supabase.from('decks').delete().eq('id', deckId)
    if (error) setMsg(error.message)
  }

  return (
    <div className="grid" style={{gridTemplateColumns:'1fr'}}>
      <div className="panel">
        <h2 style={{marginTop:0}}>Your decks</h2>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input className="input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="New deck name (ex: Atraxa Superfriends)" style={{maxWidth:420}} />
          <button className="btn primary" onClick={createDeck} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create deck'}</button>
        </div>
        {msg ? <div style={{marginTop:12}} className="tag">{msg}</div> : null}
      </div>

      <div className="panel">
        {loading ? (
          <div className="muted">Loading…</div>
        ) : decks.length === 0 ? (
          <div className="muted">No decks yet. Make one above.</div>
        ) : (
          <div style={{display:'grid',gap:10}}>
            {decks.map(d => (
              <div key={d.id} className="row" style={{alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{d.name}</div>
                  <div className="muted" style={{fontSize:12}}>Format: {d.format || 'commander'}</div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn" onClick={() => navigate(`/app/deck/${d.id}`)}>Open</button>
                  <button className="btn danger" onClick={() => deleteDeck(d.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DeckRoute({ session }) {
  const { id } = useParams()
  return <DeckBoard session={session} deckId={id} />
}

export default function DashboardPage({ session }) {
  return (
    <div className="container">
      <Routes>
        <Route path="/" element={<DeckList session={session} />} />
        <Route path="deck/:id" element={<DeckRoute session={session} />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </div>
  )
}
