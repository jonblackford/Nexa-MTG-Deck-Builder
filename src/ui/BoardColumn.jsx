import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SortableCardRow from './SortableCardRow.jsx'

export default function BoardColumn({ column, cards, onInc, onDec, onRemove }) {
  const ids = cards.map(c => c.id)
  const { setNodeRef } = useDroppable({ id: column.id })
  return (
    <div className="column" ref={setNodeRef}>
      <div className="columnHeader">
        <div style={{fontWeight:800}}>{column.name}</div>
        <span className="tag">{cards.reduce((a,c)=>a+c.qty,0)}</span>
      </div>
      <div className="columnBody">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.map(row => (
            <SortableCardRow
              key={row.id}
              cardRow={row}
              onInc={onInc}
              onDec={onDec}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
