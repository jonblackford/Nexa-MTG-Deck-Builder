import React, { useMemo, useState } from 'react'

function parseLines(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    // Supports: "1 Card Name", "2x Card Name", "Card Name"
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i)
    if (m) {
      out.push({ qty: Number(m[1] || 1), name: (m[2] || '').trim() })
    } else {
      out.push({ qty: 1, name: line })
    }
  }
  // Merge duplicates
  const map = new Map()
  for (const r of out) {
    const key = r.name.toLowerCase()
    map.set(key, { name: r.name, qty: (map.get(key)?.qty || 0) + (r.qty || 1) })
  }
  return Array.from(map.values()).filter(r => r.name)
}

export default function ImportModal({ open, onClose, onImport }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const parsed = useMemo(() => parseLines(text), [text])

  async function doImport() {
    setErr('')
    if (!parsed.length) return
    setBusy(true)
    try {
      await onImport?.(parsed)
      setText('')
      onClose?.()
    } catch (e) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modalOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modalCard">
        <div className="modalHeader">
          <div style={{fontWeight: 900}}>Import decklist</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="modalBody">
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Paste a decklist like: <b>1 Sol Ring</b>, <b>10 Forest</b>, or just names one per line.
          </div>

          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1 Sol Ring\n1 Arcane Signet\n10 Forest"}
            rows={10}
          />

          {err ? <div style={{ marginTop: 12 }} className="tag dangerTag">{err}</div> : null}

          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {parsed.length ? `${parsed.length} unique lines detected` : 'Nothing to import yet.'}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => setText('')}>Clear</button>
              <button className="btn primary" disabled={busy || !parsed.length} onClick={doImport}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
