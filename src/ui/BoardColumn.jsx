import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableCardRow from './SortableCardRow.jsx'

export default function BoardColumn({ column, cards, onInc, onDec, onRemove, dropAllowed = true, dropReason = '', dupesMap = new Map(), onFixDuplicate = null }) {
  const ids = cards.map(c => c.id)
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className={'column' + (isOver ? ' columnOver' : '') + (isOver && !dropAllowed ? ' columnForbidden' : '')} ref={setNodeRef}>
      <div className="columnHeader">
        <div style={{ fontWeight: 900 }}>{column.name}</div>
        <span className="tag">{cards.reduce((a, c) => a + (c.qty || 0), 0)}</span>
      </div>

      {!dropAllowed && isOver ? (
        <div style={{ marginTop: 8 }} className="tag danger">{dropReason || 'Cannot drop here'}</div>
      ) : null}

      <div className="columnBody">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <div className="columnEmpty">Drop cards here</div>
          ) : null}

          {cards.map((row, idx) => (
            <SortableCardRow
              key={row.id}
              cardRow={row}
              onInc={onInc}
              onDec={onDec}
              onRemove={onRemove}
              stackIndex={idx}
              dupeInfo={dupesMap.get(row.id)}
              onFixDuplicate={onFixDuplicate}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
