import React from 'react';
import { scryfallPriceUSD, formatMoney, scryfallImage } from './helpers';

export default function CardTile({ cardRow, onOpen }) {
  const snap = cardRow?.card_snapshot || {};
  const img = scryfallImage(snap);
  const price = scryfallPriceUSD(snap);
  const priceText = price ? `$${formatMoney(price)}` : '';

  return (
    <div className="cardTileImg" onClick={() => onOpen?.(cardRow)} title="Click for details">
      {img ? <img src={img} alt={snap?.name || 'card'} /> : <div className="muted">No image</div>}
      {priceText ? <div className="priceBadge">{priceText}</div> : null}
      <div className="qtyBadge">x{cardRow?.qty || 0}</div>
    </div>
  );
}
