import React, { useMemo, useState } from 'react'
import {
  scryfallImage,
  scryfallPriceUSD,
  formatMoney,
  categorizeByType,
  isCommanderEligible,
} from './helpers'

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

export default function SearchModal({ open, onClose, columns, onAddCard, onSetCommander }) {
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

  async function add(card) {
    const colName = categorizeByType(card)
    const colId = findColumnId(columns, colName)
    await onAddCard?.(card, colId)
  }

  async function setCommander(card) {
    await onSetCommander?.(card)
  }

  if (!open) return null

  return (
    <div className="modalBackdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose?.()
    }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modalHeader">
          <div>
            <h3>Search cards</h3>
            <div className="muted" style={{ fontSize: 12 }}>Powered by Scryfall</div>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <form onSubmit={runSearch}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Try: “sol ring”, “type:creature o:draw”, “c>=wubrg commander”'
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={busy || !normalized}>{busy ? 'Searching…' : 'Search'}</button>
            <button className="btn" type="button" onClick={() => { setQ(''); setResults([]); setErr('') }}>Clear</button>
          </div>
        </form>

        {err ? <div style={{ marginTop: 12 }} className="tag">{err}</div> : null}

        <div style={{ marginTop: 12 }} className="results">
          {results.map(card => {
            const img = scryfallImage(card)
            const price = scryfallPriceUSD(card)
            const commanderOk = isCommanderEligible(card)
            return (
              <div className="resultRow" key={card.id}>
                {img ? <img className="resultImg" src={img} alt={card.name} /> : <div className="resultImg" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</div>
                    {price ? <span className="tag">${formatMoney(price)}</span> : <span className="muted" style={{ fontSize: 12 }}>no price</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{card.mana_cost || ''} {card.type_line ? `• ${card.type_line}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="btn" type="button" onClick={() => add(card)}>Add</button>
                    {commanderOk ? (
                      <button className="btn" type="button" onClick={() => setCommander(card)}>Set commander</button>
                    ) : null}
                    <span className="muted" style={{ fontSize: 12 }}>Default: {categorizeByType(card)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {normalized && !busy && results.length === 0 && !err ? (
          <div className="muted" style={{ marginTop: 12 }}>No results.</div>
        ) : null}
      </div>
    </div>
  )
}
