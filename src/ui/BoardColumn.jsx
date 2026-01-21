import React, { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortableCardRow from './SortableCardRow.jsx';

export default function BoardColumn({ column, cards, onOpen }) {
  const ids = useMemo(() => cards.map(c => c.id), [cards]);
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const [hoverId, setHoverId] = useState(null);
  const hoveredIndex = hoverId ? ids.indexOf(hoverId) : -1;

  return (
    <div className={"column" + (isOver ? " over" : "")}>
      <div className="columnHeader">
        <div style={{ fontWeight: 800 }}>{column.name}</div>
        <span className="tag">{cards.reduce((a, c) => a + (c.qty || 0), 0)}</span>
      </div>

      <div ref={setNodeRef} className="columnBody">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <div className="columnEmpty muted">Drop cards here</div>
          ) : (
            cards.map((row, idx) => (
              <SortableCardRow
                key={row.id}
                cardRow={row}
                index={idx}
                hoveredIndex={hoveredIndex}
                hoverId={hoverId}
                setHoverId={setHoverId}
                onOpen={onOpen}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
