import React from 'react'
import { scryfallPriceUSD, formatMoney } from './helpers'

function rarityToKeyrune(rarity) {
  const r = (rarity || '').toLowerCase()
  if (r === 'mythic') return 'ss-mythic'
  if (r === 'rare') return 'ss-rare'
  if (r === 'uncommon') return 'ss-uncommon'
  return 'ss-common'
}

export function getSnapshotImage(snap, size = 'normal') {
  if (!snap) return ''
  if (snap?.image_uris?.[size]) return snap.image_uris[size]
  const face = snap?.card_faces?.find(f => f?.image_uris?.[size])?.image_uris
  return face?.[size] || ''
}

export default function CardTile({ cardRow, onInc, onDec, onRemove, compact = false }) {
  const snap = cardRow.card_snapshot || {}
  const set = (snap.set || '').toLowerCase()
  const rarityClass = rarityToKeyrune(snap.rarity)
  const price = scryfallPriceUSD(snap)
  const img = getSnapshotImage(snap, compact ? 'small' : 'normal')

  // Compact mode is used in DragOverlay
  if (compact) {
    return (
      <div className="cardTileOverlay">
        {img ? <img className="cardArtOverlay" src={img} alt={snap.name} /> : null}
        <div className="cardOverlayMeta">
          <div className="row" style={{ alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>{snap.name}</div>
            <span className="tag">x{cardRow.qty || 1}</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{snap.mana_cost || ''}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="cardTileNew" title={snap.name}>
      <div className="cardArtLarge">
        {img ? <img src={img} alt={snap.name} /> : null}
        <div className="cardArtBadges">
          <span className="qtyBadge">x{cardRow.qty}</span>
          {set ? <i className={`ss ss-${set} ${rarityClass}`} /> : null}
          {price ? <span className="priceBadge">${formatMoney(price)}</span> : null}
        </div>
      </div>

      <div className="cardTileMeta">
        <div className="cardTitle">{snap.name}</div>
        <div className="muted cardSub">
          {snap.mana_cost || ''} {snap.type_line ? `• ${snap.type_line}` : ''}
        </div>

        <div className="cardTileActions">
          <div className="qtyControls">
            <button className="btn btnTiny" onClick={() => onDec?.(cardRow)} type="button">-</button>
            <button className="btn btnTiny" onClick={() => onInc?.(cardRow)} type="button">+</button>
          </div>
          <button className="btn btnTiny danger" onClick={() => onRemove?.(cardRow)} type="button">Remove</button>
        </div>
      </div>
    </div>
  )
}
