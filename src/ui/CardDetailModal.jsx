import React, { useEffect, useState } from 'react';
import { formatMoney, scryfallImage, scryfallPriceUSD } from './helpers';

/**
 * Shows full card info on click, while keeping the board tile minimal.
 * Uses the stored snapshot for most info; optionally refreshes from Scryfall for up-to-date price/art.
 */
export default function CardDetailModal({ open, cardRow, onClose, onInc, onDec, onRemove }) {
  const [liveCard, setLiveCard] = useState(null);
  const snap = cardRow?.card_snapshot || {};

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!open || !cardRow?.scryfall_id) return;
      try {
        const res = await fetch(`https://api.scryfall.com/cards/${cardRow.scryfall_id}`);
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setLiveCard(j);
      } catch {
        // ignore
      }
    }
    setLiveCard(null);
    load();
    return () => { alive = false; };
  }, [open, cardRow?.scryfall_id]);

  if (!open) return null;

  const card = liveCard || snap;
  const img = scryfallImage(card);
  const price = scryfallPriceUSD(card);
  const priceText = price ? `$${formatMoney(price)}` : '';

  return (
    <div className="modalOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modalCard cardDetail">
        <div className="modalHeader">
          <div style={{ fontWeight: 900, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card?.name || 'Card'}
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="cardDetailBody">
          <div className="cardDetailArt">
            {img ? <img src={img} alt={card?.name || 'card'} /> : <div className="muted">No image</div>}
          </div>

          <div className="cardDetailInfo">
            <div className="pillRow">
              {card?.mana_cost ? <span className="pill">{card.mana_cost}</span> : null}
              {card?.type_line ? <span className="pill">{card.type_line}</span> : null}
              {priceText ? <span className="pill good">{priceText}</span> : null}
            </div>

            {card?.oracle_text ? (
              <div className="oracleBox">
                {String(card.oracle_text).split(/\n/).map((line, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>{line}</div>
                ))}
              </div>
            ) : null}

            <div className="detailActions">
              <div className="qtyControls">
                <button className="btn" onClick={() => onDec?.(cardRow)}>-</button>
                <span className="qty">x{cardRow?.qty || 0}</span>
                <button className="btn" onClick={() => onInc?.(cardRow)}>+</button>
              </div>
              <button className="btn danger" onClick={() => onRemove?.(cardRow)}>Remove</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
