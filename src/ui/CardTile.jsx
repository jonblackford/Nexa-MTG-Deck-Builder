import React from 'react'
import { scryfallPriceUSD, formatMoney } from './helpers'

function rarityToKeyrune(rarity) {
  const r = (rarity || '').toLowerCase()
  if (r==='mythic') return 'ss-mythic'
  if (r==='rare') return 'ss-rare'
  if (r==='uncommon') return 'ss-uncommon'
  return 'ss-common'
}

export default function CardTile({ cardRow, onInc, onDec, onRemove }) {
  const snap = cardRow.card_snapshot || {}
  const set = (snap.set || '').toLowerCase()
  const rarityClass = rarityToKeyrune(snap.rarity)
  const price = scryfallPriceUSD(snap)

  return (
    <div className="cardTile">
      <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
        <div style={{fontWeight:700, lineHeight:1.1}} title={snap.name}>{snap.name}</div>
        {set ? (
          <div title={(snap.set_name || set).toUpperCase()} style={{display:'flex',alignItems:'center',gap:6}}>
            <i className={`ss ss-${set} ${rarityClass}`} />
            {price ? <span className="tag">${formatMoney(price)}</span> : null}
          </div>
        ) : price ? (
          <span className="tag">${formatMoney(price)}</span>
        ) : null}
      </div>
      <div className="muted" style={{fontSize:12, marginTop:4}}>{snap.mana_cost || ''} {snap.type_line ? `• ${snap.type_line}` : ''}</div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button className="btn" onClick={()=>onDec?.(cardRow)}>-</button>
          <span className="qty">{cardRow.qty}</span>
          <button className="btn" onClick={()=>onInc?.(cardRow)}>+</button>
        </div>
        <button className="btn danger" onClick={()=>onRemove?.(cardRow)}>Remove</button>
      </div>
    </div>
  )
}
