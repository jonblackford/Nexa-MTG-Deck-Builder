import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { supabase } from '../lib/supabase';
import BoardColumn from './BoardColumn.jsx';
import SearchModal from './SearchModal.jsx';
import ImportModal from './ImportModal.jsx';
import CardDetailModal from './CardDetailModal.jsx';
import {
  buildDecklistText,
  manaValue,
  parseManaPips,
  scryfallPriceUSD,
  allowedCopiesInCommander,
  colorIdentityLabel,
  getColorIdentity,
  isCommanderEligible,
  isSubsetColors,
  isBasicLand,
  categorizeByType,
  scryfallImage,
  slugifyEdhrec,
  oracleAllowsAnyNumber,
} from './helpers';


function snapshotScryfallCard(card) {
  // Store the useful bits for offline display + analytics
  return {
    id: card?.id,
    name: card?.name,
    mana_cost: card?.mana_cost,
    cmc: card?.cmc,
    type_line: card?.type_line,
    oracle_text: card?.oracle_text,
    color_identity: card?.color_identity,
    set: card?.set,
    set_name: card?.set_name,
    rarity: card?.rarity,
    prices: card?.prices,
    image_uris: card?.image_uris,
    card_faces: card?.card_faces,
  }
}

function sumQty(rows) {
  return (rows || []).reduce((a, r) => a + (r.qty || 0), 0)
}

function isLand(row) {
  const t = (row?.card_snapshot?.type_line || '').toLowerCase()
  return t.includes('land')
}

function isSpell(row) {
  return !isLand(row)
}

function detectRamp(row) {
  const text = (row?.card_snapshot?.oracle_text || '').toLowerCase()
  if (!text) return false
  if (text.includes('add {')) return true
  if (text.includes('create a treasure') || text.includes('treasure token')) return true
  if (text.includes('search your library') && text.includes('land')) return true
  if (text.includes('put a land card') && text.includes('onto the battlefield')) return true
  return false
}

function detectDraw(row) {
  const text = (row?.card_snapshot?.oracle_text || '').toLowerCase()
  if (!text) return false
  if (text.includes('draw a card') || text.includes('draw two cards') || text.includes('draw three cards')) return true
  if (text.includes('whenever') && text.includes('draw')) return true
  return false
}

function curveBucket(mv) {
  if (mv >= 6) return '6+'
  return String(mv)
}

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function DeckBoard({ session, deckId }) {
  const userId = session.user.id
  const [deck, setDeck] = useState(null)
  const [columns, setColumns] = useState([])
  const [cards, setCards] = useState([]) // deck_cards rows
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('board') // board | list
  const [comboBusy, setComboBusy] = useState(false)
  const [comboErr, setComboErr] = useState('')
  const [comboResults, setComboResults] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchPreset, setSearchPreset] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [activeDragId, setActiveDragId] = useState(null)
  const [detailRow, setDetailRow] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  async function loadAll(silent = false) {
    if (!silent) setLoading(true)
    setErr('')
    try {
      const { data: d, error: dErr } = await supabase
        .from('decks')
        .select('id,name,format,created_at,updated_at')
        .eq('id', deckId)
        .single()
      if (dErr) throw dErr

      const { data: cols, error: cErr } = await supabase
        .from('deck_columns')
        .select('id,name,column_order')
        .eq('deck_id', deckId)
        .order('column_order', { ascending: true })
      if (cErr) throw cErr

      const { data: rows, error: rErr } = await supabase
        .from('deck_cards')
        .select('id,deck_id,column_id,qty,sort_order,scryfall_id,card_snapshot,created_at,updated_at')
        .eq('deck_id', deckId)
        .order('sort_order', { ascending: true })
      if (rErr) throw rErr

      setDeck(d)
      setColumns(cols || [])
      setCards(rows || [])
    } catch (e) {
      setErr(e?.message ?? String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // Live updates (optional). If you don't want realtime, you can delete this.
    const channel = supabase
      .channel(`deck_${deckId}_changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deck_cards', filter: `deck_id=eq.${deckId}` },
        () => loadAll(true)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const columnsById = useMemo(() => {
    const m = new Map()
    for (const c of columns) m.set(c.id, c)
    return m
  }, [columns])

  const cardsByColumn = useMemo(() => {
    const map = {}
    for (const c of columns) map[c.id] = []
    for (const row of cards) {
      if (!map[row.column_id]) map[row.column_id] = []
      map[row.column_id].push(row)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return map
  }, [cards, columns])

  const commanderColumn = useMemo(
    () => columns.find(c => (c.name || '').toLowerCase() === 'commander') || null,
    [columns]
  )
  const commanderColId = commanderColumn?.id || null
  
const commanderRows = useMemo(() => {
  if (!commanderColId) return []
  const rows = cardsByColumn[commanderColId] || []
  return rows.slice(0, 2)
}, [cardsByColumn, commanderColId])

const commanderRow = useMemo(() => commanderRows[0] || null, [commanderRows])

const commanderColors = useMemo(() => {
  const s = new Set()
  for (const r of commanderRows) {
    for (const c of getColorIdentity(r?.card_snapshot)) s.add(c)
  }
  return Array.from(s)
}, [commanderRows])

  const nameCounts = useMemo(() => {
    const m = new Map()
    for (const r of cards) {
      const name = (r.card_snapshot?.name || '').trim()
      if (!name) continue
      m.set(name, (m.get(name) || 0) + (r.qty || 0))
    }
    return m
  }, [cards])

  const deckIssues = useMemo(() => {
    const illegalColor = []
    const illegalCopies = []

    const commanderSet = !!commanderRow
    const cmdColors = commanderColors

    for (const r of cards) {
      const snap = r.card_snapshot || {}
      const name = (snap.name || '').trim()
      if (!name) continue

      // Commander slot rules
      if (commanderColId && r.column_id === commanderColId) {
        if (!isCommanderEligible(snap)) {
          illegalColor.push({ row: r, reason: 'Not commander-eligible.' })
        }
        if ((r.qty || 0) > 1) {
          illegalCopies.push({ name, qty: r.qty, allowed: 1, row: r })
        }
        continue
      }

      if (commanderSet) {
        const colors = getColorIdentity(snap)
        if (!isSubsetColors(colors, cmdColors)) {
          illegalColor.push({ row: r, reason: `Color identity ${colorIdentityLabel(colors)} not allowed in ${colorIdentityLabel(cmdColors)}.` })
        }
      }

      const allowed = allowedCopiesInCommander(snap)
      const qty = nameCounts.get(name) || 0
      if (allowed !== Infinity && qty > allowed) {
        illegalCopies.push({ name, qty, allowed, row: r })
      }
    }

    return { illegalColor, illegalCopies }
  }, [cards, commanderColId, commanderColors, commanderRow, nameCounts])

  const deckStats = useMemo(() => {
    const total = sumQty(cards)
    const lands = sumQty(cards.filter(isLand))
    const spells = total - lands

    const spellRows = cards.filter(isSpell)
    const mvSum = spellRows.reduce((a, r) => a + (manaValue(r.card_snapshot) * (r.qty || 0)), 0)
    const avgMv = spells > 0 ? mvSum / spells : 0

    const curve = {}
    for (const r of spellRows) {
      const mv = Math.round(manaValue(r.card_snapshot) || 0)
      const b = curveBucket(mv)
      curve[b] = (curve[b] || 0) + (r.qty || 0)
    }

    const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
    for (const r of spellRows) {
      const pc = parseManaPips(r.card_snapshot?.mana_cost)
      for (const k of Object.keys(pips)) pips[k] += (pc[k] || 0) * (r.qty || 0)
    }

    const ramp = sumQty(cards.filter(detectRamp))
    const draw = sumQty(cards.filter(detectDraw))

    const priceTotal = cards.reduce((a, r) => {
      const p = scryfallPriceUSD(r.card_snapshot)
      return a + safeNum(p) * (r.qty || 0)
    }, 0)

    return { total, lands, spells, avgMv, curve, pips, ramp, draw, priceTotal }
  }, [cards])

  async function addCardToDeck(card, columnId, qty = 1) {
  if (!card || !columnId) return
  const snap = snapshotScryfallCard(card)
  const scryId = snap.scryfall_id
  const name = (snap.name || '').trim()
  const allowed = allowedCopiesInCommander(snap)
  const current = name ? (nameCounts.get(name) || 0) : 0

  // Copy-limit check (singleton etc.)
  if (allowed !== Infinity && current + qty > allowed) {
    setErr(`Too many copies of “${name}”. Allowed: ${allowed}.`)
    return
  }

  // Commander color identity check (adding to non-commander slot)
  if (commanderRow && commanderColId && columnId !== commanderColId) {
    const colors = getColorIdentity(snap)
    if (!isSubsetColors(colors, commanderColors)) {
      setErr(`Illegal color identity: ${colorIdentityLabel(colors)} is not allowed in ${colorIdentityLabel(commanderColors)}.`)
      return
    }
  }

  setSaving(true)
  setErr('')
  try {
    // Look for existing row (same card in same column)
    const { data: existing, error: exErr } = await supabase
      .from('deck_cards')
      .select('id,qty,card_snapshot,column_id,sort_order,scryfall_id')
      .eq('deck_id', deckId)
      .eq('column_id', columnId)
      .eq('scryfall_id', scryId)
      .limit(1)

    if (exErr) throw exErr

    if (existing && existing.length) {
      const row = existing[0]
      const currentQty = row.qty || 0
      const nextQty = currentQty + qty

      // Optimistic local update
      setCards(prev => prev.map(r => (r.id === row.id ? { ...r, qty: nextQty } : r)))

      const { error: upErr } = await supabase.from('deck_cards').update({ qty: nextQty }).eq('id', row.id)
      if (upErr) {
        // revert
        setCards(prev => prev.map(r => (r.id === row.id ? { ...r, qty: currentQty } : r)))
        throw upErr
      }
      return
    }

    const nextSort = (cardsByColumn[columnId]?.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) ?? -1) + 1
    const row = {
      user_id: userId,
      deck_id: deckId,
      column_id: columnId,
      scryfall_id: scryId,
      qty,
      sort_order: nextSort,
      card_snapshot: snap,
    }

    const { data: inserted, error: insErr } = await supabase.from('deck_cards').insert(row).select('*').single()
if (insErr) throw insErr

if (inserted) {
  setCards(prev => [...prev, inserted])
} else {
  loadAll(true)
}
  } catch (e) {
    setErr(e?.message ?? String(e))
    // Fallback refresh in case state diverged
    loadAll()
  } finally {
    setSaving(false)
  }
}

  async function setCommander(card) {
    if (!commanderColId) {
      setErr('No Commander column found in this deck.')
      return
    }
    await addCardToDeck(card, commanderColId)
  }

  async function inc(row) {
  const snap = row.card_snapshot || {}
  const name = (snap.name || '').trim()
  const allowed = allowedCopiesInCommander(snap)
  const current = name ? (nameCounts.get(name) || 0) : 0
  if (allowed !== Infinity && current + 1 > allowed) {
    setErr(`Too many copies of “${name}”. Allowed: ${allowed}.`)
    return
  }

  // Color identity check (non-commander slot)
  if (commanderRow && commanderColId && row.column_id !== commanderColId) {
    const colors = getColorIdentity(snap)
    if (!isSubsetColors(colors, commanderColors)) {
      setErr(`Illegal color identity: ${colorIdentityLabel(colors)} is not allowed in ${colorIdentityLabel(commanderColors)}.`)
      return
    }
  }

  const currentQty = row.qty || 0
  const newQty = currentQty + 1

  // Optimistic update
  setCards(prev => prev.map(r => (r.id === row.id ? { ...r, qty: newQty } : r)))
  const { error } = await supabase.from('deck_cards').update({ qty: newQty }).eq('id', row.id)
  if (error) {
    setErr(error.message)
    setCards(prev => prev.map(r => (r.id === row.id ? { ...r, qty: currentQty } : r)))
  }
}

  async function dec(row) {
    const newQty = (row.qty || 0) - 1
    if (newQty <= 0) {
      const { error } = await supabase.from('deck_cards').delete().eq('id', row.id)
      if (error) setErr(error.message)
      return
    }
    const { error } = await supabase.from('deck_cards').update({ qty: newQty }).eq('id', row.id)
    if (error) setErr(error.message)
  }

  async function remove(row) {
    const { error } = await supabase.from('deck_cards').delete().eq('id', row.id)
    if (error) setErr(error.message)
  }

async function updateTags(row, tags) {
  const snap = row?.card_snapshot || {}
  const nextSnap = { ...snap, user_tags: Array.isArray(tags) ? tags : [] }

  // Optimistic update
  setCards(prev => prev.map(r => (r.id === row.id ? { ...r, card_snapshot: nextSnap } : r)))

  const { error } = await supabase.from('deck_cards').update({ card_snapshot: nextSnap }).eq('id', row.id)
  if (error) {
    setErr(error.message)
    loadAll(true)
  }
}


  function findCardRowById(id) {
    return cards.find(r => r.id === id)
  }

  function getContainerIdFor(itemId) {
    // itemId could be a card row id or a column id
    if (columnsById.has(itemId)) return itemId
    const row = findCardRowById(itemId)
    return row?.column_id || null
  }

  async function persistReorder(updatedRows) {
    if (!updatedRows.length) return
    setSaving(true)
    try {
      const payload = updatedRows.map(r => ({
        id: r.id,
        user_id: userId,
        deck_id: deckId,
        column_id: r.column_id,
        sort_order: r.sort_order,
      }))
      const { error } = await supabase.from('deck_cards').upsert(payload, { onConflict: 'id' })
      if (error) throw error
    } catch (e) {
      setErr(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  function onDragStart(event) {
    setActiveDragId(event.active?.id || null)
  }

  function onDragCancel() {
    setActiveDragId(null)
  }

  async function onDragEnd(event) {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return
    const activeId = active.id
    const overId = over.id
    if (activeId === overId) return

    const fromCol = getContainerIdFor(activeId)
    const toCol = getContainerIdFor(overId)
    if (!fromCol || !toCol) return

    const fromList = [...(cardsByColumn[fromCol] || [])]
    const toList = fromCol === toCol ? fromList : [...(cardsByColumn[toCol] || [])]

    const activeIndex = fromList.findIndex(r => r.id === activeId)
    if (activeIndex < 0) return
    const moving = fromList[activeIndex]

    // Rules enforcement
    if (commanderColId && toCol === commanderColId) {
      const snap = moving.card_snapshot || {}
      if (!isCommanderEligible(snap)) {
        setErr('That card is not commander-eligible. Only a legendary creature/planeswalker (or "can be your commander") can go in Commander.')
        return
      }
      
const existingCommander = (cardsByColumn[commanderColId] || []).find(r => r.id !== moving.id)
if (existingCommander && fromCol !== commanderColId) {
  // Replace commander by moving this existing row into Commander, and clearing previous commander rows.
  try {
    setSaving(true)
    // remove current commander rows
    const { error: delErr } = await supabase
      .from('deck_cards')
      .delete()
      .eq('deck_id', deckId)
      .eq('column_id', commanderColId)
    if (delErr) throw delErr

    // Update moving row into commander column
    const { error: upErr } = await supabase
      .from('deck_cards')
      .update({ column_id: commanderColId, sort_order: 0 })
      .eq('id', moving.id)
    if (upErr) throw upErr

    // Reindex old column after removing moving
    const oldList = (cardsByColumn[fromCol] || []).filter(r => r.id !== moving.id)
    const reindex = oldList.map((r, idx) => ({ ...r, column_id: fromCol, sort_order: idx }))
    await persistReorder(reindex)

    // Update local state
    const updatedMap = new Map([[moving.id, { ...moving, column_id: commanderColId, sort_order: 0 }]])
    const nextCards = cards
      .filter(r => !(r.column_id === commanderColId)) // removed old commander rows
      .map(r => (updatedMap.has(r.id) ? { ...r, ...updatedMap.get(r.id) } : r))
    setCards(nextCards)
    setErr('')
  } catch (e) {
    setErr(e?.message ?? String(e))
  } finally {
    setSaving(false)
  }
  return
}
    }

    if (commanderRow && commanderColId && toCol !== commanderColId) {
      const snap = moving.card_snapshot || {}
      const colors = getColorIdentity(snap)
      if (!isSubsetColors(colors, commanderColors)) {
        setErr(`Illegal color identity: ${colorIdentityLabel(colors)} is not allowed in ${colorIdentityLabel(commanderColors)}.`)
        return
      }
    }

    // Determine insertion index
    let overIndex = -1
    if (columnsById.has(overId)) {
      overIndex = toList.length
    } else {
      overIndex = toList.findIndex(r => r.id === overId)
      if (overIndex < 0) overIndex = toList.length
    }

    let newFrom = fromList
    let newTo = toList

    if (fromCol === toCol) {
      newFrom = arrayMove(fromList, activeIndex, overIndex)
    } else {
      newFrom = fromList.filter(r => r.id !== activeId)
      const movedRow = { ...moving, column_id: toCol }
      newTo = [...toList]
      newTo.splice(overIndex, 0, movedRow)
    }

    // Recompute sort orders
    const updated = []
    newFrom.forEach((r, idx) => {
      if ((r.sort_order ?? 0) !== idx || r.column_id !== fromCol) {
        updated.push({ ...r, column_id: fromCol, sort_order: idx })
      }
    })
    if (fromCol !== toCol) {
      newTo.forEach((r, idx) => {
        if ((r.sort_order ?? 0) !== idx || r.column_id !== toCol) {
          updated.push({ ...r, column_id: toCol, sort_order: idx })
        }
      })
    }

    // Update local state optimistically
    const updatedMap = new Map(updated.map(r => [r.id, r]))
    const nextCards = cards.map(r => (updatedMap.has(r.id) ? { ...r, ...updatedMap.get(r.id) } : r))
    // If we moved across columns, the moved card in nextCards might still be in old column_id in state
    if (fromCol !== toCol) {
      // ensure moved row column_id is updated
      const moved = updated.find(r => r.id === moving.id)
      if (moved) {
        for (let i = 0; i < nextCards.length; i++) {
          if (nextCards[i].id === moved.id) nextCards[i] = { ...nextCards[i], column_id: moved.column_id, sort_order: moved.sort_order }
        }
      }
    }
    setCards(nextCards)

    // Persist
    await persistReorder(updated)
  }

  const decklistText = useMemo(() => buildDecklistText(cards), [cards])

  async function copyDecklist() {
    try {
      await navigator.clipboard.writeText(decklistText)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = decklistText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  async function openSpellbook() {
    await copyDecklist()
    window.open('https://commanderspellbook.com/find-my-combos/', '_blank', 'noopener,noreferrer')
    setComboErr('Decklist copied to clipboard. Paste it into Commander Spellbook.')
  }

  
  async async function openEdhrecRecs() {
    await copyDecklist()
    window.open('https://edhrec.com/recs', '_blank', 'noopener,noreferrer')
    setErr('Decklist copied to clipboard. Paste it into EDHREC Recs.')
  }

  function openEdhrecStaples() {
    const cmdName = (commanderRows?.[0]?.card_snapshot?.name || '').trim()
    if (!cmdName) {
      setErr('Set a commander first to open EDHREC staples.')
      return
    }
    const slug = slugifyEdhrec(cmdName)
    window.open(`https://edhrec.com/commanders/${slug}/staples`, '_blank', 'noopener,noreferrer')
  }
  function openPrintSheets() {
    try {
      const imgs = []
      for (const r of cards) {
        const snap = r.card_snapshot || {}
        const url = scryfallImage(snap)
        if (!url) continue
        const qty = Math.max(1, r.qty || 1)
        for (let i = 0; i < qty; i++) imgs.push({ name: snap.name || 'Card', url })
      }
      if (!imgs.length) {
        setErr('No card images available to print.')
        return
      }

      const perPage = 9
      const pages = []
      for (let i = 0; i < imgs.length; i += perPage) pages.push(imgs.slice(i, i + perPage))

      const pageHtml = pages.map(page => {
        const cells = page.map(it => `<div class="cell"><img src="${it.url}" alt="${it.name}"/></div>`).join('')
        return `<div class="page"><div class="grid">${cells}</div></div>`
      }).join('')

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Proxy Sheets</title>
<style>
  body{ margin:0; padding:18px; font-family: ui-sans-serif, system-ui; background:#fff; color:#111;}
  .toolbar{ position: sticky; top:0; background:#fff; padding:10px 0; display:flex; gap:10px; align-items:center; z-index: 10;}
  .btn{ padding:8px 12px; border:1px solid #ddd; border-radius:10px; background:#f7f7f7; cursor:pointer; }
  .page{ page-break-after: always; margin: 12px 0; }
  .grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .cell{ border:1px solid #ddd; border-radius:10px; overflow:hidden; }
  img{ width:100%; height:auto; display:block; }
  @media print { .toolbar{ display:none; } body{ padding:0; } }
</style>
</head><body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">Print</button>
    <button class="btn" onclick="window.close()">Close</button>
    <div style="opacity:.7;font-size:12px;">Cards: ${imgs.length}</div>
  </div>
  ${pageHtml}
</body></html>`

      const w = window.open('', '_blank', 'noopener,noreferrer')
      if (!w) {
        setErr('Popup blocked. Allow popups to print sheets.')
        return
      }
      w.document.open()
      w.document.write(html)
      w.document.close()
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

    if (!imgs.length) {
      setErr('No card images available to print.')
      return
    }

    const perPage = 9
    const pages = []
    for (let i = 0; i < imgs.length; i += perPage) pages.push(imgs.slice(i, i + perPage))

    const pageHtml = pages.map(page => {
      const cells = page.map(it => `<div class="cell"><img src="${it.url}" alt="${it.name}"/></div>`).join('')
      return `<div class="page"><div class="grid">${cells}</div></div>`
    }).join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Proxy Sheets</title>
<style>
  body{ margin:0; padding:18px; font-family: ui-sans-serif, system-ui; background:#fff; color:#111;}
  .toolbar{ position: sticky; top:0; background:#fff; padding:10px 0; display:flex; gap:10px; align-items:center; }
  .btn{ padding:8px 12px; border:1px solid #ddd; border-radius:10px; background:#f7f7f7; cursor:pointer; }
  .page{ page-break-after: always; margin: 12px 0; }
  .grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
  img{ width: 100%; height: auto; border-radius: 8px; border:1px solid #ddd; }
  @media print {.toolbar{display:none;} body{padding:0.25in;} .page{margin:0;}}
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">Print</button>
    <button class="btn" onclick="window.close()">Close</button>
    <div style="color:#444">Deck proxies for personal play/testing.</div>
  </div>
  ${pageHtml}
</body></html>`

    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) { setErr('Popup blocked. Allow popups to print proxy sheets.'); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }
}

async function importDecklist(lines) {
    if (!lines?.length) return
    setErr('')
    const errs = []
    for (const line of lines) {
      const name = (line?.name || '').trim()
      const qty = Math.max(1, Number(line?.qty || 1))
      if (!name) continue
      try {
        const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        const res = await fetch(url)
        const js = await res.json()
        if (!res.ok) throw new Error(js?.details || js?.message || 'Not found')
        // Add qty copies (addCardToDeck handles singleton rules and basic lands)
        for (let i = 0; i < qty; i++) {
          const colName = categorizeByType(js)
          const colId = (columns || []).find(c => c.name === colName)?.id || columns?.[0]?.id
          await addCardToDeck(js, colId)
        }
      } catch (e) {
        errs.push(`${name}: ${e?.message ?? String(e)}`)
      }
      // light rate limit
      await new Promise(r => setTimeout(r, 120))
    }
    if (errs.length) setErr(`Import completed with some errors:\n${errs.slice(0, 10).join('\n')}`)
  }

async function findCombos() {
    setComboBusy(true)
    setComboErr('')
    setComboResults(null)
    try {
      // This endpoint may be blocked by CORS depending on their config.
      // If it fails, we show a fallback.
      const res = await fetch('https://backend.commanderspellbook.com/find-my-combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decklist: decklistText }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Combo lookup failed')
      }
      const json = await res.json()
      setComboResults(json)
    } catch (e) {
      setComboErr(e?.message ?? String(e))
    } finally {
      setComboBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="deckPage">
        <div className="panel">Loading…</div>
        <div className="panel">Loading…</div>
      </div>
    )
  }

  if (err) {
    return (
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800 }}>Couldn’t load deck</div>
            <div className="muted" style={{ marginTop: 6 }}>{err}</div>
          </div>
          <button className="btn" onClick={loadAll}>Retry</button>
        </div>
        <hr />
        <div className="muted" style={{ fontSize: 12 }}>
          If this is your first time, make sure you ran <code>supabase/schema.sql</code> in the Supabase SQL Editor and enabled RLS.
        </div>
      </div>
    )
  }

  
function openDetail(row) {
  setDetailRow(row)
  setDetailOpen(true)
}

const activeRow = activeDragId ? findCardRowById(activeDragId) : null

  return (
    <>
      <SearchModal
        open={searchOpen}
        presetQuery={searchPreset}
        onClose={() => { setSearchOpen(false); setSearchPreset('') }}
        columns={columns}
        onAddCard={addCardToDeck}
        onSetCommander={setCommander}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={importDecklist}
      />

      
<CardDetailModal
  open={detailOpen}
  cardRow={detailRow}
  onClose={() => setDetailOpen(false)}
  onInc={inc}
  onDec={dec}
  onRemove={remove}
  onUpdateTags={updateTags}
/>
<div className="deckPage">
        <div>
          <div className="panel">
            <div className="row" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{deck?.name || 'Deck'}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Format: {deck?.format || 'commander'}
                  {commanderRow ? (
                    <> • Commander: <b>{commanderRow.card_snapshot?.name}</b> • CI: {colorIdentityLabel(commanderColors)}</>
                  ) : (
                    <> • No commander set</>
                  )}
                </div>
              </div>

              
<div className="topActions">
  <div className="actionLeft">
    <button className="btn primary" onClick={() => { setSearchPreset(''); setSearchOpen(true) }}>Search cards</button>
    <button className="btn" onClick={() => { setSearchPreset('type:vehicle'); setSearchOpen(true) }}>Add Vehicles</button>
    <button className="btn" onClick={() => setImportOpen(true)}>Import</button>
    <button className="btn" onClick={openPrintSheets}>Print sheets</button>
    <button className="btn" onClick={openEdhrecRecs} disabled={!decklistText}>EDHREC Recs</button>
    <button className="btn" onClick={openEdhrecStaples} disabled={!commanderRows?.length}>EDHREC Staples</button>
  </div>
  <div className="actionRight">
    <button className="btn" onClick={copyDecklist} disabled={!decklistText}>Copy decklist</button>
    <button className="btn" onClick={openSpellbook} disabled={!decklistText}>Open Spellbook</button>
    <button className="btn" onClick={() => setView(view === 'board' ? 'list' : 'board')}>{view === 'board' ? 'List view' : 'Board view'}</button>
    <button className="btn" onClick={() => loadAll(true)}>Refresh</button>
  </div>
</div>

          {view === 'board' ? (
            <div className="panel">
              <div className="boardWrap">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={onDragStart}
                  onDragCancel={onDragCancel}
                  onDragEnd={onDragEnd}
                >
                  <div className="board">
                    {columns.map(col => (
                      <BoardColumn key={col.id}
                        column={col}
                        cards={cardsByColumn[col.id] || []}
                         onOpen={openDetail} />
                    ))}
                  </div>
                  <DragOverlay>
                    {activeRow ? (
                      <div className="dragOverlay">
                        {activeRow?.card_snapshot ? (
                          <img src={scryfallImage(activeRow.card_snapshot)} alt={activeRow.card_snapshot?.name || 'card'} />
                        ) : null}
                      </div>) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>

            <div className="panel" className="statsBottom">
          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Deck stats</h3>
            {saving ? <span className="tag">Saving…</span> : null}
          </div>
          <div className="kpiRow" style={{ marginTop: 10 }}>
            <div className="kpi"><div className="label">Cards</div><div className="value">{deckStats.total}</div></div>
            <div className="kpi"><div className="label">Lands</div><div className="value">{deckStats.lands}</div></div>
            <div className="kpi"><div className="label">Avg MV</div><div className="value">{deckStats.avgMv.toFixed(2)}</div></div>
            <div className="kpi"><div className="label">Ramp (rough)</div><div className="value">{deckStats.ramp}</div></div>
            <div className="kpi"><div className="label">Draw (rough)</div><div className="value">{deckStats.draw}</div></div>
            <div className="kpi"><div className="label">Est. price</div><div className="value">${deckStats.priceTotal.toFixed(2)}</div></div>
          </div>

          <div style={{ marginTop: 10 }} className="muted">
            Curve: {['0','1','2','3','4','5','6+'].map(k => `${k}:${deckStats.curve[k] || 0}`).join('  •  ')}
          </div>
          <div style={{ marginTop: 6 }} className="muted">
            Pips: W {deckStats.pips.W} • U {deckStats.pips.U} • B {deckStats.pips.B} • R {deckStats.pips.R} • G {deckStats.pips.G}
          </div>

          {(deckIssues.illegalColor.length > 0 || deckIssues.illegalCopies.length > 0) ? (
            <>
              <hr />
              <div style={{ fontWeight: 800 }}>Deck checks</div>
              {deckIssues.illegalColor.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Illegal color identity:</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {deckIssues.illegalColor.slice(0, 12).map(({ row, reason }) => (
                      <div key={row.id} className="row" style={{ alignItems: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{row.card_snapshot?.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{reason}</div>
                        <button className="btn danger" onClick={() => remove(row)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {deckIssues.illegalCopies.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Too many copies:</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {deckIssues.illegalCopies.slice(0, 12).map(({ name, qty, allowed, row }) => (
                      <div key={name} className="row" style={{ alignItems: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>x{qty} (allowed {allowed === Infinity ? '∞' : allowed})</div>
                        <button className="btn" onClick={() => dec(row)}>Fix (-1)</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Deck checks: looks good.
            </div>
          )}

          <hr />

          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Combos</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={copyDecklist}>Copy decklist</button>
              <button className="btn" onClick={openSpellbook}>Open Spellbook</button>
              <button className="btn primary" onClick={findCombos} disabled={comboBusy || !decklistText}>
                {comboBusy ? 'Checking…' : 'Find combos'}
              </button>
            </div>
          </div>
          {comboErr ? (
            <div className="tag" style={{ marginTop: 10 }}>
              {comboErr}
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                If this is a CORS error, use “Copy decklist” and paste it into Commander Spellbook’s “Find My Combos”.
              </div>
            </div>
          ) : null}

          {comboResults ? (
            <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12 }} className="muted">
{JSON.stringify(comboResults, null, 2)}
            </pre>
          ) : (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Combo finding is wired to Commander Spellbook’s backend endpoint. If it’s blocked by CORS, you’ll still be able to export the decklist and paste it there.
            </div>
          )}
        </div>


          ) : (
          <div className="panel" style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              {columns.map(col => {
                const rows = cardsByColumn[col.id] || []
                if (!rows.length) return null
                return (
                  <div key={col.id}>
                    <div className="row" style={{ alignItems: 'center' }}>
                      <div style={{ fontWeight: 900 }}>{col.name}</div>
                      <span className="tag">{sumQty(rows)}</span>
                    </div>
                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      {rows.map(r => (
                        <div key={r.id} className="row" style={{ alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{r.card_snapshot?.name}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{r.card_snapshot?.mana_cost || ''}</div>
                          <div className="muted" style={{ fontSize: 12 }}>x{r.qty}</div>
                        </div>
                      ))}
                    </div>
                    <hr />
                  </div>
                )
              })}
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  )
}