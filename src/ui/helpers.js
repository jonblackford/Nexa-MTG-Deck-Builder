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
  if (t.includes('vehicle')) return 'Vehicles'
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

export function getColorIdentity(cardSnap) {
  const ci = cardSnap?.color_identity
  if (Array.isArray(ci)) return ci.filter(Boolean)
  return []
}

export function isSubsetColors(cardColors, commanderColors) {
  // empty commander colors means colorless; only allow colorless cards
  const a = new Set((cardColors || []).filter(Boolean))
  const b = new Set((commanderColors || []).filter(Boolean))
  for (const c of a) {
    if (!b.has(c)) return false
  }
  return true
}

export function isBasicLand(cardSnap) {
  const tl = (cardSnap?.type_line || '').toLowerCase()
  return tl.includes('basic land')
}

export function hasAnyNumberRule(cardSnap) {
  const text = (cardSnap?.oracle_text || '').toLowerCase()
  if (!text) return false
  return text.includes('a deck can have any number of cards named') || text.includes('a deck can have any number of cards')
}

export function allowedCopiesInCommander(cardSnap) {
  // Commander default: 1 per name
  if (!cardSnap) return 1
  if (isBasicLand(cardSnap)) return Infinity
  if (hasAnyNumberRule(cardSnap)) return Infinity

  const name = (cardSnap?.name || '').toLowerCase()
  if (name === 'seven dwarves') return 7
  if (name === 'nazgûl' || name === 'nazgul') return 9

  return 1
}

export function isCommanderEligible(cardSnap) {
  if (!cardSnap) return false
  const tl = (cardSnap.type_line || '').toLowerCase()
  const text = (cardSnap.oracle_text || '').toLowerCase()
  if (tl.includes('legendary') && tl.includes('creature')) return true
  if (tl.includes('legendary') && tl.includes('planeswalker')) return true
  if (text.includes('can be your commander')) return true
  return false
}

export function scryfallImageSmall(cardSnap) {
  if (cardSnap?.image_uris?.small) return cardSnap.image_uris.small
  if (cardSnap?.image_uris?.normal) return cardSnap.image_uris.normal
  const face = cardSnap?.card_faces?.find(f => f?.image_uris?.small || f?.image_uris?.normal)?.image_uris
  return face?.small || face?.normal || ''
}

export function colorIdentityLabel(colors) {
  const arr = (colors || []).filter(Boolean)
  return arr.length ? arr.join('') : 'C'
}

export function slugifyEdhrec(name) {
  // EDHREC commander slugs are generally lowercase, hyphen-separated, punctuation removed
  return (name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function isBasicLand(cardSnap) {
  const tl = (cardSnap?.type_line || '').toLowerCase()
  return tl.includes('basic land')
}

export function oracleAllowsAnyNumber(cardSnap) {
  const t = (cardSnap?.oracle_text || '').toLowerCase()
  return t.includes('a deck can have any number') || t.includes('any number of cards named')
}
