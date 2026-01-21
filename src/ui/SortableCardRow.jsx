import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CardTile from './CardTile.jsx'

export default function SortableCardRow({ cardRow, stackIndex = 0, onInc, onDec, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardRow.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  }

  // Stacked / staggered layout
  const stackStyle = {
    marginTop: stackIndex === 0 ? 0 : -44,
    transform: (`${style.transform || ''} translateX(${Math.min(stackIndex * 2, 10)}px)`).replace('undefined', '').trim(),
    transition: style.transition,
    opacity: style.opacity,
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={stackStyle} className="stackItem">
      <div {...attributes} {...listeners} className="dragHandle" title="Drag to reorder / move">⠿</div>
      <CardTile cardRow={cardRow} onInc={onInc} onDec={onDec} onRemove={onRemove} />
    </div>
  )
}
