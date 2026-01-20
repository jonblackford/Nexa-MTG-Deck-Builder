import React, { useMemo, useState } from 'react'
import { scryfallImage, scryfallPriceUSD, formatMoney, categorizeByType } from './helpers'

function normalizeQuery(raw) {
  const q = (raw || '').trim()
  if (!q) return ''
  if (!/\bgame:/.test(q)) return `${q} game:paper`
  return q
}

function findColumnId(columns, columnName) {
  const hit = (columns || []).find(c => c.name === columnName)
  return hit?.id || (columns?.[0]?.id ?? null)
}

function isCommanderCandidate(card) {
  const t = (card?.type_line || '').toLowerCase()
  if (!t.includes('legendary')) return false
  if (t.includes('creature')) return true
  if (t.includes('planeswalker')) return true
  return false
}

export default function SearchPanel({ columns, commanderColumnId, onAddCard }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])
  const [err, setErr] = useState('')

  const normalized = useMemo(() => normalizeQuery(q), [q])

  async function runSearch(e) {
    e?.preventDefault?.()
    setErr('')
    if (!normalized) {
      setResults([])
      return
    }
    setBusy(true)
    try {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(normalized)}&unique=cards&order=name`
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.details || 'Scryfall search failed')
      setResults(json?.data || [])
    } catch (e2) {
      setErr(e2?.message ?? String(e2))
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  async function addToDefault(card) {
    setErr('')
    try {
      const colName = categorizeByType(card)
      const colId = findColumnId(columns, colName)
      await onAddCard?.(card, colId)
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

  async function setCommander(card) {
    setErr('')
    try {
      if (!commanderColumnId) throw new Error('Commander column not found')
      await onAddCard?.(card, commanderColumnId, { setAsCommander: true })
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

  function closeModal() {
    setOpen(false)
    setBusy(false)
    setErr('')
  }

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Search</h3>
        <span className="muted" style={{ fontSize: 12 }}>Powered by Scryfall</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => setOpen(true)}>Search cards</button>
        <button className="btn" type="button" onClick={() => { setQ(''); setResults([]); setErr('') }}>Clear</button>
      </div>

      {open ? (
        <div className="modalBackdrop" onMouseDown={closeModal}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h3 style={{ margin: 0 }}>Search cards</h3>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Tip: try <code>sol ring</code>, <code>type:creature o:draw</code>, <code>c&gt;=wubrg commander</code>
                </div>
              </div>
              <button className="btn" onClick={closeModal}>Close</button>
            </div>

            <form onSubmit={runSearch} style={{ marginTop: 10 }}>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn primary" disabled={busy || !normalized}>{busy ? 'Searching…' : 'Search'}</button>
                <button className="btn" type="button" onClick={() => { setQ(''); setResults([]); setErr('') }}>Clear</button>
              </div>
            </form>

            {err ? <div style={{ marginTop: 12 }} className="tag danger">{err}</div> : null}

            <div style={{ marginTop: 12 }} className="results">
              {results.map(card => {
                const img = scryfallImage(card)
                const price = scryfallPriceUSD(card)
                const canCmdr = isCommanderCandidate(card)
                return (
                  <div className="resultRow" key={card.id}>
                    {img ? <img className="resultImg" src={img} alt={card.name} /> : <div className="resultImg" />}
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 800, lineHeight: 1.1 }}>{card.name}</div>
                        {price ? <span className="tag">${formatMoney(price)}</span> : <span className="muted" style={{ fontSize: 12 }}>no price</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {card.mana_cost || ''} {card.type_line ? `• ${card.type_line}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button className="btn" type="button" onClick={() => addToDefault(card)}>Add</button>
                        {canCmdr ? (
                          <button className="btn" type="button" onClick={() => setCommander(card)}>Set commander</button>
                        ) : null}
                        <span className="muted" style={{ fontSize: 12 }}>Default: {categorizeByType(card)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {normalized && !busy && results.length === 0 && !err ? (
                <div className="muted">No results.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
