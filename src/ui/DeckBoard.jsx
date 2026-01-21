import React, { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

import { supabase } from '../lib/supabase'
import BoardColumn from './BoardColumn.jsx'
import SearchPanel from './SearchPanel.jsx'
import CardTile from './CardTile.jsx'
import { buildDecklistText, manaValue, parseManaPips, scryfallPriceUSD, categorizeByType } from './helpers'

function snapshotScryfallCard(card) {
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

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isBasicLand(snap) {
  const t = (snap?.type_line || '').toLowerCase()
  return t.includes('basic') && t.includes('land')
}

function allowedCopies(snap) {
  if (!snap?.name) return 1
  if (isBasicLand(snap)) return Infinity

  const oracle = (snap?.oracle_text || '')
  if (/A deck can have any number of cards named/i.test(oracle)) return Infinity

  const n = normalizeName(snap.name)
  if (n === 'seven dwarves') return 7
  if (n === 'nazgul' || n === 'nazgûl') return 9
  return 1
}

function isCommanderCandidateSnap(snap) {
  const t = (snap?.type_line || '').toLowerCase()
  if (!t.includes('legendary')) return false
  if (t.includes('creature')) return true
  if (t.includes('planeswalker')) return true
  return false
}

function subsetColorIdentity(cardCI = [], cmdCI = []) {
  const cmd = new Set(cmdCI || [])
  for (const c of (cardCI || [])) {
    if (!cmd.has(c)) return false
  }
  return true
}

function isLandRow(row) {
  const t = (row?.card_snapshot?.type_line || '').toLowerCase()
  return t.includes('land')
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

export default function DeckBoard({ session, deckId }) {
  const userId = session.user.id

  const [deck, setDeck] = useState(null)
  const [columns, setColumns] = useState([])
  const [cards, setCards] = useState([]) // deck_cards rows
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('board') // board | list

  const [activeId, setActiveId] = useState(null)
  const [lastOverId, setLastOverId] = useState(null)
  const [transientMsg, setTransientMsg] = useState('')

  const [comboBusy, setComboBusy] = useState(false)
  const [comboErr, setComboErr] = useState('')
  const [comboResults, setComboResults] = useState(null)
  const [autoFixDupes, setAutoFixDupes] = useState(true)
  const [autoMoveIncompatible, setAutoMoveIncompatible] = useState(true)
  const [autoSwapCommander, setAutoSwapCommander] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importLog, setImportLog] = useState([])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 2 } }))

  const commanderColumnId = useMemo(() => {
    const hit = (columns || []).find(c => (c.name || '').toLowerCase().includes('commander'))
    return hit?.id || null
  }, [columns])

  const commanderRow = useMemo(() => {
    if (!commanderColumnId) return null
    const rows = cards.filter(r => r.column_id === commanderColumnId)
    return rows[0] || null
  }, [cards, commanderColumnId])

  const commanderCI = useMemo(() => {
    const ci = commanderRow?.card_snapshot?.color_identity || []
    return Array.isArray(ci) ? ci : []
  }, [commanderRow])

  async function loadAll() {
    setLoading(true)
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
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel(`deck_${deckId}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deck_cards', filter: `deck_id=eq.${deckId}` }, () => loadAll())
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
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return map
  }, [cards, columns])

  // --- Validation (color identity + duplicates) ---
  const deckChecks = useMemo(() => {
    const issues = { color: [], dupes: [] }

    if (commanderRow && commanderCI) {
      for (const r of cards) {
        if (r.id === commanderRow.id) continue
        const snap = r.card_snapshot || {}
        const ok = subsetColorIdentity(snap.color_identity || [], commanderCI)
        if (!ok) {
          issues.color.push(r)
        }
      }
    }

    const counts = new Map()
    for (const r of cards) {
      const name = r?.card_snapshot?.name
      if (!name) continue
      const key = normalizeName(name)
      counts.set(key, (counts.get(key) || 0) + (r.qty || 0))
    }

    for (const r of cards) {
      const snap = r.card_snapshot || {}
      const key = normalizeName(snap.name)
      const total = counts.get(key) || 0
      const limit = allowedCopies(snap)
      if (total > limit) {
        issues.dupes.push({ row: r, total, limit })
      }
    }

    // Deduplicate dupes by name
    const seen = new Set()
    issues.dupes = issues.dupes.filter(d => {
      const k = normalizeName(d.row?.card_snapshot?.name)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    return issues
  }, [cards, commanderRow, commanderCI])

  // Map of rowId -> dupe info for quick lookup in UI
  const dupeMap = useMemo(() => {
    const m = new Map()
    for (const d of deckChecks.dupes) {
      if (d.row && d.row.id) m.set(d.row.id, { total: d.total, limit: d.limit })
    }
    return m
  }, [deckChecks])

  const deckStats = useMemo(() => {
    const total = sumQty(cards)
    const lands = sumQty(cards.filter(isLandRow))
    const spells = total - lands

    const spellRows = cards.filter(r => !isLandRow(r))
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

    const priceTotal = cards.reduce((a, r) => a + safeNum(scryfallPriceUSD(r.card_snapshot)) * (r.qty || 0), 0)

    return { total, lands, spells, avgMv, curve, pips, ramp, draw, priceTotal }
  }, [cards])

  function totalCopiesByName(targetName) {
    const key = normalizeName(targetName)
    let total = 0
    for (const r of cards) {
      if (normalizeName(r?.card_snapshot?.name) === key) total += (r.qty || 0)
    }
    return total
  }

  function assertCanAdd(snap, addingQty = 1) {
    // Commander color identity enforcement
    if (commanderRow && commanderCI && snap?.id !== commanderRow?.card_snapshot?.id) {
      if (!subsetColorIdentity(snap.color_identity || [], commanderCI)) {
        throw new Error(`“${snap.name}” is outside your commander’s color identity (${commanderCI.join('') || 'Colorless'}).`)
      }
    }

    // Singleton enforcement
    const limit = allowedCopies(snap)
    const total = totalCopiesByName(snap.name) + addingQty
    if (total > limit) {
      const limText = limit === Infinity ? 'unlimited' : String(limit)
      throw new Error(`Too many copies of “${snap.name}”. Limit is ${limText} in Commander.`)
    }
  }

  async function addCardToDeck(card, columnId, opts = {}) {
    if (!columnId) return
    setErr('')
    const scryId = card?.id
    if (!scryId) return

    const snap = snapshotScryfallCard(card)

    // Commander column restrictions
    if (columnId === commanderColumnId || opts?.setAsCommander) {
      if (!isCommanderCandidateSnap(snap)) {
        setErr('That card is not a valid commander (must usually be a Legendary Creature/Planeswalker).')
        return
      }
      if (commanderRow && (!commanderRow?.scryfall_id || commanderRow.scryfall_id !== scryId)) {
        if (autoSwapCommander) {
          try {
            const sb = await findOrCreateColumn('Sideboard')
            const { error: upErr } = await supabase
              .from('deck_cards')
              .update({ column_id: sb })
              .eq('id', commanderRow.id)
            if (upErr) throw upErr
          } catch (e) {
            setErr('Failed to move existing commander: ' + (e?.message || String(e)))
            return
          }
        } else {
          setErr('Commander slot already has a commander. Remove it first (or move it out) before setting a new one.')
          return
        }
      }
    }

    try {
      // If card exists anywhere in this deck, bump qty (or move if setting commander)
      const { data: existing, error: exErr } = await supabase
        .from('deck_cards')
        .select('id,qty,column_id,sort_order,card_snapshot,scryfall_id')
        .eq('deck_id', deckId)
        .eq('scryfall_id', scryId)
        .limit(1)
      if (exErr) throw exErr

      const targetColumn = (opts?.setAsCommander && commanderColumnId) ? commanderColumnId : columnId

      const hasExisting = existing && existing.length
      // If we're only moving a card into Commander (not adding a copy), don't increment copy counts.
      const addingQty = (hasExisting && opts?.setAsCommander) ? 0 : 1
      // Validate against commander + copy limits BEFORE writing
      try {
        assertCanAdd(snap, addingQty)
      } catch (e) {
        const msg = e?.message || String(e)
        if (/outside your commander/i.test(msg) && autoMoveIncompatible) {
          const dest = await findOrCreateColumn('Incompatible')
          await supabase.from('deck_cards').insert({
            user_id: userId,
            deck_id: deckId,
            column_id: dest,
            scryfall_id: scryId,
            qty: 1,
            sort_order: (cardsByColumn[dest]?.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) ?? -1) + 1,
            card_snapshot: snap,
          })
          setErr(`Moved “${snap.name}” to Incompatible column due to commander color.`)
          return
        }
        if (/Too many copies/i.test(msg) && autoFixDupes) {
          const dest = await findOrCreateColumn('Sideboard')
          await supabase.from('deck_cards').insert({
            user_id: userId,
            deck_id: deckId,
            column_id: dest,
            scryfall_id: scryId,
            qty: 1,
            sort_order: (cardsByColumn[dest]?.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) ?? -1) + 1,
            card_snapshot: snap,
          })
          setErr(`Added extra copy of “${snap.name}” to Sideboard due to copy limits.`)
          return
        }
        throw e
      }

      if (hasExisting) {
        const row = existing[0]
        const movingToCommander = opts?.setAsCommander && commanderColumnId

        // If setting commander, move the existing row into commander column (no duplicate row)
        if (movingToCommander && row.column_id !== commanderColumnId) {
          const nextSort = (cardsByColumn[commanderColumnId]?.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) ?? -1) + 1
          const { error: upErr } = await supabase
            .from('deck_cards')
            .update({ column_id: commanderColumnId, sort_order: nextSort })
            .eq('id', row.id)
          if (upErr) throw upErr
          return
        }

        // Otherwise, just bump qty
        const { error: upErr } = await supabase
          .from('deck_cards')
          .update({ qty: (row.qty || 0) + 1 })
          .eq('id', row.id)
        if (upErr) throw upErr
        return
      }

      // Insert new row
      const nextSort = (cardsByColumn[targetColumn]?.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1) ?? -1) + 1
      const row = {
        user_id: userId,
        deck_id: deckId,
        column_id: targetColumn,
        scryfall_id: scryId,
        qty: 1,
        sort_order: nextSort,
        card_snapshot: snap,
      }
      const { error: insErr } = await supabase.from('deck_cards').insert(row)
      if (insErr) throw insErr
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

  async function inc(row) {
    try {
      const snap = row?.card_snapshot || {}
      assertCanAdd(snap, 1)
      const { error } = await supabase.from('deck_cards').update({ qty: (row.qty || 0) + 1 }).eq('id', row.id)
      if (error) setErr(error.message)
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

  async function findOrCreateColumn(name) {
    const hit = (columns || []).find(c => (c.name || '').toLowerCase() === (name || '').toLowerCase())
    if (hit) return hit.id
    // create a new column at end
    const nextOrder = (columns?.reduce((m, c) => Math.max(m, c.column_order ?? 0), -1) ?? -1) + 1
    const { data: ins, error: insErr } = await supabase.from('deck_columns').insert({ deck_id: deckId, name, column_order: nextOrder }).select('id')
    if (insErr) throw insErr
    const newId = ins?.[0]?.id
    if (newId) await loadAll()
    return newId
  }

  function findColumnIdByName(name) {
    if (!name) return columns?.[0]?.id || null
    const hit = (columns || []).find(c => (c.name || '').toLowerCase() === (name || '').toLowerCase())
    return hit?.id || (columns?.[0]?.id ?? null)
  }

  function exportDeckTXT() {
    const text = buildDecklistText(cards)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deck?.name || 'deck'}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function exportDeckJSON() {
    const data = { meta: deck, cards }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deck?.name || 'deck'}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function runImportText() {
    if (!importText) return
    setImportBusy(true)
    setImportLog([])
    const lines = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)x?\s+(.*)$/i)
      const qty = m ? Number(m[1]) : 1
      const name = m ? m[2].trim() : line
      try {
        const q = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
        let cardRes = await fetch(q)
        let cardJson = await cardRes.json()
        if (!cardRes.ok) {
          const sUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}&unique=cards&order=name`
          const sres = await fetch(sUrl)
          const sjson = await sres.json()
          if (sres.ok && sjson?.data && sjson.data.length) cardJson = sjson.data[0]
          else throw new Error(sjson?.details || 'Card not found')
        }

        for (let i = 0; i < qty; i++) {
          const colName = categorizeByType(cardJson)
          const colId = findColumnIdByName(colName)
          await addCardToDeck(cardJson, colId)
        }
        setImportLog(l => [...l, `Added ${qty} × ${name}`])
      } catch (e) {
        setImportLog(l => [...l, `Failed: ${line} — ${e?.message || e}`])
      }
    }
    setImportBusy(false)
    setImportOpen(false)
    await loadAll()
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

  async function fixDuplicate(row, limit) {
    try {
      const qty = row.qty || 0
      if (qty <= limit) return
      const newQty = limit === Infinity ? qty : limit
      const { error } = await supabase.from('deck_cards').update({ qty: newQty }).eq('id', row.id)
      if (error) throw error
      // reflect locally
      setCards(cards.map(c => (c.id === row.id ? { ...c, qty: newQty } : c)))
    } catch (e) {
      setErr(e?.message ?? String(e))
    }
  }

  function findCardRowById(id) {
    return cards.find(r => r.id === id)
  }

  function getContainerIdFor(itemId) {
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
    setActiveId(event?.active?.id || null)
  }

  function onDragOver(event) {
    const overId = event?.over?.id || null
    if (overId !== lastOverId) setLastOverId(overId)

    // If hovering over commander column and it's not allowed, show transient message
    if (activeId && overId) {
      // Resolve the target column id (overId might be a row)
      const targetColId = columnsById.has(overId) ? overId : getContainerIdFor(overId)
      const col = columnsById.get(targetColId)
      const moving = findCardRowById(activeId)
      if (col && moving) {
        const snap = moving.card_snapshot || {}

        // 1) Commander column rules
        if (col.id === commanderColumnId && moving.column_id !== commanderColumnId) {
          if (!isCommanderCandidateSnap(snap)) {
            setTransientMsg('Cannot place this card as commander')
            setTimeout(() => setTransientMsg(''), 2200)
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            } catch (e) {
              setActiveId(null)
            }
            return
          }
          if (commanderRow && commanderRow.id !== moving.id) {
            setTransientMsg('Commander slot already occupied')
            setTimeout(() => setTransientMsg(''), 2200)
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            } catch (e) {
              setActiveId(null)
            }
            return
          }
        }

        // 2) Incompatible with commander color identity — only allowed into Incompatible column
        if (commanderRow && commanderCI && !subsetColorIdentity(snap.color_identity || [], commanderCI)) {
          const name = (col.name || '').toLowerCase()
          if (name !== 'incompatible') {
            setTransientMsg('Card is outside commander color identity')
            setTimeout(() => setTransientMsg(''), 2200)
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            } catch (e) {
              setActiveId(null)
            }
            return
          }
        }

        // 3) Duplicate / copy-limit issues — encourage dropping into Sideboard
        const total = totalCopiesByName(snap.name)
        const limit = allowedCopies(snap)
        if (limit !== Infinity && total > limit) {
          const name = (col.name || '').toLowerCase()
          if (name !== 'sideboard') {
            setTransientMsg('Too many copies — drop into Sideboard')
            setTimeout(() => setTransientMsg(''), 2200)
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            } catch (e) {
              setActiveId(null)
            }
            return
          }
        }
      }
    }
  }

  function onDragCancel() {
    setActiveId(null)
    setTransientMsg('')
  }

  async function onDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const activeId2 = active.id
    const overId = over.id
    if (activeId2 === overId) return

    const fromCol = getContainerIdFor(activeId2)
    const toCol = getContainerIdFor(overId)
    if (!fromCol || !toCol) return

    const moving = findCardRowById(activeId2)
    if (!moving) return

    // Commander column rules on drag/drop
    if (toCol === commanderColumnId && fromCol !== commanderColumnId) {
      const snap = moving.card_snapshot || {}
      if (!isCommanderCandidateSnap(snap)) {
        setErr('Only a valid commander can be moved into the Commander column (usually Legendary Creature/Planeswalker).')
        return
      }
      if (commanderRow) {
        setErr('Commander slot already has a commander. Remove/move it out first.')
        return
      }
    }

    const fromList = [...(cardsByColumn[fromCol] || [])]
    const toList = fromCol === toCol ? fromList : [...(cardsByColumn[toCol] || [])]

    const activeIndex = fromList.findIndex(r => r.id === activeId2)
    if (activeIndex < 0) return

    // insertion index
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
      newFrom = fromList.filter(r => r.id !== activeId2)
      const movedRow = { ...moving, column_id: toCol }
      newTo = [...toList]
      newTo.splice(overIndex, 0, movedRow)
    }

    const updated = []
    newFrom.forEach((r, idx) => updated.push({ ...r, column_id: fromCol, sort_order: idx }))
    if (fromCol !== toCol) {
      newTo.forEach((r, idx) => updated.push({ ...r, column_id: toCol, sort_order: idx }))
    }

    const updatedMap = new Map(updated.map(r => [r.id, r]))
    const nextCards = cards.map(r => (updatedMap.has(r.id) ? { ...r, ...updatedMap.get(r.id) } : r))
    setCards(nextCards)

    await persistReorder(updated)
  }

  // pass dupe fix handler into child tiles
  function handleFixDuplicate(row, limit) {
    fixDuplicate(row, limit)
  }

  const decklistText = useMemo(() => buildDecklistText(cards), [cards])

  async function copyDecklist() {
    try {
      await navigator.clipboard.writeText(decklistText)
    } catch {
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
    setComboErr('Decklist copied to clipboard. Paste it into Commander Spellbook to find combos.')
  }

  async function findCombos() {
    setComboBusy(true)
    setComboErr('')
    setComboResults(null)
    try {
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

  const activeRow = useMemo(() => (activeId ? findCardRowById(activeId) : null), [activeId, cards])

  if (loading) {
    return (
      <div className="grid">
        <div className="panel">Loading…</div>
        <div className="panel">Loading…</div>
      </div>
    )
  }

  if (err && !deck) {
    return (
      <div className="panel">
        <div className="row" style={{ alignItems: 'center' }}>
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

  return (
    <div className="grid">
      <div>
        <SearchPanel columns={columns} commanderColumnId={commanderColumnId} onAddCard={addCardToDeck} />

        {err ? <div className="panel" style={{ marginTop: 14 }}><div className="tag danger">{err}</div></div> : null}

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Deck stats</h3>
            {saving ? <span className="tag">Saving…</span> : null}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={autoFixDupes} onChange={(e) => setAutoFixDupes(e.target.checked)} />
              <span className="muted">Auto-fix duplicates (move extras to Sideboard)</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={autoMoveIncompatible} onChange={(e) => setAutoMoveIncompatible(e.target.checked)} />
              <span className="muted">Auto-move incompatible cards</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={autoSwapCommander} onChange={(e) => setAutoSwapCommander(e.target.checked)} />
              <span className="muted">Auto-swap commander when setting new one</span>
            </label>
          </div>

          <div className="kpiRow" style={{ marginTop: 10 }}>
            <div className="kpi"><div className="label">Cards</div><div className="value">{deckStats.total}</div></div>
            <div className="kpi"><div className="label">Lands</div><div className="value">{deckStats.lands}</div></div>
            <div className="kpi"><div className="label">Avg MV</div><div className="value">{deckStats.avgMv.toFixed(2)}</div></div>
            <div className="kpi"><div className="label">Ramp</div><div className="value">{deckStats.ramp}</div></div>
            <div className="kpi"><div className="label">Draw</div><div className="value">{deckStats.draw}</div></div>
            <div className="kpi"><div className="label">Est. price</div><div className="value">${deckStats.priceTotal.toFixed(2)}</div></div>
          </div>

          <div style={{ marginTop: 10 }} className="muted">
            Curve: {['0','1','2','3','4','5','6+'].map(k => `${k}:${deckStats.curve[k] || 0}`).join('  •  ')}
          </div>
          <div style={{ marginTop: 6 }} className="muted">
            Pips: W {deckStats.pips.W} • U {deckStats.pips.U} • B {deckStats.pips.B} • R {deckStats.pips.R} • G {deckStats.pips.G}
          </div>

          <hr />

          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Deck checks</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {commanderRow ? `Commander colors: ${commanderCI.join('') || 'Colorless'}` : 'No commander set yet'}
            </span>
          </div>

          {deckChecks.color.length ? (
            <div style={{ marginTop: 10 }}>
              <div className="tag danger">
                {deckChecks.color.length} card(s) outside commander color identity.
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {deckChecks.color.slice(0, 8).map(r => (
                  <div key={r.id} className="row" style={{ alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{r.card_snapshot?.name}</div>
                    <button className="btn btnTiny danger" onClick={() => remove(r)} type="button">Remove</button>
                  </div>
                ))}
                {deckChecks.color.length > 8 ? <div className="muted" style={{ fontSize: 12 }}>…and more</div> : null}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>No color identity issues detected.</div>
          )}

          {deckChecks.dupes.length ? (
            <div style={{ marginTop: 12 }}>
              <div className="tag danger">
                Duplicate / copy-limit issues found.
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {deckChecks.dupes.slice(0, 8).map(d => (
                  <div key={d.row.id} className="row" style={{ alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{d.row.card_snapshot?.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>x{d.total} (limit {d.limit === Infinity ? '∞' : d.limit})</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>No duplicate issues detected.</div>
          )}

          <hr />

          <div className="row" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Combos</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={copyDecklist} type="button">Copy decklist</button>
              <button className="btn" onClick={openSpellbook} type="button">Open Spellbook</button>
                <button className="btn" onClick={exportDeckTXT} type="button">Export TXT</button>
                <button className="btn" onClick={exportDeckJSON} type="button">Export JSON</button>
                <button className="btn" onClick={() => setImportOpen(true)} type="button">Import decklist</button>
              <button className="btn primary" onClick={findCombos} disabled={comboBusy || !decklistText} type="button">
                {comboBusy ? 'Checking…' : 'Find combos'}
              </button>
            </div>
          </div>

          {comboErr ? (
            <div className="tag" style={{ marginTop: 10 }}>
              {comboErr}
            </div>
          ) : null}

          {comboResults ? (
            <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12 }} className="muted">
{JSON.stringify(comboResults, null, 2)}
            </pre>
          ) : (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              If combo lookup is blocked by CORS, “Open Spellbook” will still work (it copies your decklist).
            </div>
          )}
        
          {importOpen ? (
            <div className="modalBackdrop" onMouseDown={() => setImportOpen(false)}>
              <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modalHeader">
                  <div>
                    <h3 style={{ margin: 0 }}>Import decklist</h3>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Paste lines like "4 Sol Ring" or "Sol Ring" (one per line).</div>
                  </div>
                  <button className="btn" onClick={() => setImportOpen(false)}>Close</button>
                </div>

                <textarea className="input" style={{ minHeight: 160, marginTop: 10 }} value={importText} onChange={(e) => setImportText(e.target.value)} />

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn primary" disabled={importBusy} onClick={runImportText}>
                    {importBusy ? 'Importing…' : 'Import'}
                  </button>
                  <button className="btn" onClick={() => { setImportText(''); setImportLog([]) }}>Clear</button>
                </div>

                {importLog.length ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700 }}>Import log</div>
                    <div style={{ marginTop: 6, fontSize: 13 }} className="muted">
                      {importLog.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="panel">
          <div className="row" style={{ alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {deck?.name || 'Deck'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Format: {deck?.format || 'commander'} • {commanderRow ? `Commander: ${commanderRow.card_snapshot?.name}` : 'No commander'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setView(view === 'board' ? 'list' : 'board')} type="button">
                View: {view === 'board' ? 'Board' : 'List'}
              </button>
              <button className="btn" onClick={loadAll} type="button">Refresh</button>
            </div>
          </div>
        </div>

        {view === 'board' ? (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="boardWrap">
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={onDragStart}
                onDragCancel={onDragCancel}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
              >
                <div className="board">
                  {columns.map(col => {
                    let dropAllowed = true
                    let dropReason = ''
                    if (activeRow) {
                      const snap = activeRow.card_snapshot || {}
                      if (col.id === commanderColumnId) {
                        // moving within commander column is allowed
                        if (activeRow.column_id !== commanderColumnId) {
                          if (!isCommanderCandidateSnap(snap)) {
                            dropAllowed = false
                            dropReason = 'Not a valid commander (must be Legendary Creature or Planeswalker).'
                          } else if (commanderRow && commanderRow.id !== activeRow.id) {
                            dropAllowed = false
                            dropReason = 'Commander slot already occupied.'
                          }
                        }
                      }
                    }

                    return (
                      <BoardColumn
                        key={col.id}
                        column={col}
                        cards={cardsByColumn[col.id] || []}
                        onInc={inc}
                        onDec={dec}
                        onRemove={remove}
                        dropAllowed={dropAllowed}
                        dropReason={dropReason}
                        dupesMap={dupeMap}
                        onFixDuplicate={handleFixDuplicate}
                      />
                    )
                  })}
                </div>

                <DragOverlay>
                  {activeRow ? (
                    <div style={{ position: 'relative' }}>
                      <CardTile cardRow={activeRow} compact />
                      {/* show transient message near overlay when present */}
                      {transientMsg ? (
                        <div style={{ position: 'absolute', right: -8, top: -28 }} className="tag danger">{transientMsg}</div>
                      ) : null}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
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
  )
}
