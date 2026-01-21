import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CardTile from './CardTile.jsx'

export default function SortableCardRow({ cardRow, onInc, onDec, onRemove, stackIndex = 0, dupeInfo = null, onFixDuplicate = null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardRow.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    marginTop: stackIndex === 0 ? 0 : -72,
    marginLeft: stackIndex % 2 === 0 ? 0 : 12,
    zIndex: 10000 - stackIndex,
  }

  return (
    <div ref={setNodeRef} style={style} className="stackRow">
      <div {...attributes} {...listeners} className="dragGrip" title="Drag">
        ⠿
      </div>
      <CardTile cardRow={cardRow} onInc={onInc} onDec={onDec} onRemove={onRemove} dupeInfo={dupeInfo} onFixDuplicate={onFixDuplicate} />
    </div>
  )
}
