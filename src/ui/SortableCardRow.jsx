import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CardTile from './CardTile.jsx';

export default function SortableCardRow({
  cardRow,
  index = 0,
  hoveredIndex = -1,
  hoverId = null,
  setHoverId,
  onOpen,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardRow.id });

  const baseTransform = CSS.Transform.toString(transform);

  const isHovered = hoverId === cardRow.id;
  const hasHover = hoveredIndex >= 0;

  // Compact overlap: show just a slice of each card until hover
  const overlap = 210; // px of overlap between cards
  const relaxedOverlap = 90; // when expanding around hover

  let marginTop = index === 0 ? 0 : -overlap;

  // When hovering one card, relax spacing for cards after it so it becomes visible
  if (hasHover && index > hoveredIndex) {
    marginTop = index === 0 ? 0 : -relaxedOverlap;
  }

  // While dragging, remove stacking offset to prevent cursor mismatch
  if (isDragging) {
    marginTop = 0;
  }

  const stackOffsetX = isDragging ? 0 : Math.min(index * 2, 10);

  const style = {
    transform: (`${baseTransform || ''} translateX(${stackOffsetX}px)`).replace('undefined', '').trim(),
    transition,
    opacity: isDragging ? 0.12 : 1,
    marginTop,
    position: 'relative',
    zIndex: isDragging ? 999 : (isHovered ? 800 : (200 - Math.min(index, 150))),
  };

  return (
    <div ref={setNodeRef} style={style} className={"stackItem" + (isHovered ? " hovered" : "")}>
      <div
        {...attributes}
        {...listeners}
        className="dragHandle"
        title="Drag to reorder / move"
      >
        ⠿
      </div>

      <div
        className="stackCardWrap"
        onMouseEnter={() => setHoverId?.(cardRow.id)}
        onMouseLeave={() => setHoverId?.(null)}
      >
        <CardTile cardRow={cardRow} onOpen={onOpen} />
      </div>
    </div>
  );
}
