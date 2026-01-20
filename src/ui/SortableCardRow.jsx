import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CardTile from './CardTile.jsx'

export default function SortableCardRow({ cardRow, onInc, onDec, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardRow.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} className="dragHandle" title="Drag to reorder / move">
        ⠿
      </div>
      <CardTile cardRow={cardRow} onInc={onInc} onDec={onDec} onRemove={onRemove} />
    </div>
  )
}
