import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CardTile from './CardTile.jsx';

export default function SortableCardRow({ cardRow, stackIndex = 0, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardRow.id });

  const baseTransform = CSS.Transform.toString(transform);
  // Stacked / staggered layout, but remove offsets while dragging to prevent cursor mismatch
  const stackOffsetX = isDragging ? 0 : Math.min(stackIndex * 2, 10);
  const stackMarginTop = isDragging ? 0 : (stackIndex === 0 ? 0 : -64);

  const style = {
    transform: (`${baseTransform || ''} translateX(${stackOffsetX}px)`).replace('undefined', '').trim(),
    transition,
    opacity: isDragging ? 0.15 : 1,
    marginTop: stackMarginTop,
    position: 'relative',
    zIndex: isDragging ? 50 : (10 - Math.min(stackIndex, 9)),
  };

  return (
    <div ref={setNodeRef} style={style} className="stackItem">
      <div {...attributes} {...listeners} className="dragHandle" title="Drag to reorder / move">⠿</div>
      <CardTile cardRow={cardRow} onOpen={onOpen} />
    </div>
  );
}
