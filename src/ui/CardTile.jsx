import React from 'react'
import { scryfallPriceUSD, formatMoney, scryfallImageSmall } from './helpers'

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
  const img = scryfallImageSmall(snap)

  return (
    <div className="cardTile">
      <div className="cardArt" aria-hidden="true">
        {img ? <img src={img} alt="" /> : null}
      </div>

      <div className="cardMeta">
        <div className="cardName" title={snap.name}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.name}</span>
          {set ? <i className={`ss ss-${set} ${rarityClass}`} title={(snap.set_name || set).toUpperCase()} /> : null}
          {price ? <span className="pill">${formatMoney(price)}</span> : null}
        </div>
        <div className="cardLine">{snap.mana_cost || ''} {snap.type_line ? `• ${snap.type_line}` : ''}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
