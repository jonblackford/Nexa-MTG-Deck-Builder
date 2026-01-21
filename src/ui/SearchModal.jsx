import React, { useEffect, useMemo, useState } from 'react'
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
  // Default to paper results
  if (!/\bgame:/.test(q)) return `${q} game:paper`
  return q
}

function columnNameToId(columns, columnName) {
  const hit = (columns || []).find(c => (c.name || '') === columnName)
  return hit?.id || (columns?.[0]?.id ?? null)
}

export default function SearchModal({ open, onClose, columns, onAddCard, onSetCommander, presetQuery = '' }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])
  const [err, setErr] = useState('')

  // When opened with a preset, set the query and auto-search once.
  useEffect(() => {
    if (!open) return
    if (presetQuery) {
      setQ(presetQuery)
      setResults([])
      setErr('')
    }
  }, [open, presetQuery])

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
      const js = await res.json()
      if (!res.ok) throw new Error(js?.details || js?.message || 'Search failed')
      setResults((js?.data || []).slice(0, 40))
    } catch (e2) {
      setErr(e2?.message ?? String(e2))
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  async function addCard(card) {
    const colName = categorizeByType(card)
    const colId = columnNameToId(columns, colName)
    await onAddCard?.(card, colId)
  }

  async function setCommander(card) {
    await onSetCommander?.(card)
  }

  if (!open) return null

  return (
    <div className="modalOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modalCard">
        <div className="modalHeader">
          <div style={{fontWeight: 900}}>Search cards</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="modalBody">
          <form onSubmit={runSearch}>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Try: “sol ring”, “type:creature o:draw”, “c>=wubrg commander”'
            />
            <div className="row" style={{ marginTop: 10, flexWrap:'wrap', gap:8 }}>
              <button className="btn primary" disabled={busy || !normalized}>{busy ? 'Searching…' : 'Search'}</button>
              <button className="btn" type="button" onClick={() => { setQ(''); setResults([]); setErr('') }}>Clear</button>

              <div style={{flex:1}} />
              <button className="btn" type="button" onClick={() => setQ('is:commander')}>Commanders</button>
              <button className="btn" type="button" onClick={() => setQ('type:vehicle')}>Vehicles</button>
              <button className="btn" type="button" onClick={() => setQ('type:land')}>Lands</button>
              <button className="btn" type="button" onClick={() => setQ('type:creature')}>Creatures</button>
              <button className="btn" type="button" onClick={() => setQ('type:artifact')}>Artifacts</button>
            </div>
          </form>

          {err ? <div style={{ marginTop: 12 }} className="tag dangerTag">{err}</div> : null}

          <div className="resultsGrid" style={{ marginTop: 14 }}>
            {results.map(card => {
              const img = scryfallImage(card)
              const price = scryfallPriceUSD(card)
              const commanderOk = isCommanderEligible(card)
              return (
                <div className="resultCard" key={card.id}>
                  {img ? <img className="resultImg" src={img} alt={card.name} /> : <div className="resultImg" />}
                  <div className="resultMeta">
                    <div className="resultTop">
                      <div className="resultName" title={card.name}>{card.name}</div>
                      {price ? <span className="tag">${formatMoney(price)}</span> : <span className="muted" style={{ fontSize: 12 }}>no price</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{card.mana_cost || ''} {card.type_line ? `• ${card.type_line}` : ''}</div>

                    <div className="row" style={{ marginTop: 10, gap: 8, flexWrap:'wrap' }}>
                      <button className="btn primary" type="button" onClick={() => addCard(card)}>Add</button>
                      {commanderOk ? (
                        <button className="btn" type="button" onClick={() => setCommander(card)}>Set commander</button>
                      ) : null}
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
    </div>
  )
}
