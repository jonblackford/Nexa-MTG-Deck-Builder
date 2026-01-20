export function scryfallImage(card) {
  if (card?.image_uris?.normal) return card.image_uris.normal
  const face = card?.card_faces?.find(f => f?.image_uris?.normal)?.image_uris
  return face?.normal || ''
}

export function scryfallPriceUSD(card) {
  const p = card?.prices || {}
  return p.usd || p.usd_foil || p.usd_etched || p.eur || p.tix || ''
}

export function rarityClass(rarity) {
  const r = (rarity || '').toLowerCase()
  if (r==='mythic') return 'mythic'
  if (r==='rare') return 'rare'
  if (r==='uncommon') return 'uncommon'
  return 'common'
}

export function categorizeByType(card) {
  const t = (card?.type_line || '').toLowerCase()
  if (t.includes('land')) return 'Lands'
  if (t.includes('creature')) return 'Creatures'
  if (t.includes('instant')) return 'Instants'
  if (t.includes('sorcery')) return 'Sorceries'
  if (t.includes('artifact')) return 'Artifacts'
  if (t.includes('enchantment')) return 'Enchantments'
  if (t.includes('planeswalker')) return 'Planeswalkers'
  return 'Maybe'
}

// Parses mana cost like "{2}{U}{U}" into pip counts
export function parseManaPips(manaCost) {
  const pips = { W:0, U:0, B:0, R:0, G:0, C:0 }
  if (!manaCost) return pips
  const tokens = manaCost.match(/\{[^}]+\}/g) || []
  for (const tok of tokens) {
    const inner = tok.replace(/[{}]/g,'').toUpperCase()
    // Ignore numeric costs
    if (/^\d+$/.test(inner)) continue
    // Hybrid: "W/U", "2/U", etc.
    const parts = inner.split('/')
    for (const part of parts) {
      const c = part.trim()
      if (pips[c] !== undefined) pips[c] += 1
    }
  }
  return pips
}

export function manaValue(card) {
  // Scryfall uses cmc (number) for mana value
  if (typeof card?.cmc === 'number') return card.cmc
  return 0
}

export function formatMoney(v) {
  if (!v) return ''
  // Scryfall returns numeric strings; eur might be "0.12"
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(2)
}

export function buildDecklistText(cards) {
  // cards: { qty, card_snapshot.name }
  return cards
    .filter(c => c?.qty > 0 && c?.card_snapshot?.name)
    .map(c => `${c.qty} ${c.card_snapshot.name}`)
    .join('\n')
}
