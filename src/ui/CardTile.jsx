import React from 'react'
import { scryfallPriceUSD, formatMoney, scryfallImageSmall } from './helpers'

function rarityToKeyrune(rarity) {
  const r = (rarity || '').toLowerCase()
  if (r === 'mythic') return 'ss-mythic'
  if (r === 'rare') return 'ss-rare'
  if (r === 'uncommon') return 'ss-uncommon'
  return 'ss-common'
}

export default function CardTile({ cardRow, onInc, onDec, onRemove }) {
  const snap = cardRow.card_snapshot || {}
  const set = (snap.set || '').toLowerCase()
  const rarityClass = rarityToKeyrune(snap.rarity)
  const price = scryfallPriceUSD(snap)
  const img = scryfallImageSmall(snap)

  return (
    <div className="cardTile">
      {img ? <img className="cardThumb" src={img} alt={snap.name || 'card'} loading="lazy" /> : <div className="cardThumb" />}

      <div className="cardMain">
        <div className="cardTop">
          <div className="cardName" title={snap.name || ''}>{snap.name || 'Unknown card'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {set ? <i className={`ss ss-${set} ${rarityClass}`} style={{ fontSize: 16 }} /> : null}
            {price ? <span className="tag">${formatMoney(price)}</span> : <span className="muted" style={{ fontSize: 12 }}>no price</span>}
          </div>
        </div>

        <div className="cardLine">{snap.mana_cost || ''} {snap.type_line ? `• ${snap.type_line}` : ''}</div>

        <div className="cardActions">
          <div className="qtyControls">
            <button className="btn" onClick={() => onDec?.(cardRow)}>-</button>
            <span className="qty">x{cardRow.qty}</span>
            <button className="btn" onClick={() => onInc?.(cardRow)}>+</button>
          </div>
          <button className="btn danger" onClick={() => onRemove?.(cardRow)}>Remove</button>
        </div>
      </div>
    </div>
  )
}
