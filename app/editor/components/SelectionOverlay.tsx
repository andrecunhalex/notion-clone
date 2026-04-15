'use client';

import React, { RefObject, useLayoutEffect, useState } from 'react';
import { SelectionBox } from '../types';

interface SelectionOverlayProps {
  selectionBox: SelectionBox | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionBox,
  containerRef
}) => {
  const [origin, setOrigin] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!selectionBox) return;
    const rect = containerRef.current?.getBoundingClientRect();
    // DOM-measurement state: intentional layout-effect setState
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (rect) setOrigin({ left: rect.left, top: rect.top });
  }, [selectionBox, containerRef]);

  if (!selectionBox) return null;

  return (
    <div
      className="fixed bg-blue-400/20 border border-blue-400 pointer-events-none z-50"
      style={{
        left: Math.min(selectionBox.startX, selectionBox.curX) + origin.left,
        top: Math.min(selectionBox.startY, selectionBox.curY) + origin.top,
        width: Math.abs(selectionBox.curX - selectionBox.startX),
        height: Math.abs(selectionBox.curY - selectionBox.startY)
      }}
    />
  );
};
