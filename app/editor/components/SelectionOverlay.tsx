'use client';

import React, { RefObject } from 'react';
import { SelectionBox } from '../types';

interface SelectionOverlayProps {
  selectionBox: SelectionBox | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectionBox,
  containerRef
}) => {
  if (!selectionBox) return null;

  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <div
      className="fixed bg-blue-400/20 border border-blue-400 pointer-events-none z-50"
      style={{
        left: Math.min(selectionBox.startX, selectionBox.curX) + (containerRect?.left || 0),
        top: Math.min(selectionBox.startY, selectionBox.curY) + (containerRect?.top || 0),
        width: Math.abs(selectionBox.curX - selectionBox.startX),
        height: Math.abs(selectionBox.curY - selectionBox.startY)
      }}
    />
  );
};
