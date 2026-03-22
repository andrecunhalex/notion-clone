import { useState, useCallback, useEffect, useRef, RefObject } from 'react';
import { SelectionBox, BlockData } from '../types';

interface UseSelectionProps {
  blocks: BlockData[];
  containerRef: RefObject<HTMLDivElement | null>;
  blockRefs: RefObject<{ [key: string]: HTMLDivElement | null }>;
}

export const useSelection = ({ blocks, containerRef, blockRefs }: UseSelectionProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const drag = useRef({ active: false, startX: 0, startY: 0, moved: false });
  const rafId = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d.active || !containerRef.current) return;

      d.moved = true;

      // Throttle with RAF — at most 1 layout calculation per frame
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        setSelectionBox({ startX: d.startX, startY: d.startY, curX, curY });

        const left = Math.min(d.startX, curX), right = Math.max(d.startX, curX);
        const top = Math.min(d.startY, curY), bottom = Math.max(d.startY, curY);

        const sel = new Set<string>();
        blocksRef.current.forEach(block => {
          const el = blockRefs.current?.[block.id];
          if (!el) return;
          const r = el.getBoundingClientRect();
          const bL = r.left - rect.left, bT = r.top - rect.top;
          if (left < bL + r.width && right > bL && top < bT + r.height && bottom > bT) {
            sel.add(block.id);
          }
        });
        setSelectedIds(sel);
      });
    };

    const onUp = () => {
      if (drag.current.active) {
        cancelAnimationFrame(rafId.current);
        drag.current.active = false;
        setSelectionBox(null);
      }
    };

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.drag-handle')) {
        setSelectedIds(new Set());
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      cancelAnimationFrame(rafId.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [containerRef, blockRefs]);

  const startSelection = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drag.current = { active: true, startX: x, startY: y, moved: false };
    setSelectionBox({ startX: x, startY: y, curX: x, curY: y });
    setSelectedIds(new Set());
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [containerRef]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const didDragSelect = useCallback(() => drag.current.moved, []);

  return { selectedIds, setSelectedIds, selectionBox, startSelection, clearSelection, didDragSelect };
};
