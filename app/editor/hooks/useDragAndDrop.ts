import { useCallback, useRef, useEffect, RefObject } from 'react';
import { DropTarget, BlockData } from '../types';

interface UseDragAndDropProps {
  blocks: BlockData[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  blockRefs: RefObject<{ [key: string]: HTMLDivElement | null }>;
  moveBlocks: (ids: string[], targetId: string, position: 'top' | 'bottom') => void;
  /** Scroll container — needed for auto-scroll during drag and to preserve
   *  the viewport position of the drop target after React reflows. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Inner document container (parent of all pages). The drop indicator is
   *  positioned absolutely relative to this element. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The shared drop-indicator element rendered once at the top of the
   *  document container. Driven by direct DOM writes during drag (no React
   *  state) to keep the re-render cost at zero. */
  dropIndicatorRef: RefObject<HTMLDivElement | null>;
}

export const useDragAndDrop = ({
  blocks, selectedIds, setSelectedIds, blockRefs, moveBlocks,
  scrollRef, containerRef, dropIndicatorRef,
}: UseDragAndDropProps) => {
  // Keep a live-value ref for blocks used by the callbacks below.
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; });

  // Mutable drag state — lives in a ref (no React state) so `dragover` at
  // ~60Hz doesn't trigger a re-render of the editor tree on every tick.
  // The drop indicator is a plain DOM node whose position we mutate directly
  // (see positionIndicator / hideIndicator below).
  const drag = useRef({ ids: [] as string[], target: null as DropTarget | null });

  // --- Auto-scroll while dragging ---
  //
  // HTML5 native drag-and-drop captures the pointer and refuses to emit
  // normal scroll events, so if the user drags a block and wants to reach
  // a different page, we have to drive the scroll ourselves. The pattern:
  //
  //   1. On each `dragover`, compute a vertical velocity based on how close
  //      the cursor is to the top/bottom edge of the scroll container.
  //   2. Keep a `requestAnimationFrame` loop alive while velocity ≠ 0,
  //      scrolling the container by `velocity` px per frame.
  //   3. The loop self-terminates when the cursor moves away from the edge
  //      (velocity becomes 0), or on drop / dragend.
  //
  // This gives smooth continuous scrolling even when the user holds the
  // cursor still near the edge — no dragover events fire in that case, but
  // the rAF loop keeps going.
  /**
   * Directly write the drop indicator's position into the shared DOM node.
   * No setState, no re-render — just one style mutation per movement. We
   * compare against the previously-set target to skip redundant writes when
   * the cursor drifts within the same half of the same target block.
   *
   * Coordinate system note: in paginated mode, `containerRef` carries
   * `transform: scale(zoom)`, so `getBoundingClientRect` returns already-
   * scaled viewport coordinates — but the indicator is a child of the
   * transformed container and its own `transform` style is composed BEFORE
   * the parent's scale, so we need UNSCALED local offsets. `offsetTop` /
   * `offsetLeft` give us exactly that, walking up the offsetParent chain
   * until we reach the container.
   */
  const positionIndicator = useCallback((targetId: string, pos: 'top' | 'bottom') => {
    const prev = drag.current.target;
    if (prev && prev.id === targetId && prev.position === pos) return;
    drag.current.target = { id: targetId, position: pos };

    const indicator = dropIndicatorRef.current;
    const container = containerRef.current;
    const targetEl = blockRefs.current?.[targetId];
    if (!indicator || !container || !targetEl) return;

    // Sum offsets from the block up through its offsetParent chain until
    // we reach the document container. This yields unscaled coordinates
    // in the container's local space, immune to the paginated-mode scale
    // transform.
    let top = 0;
    let left = 0;
    let node: HTMLElement | null = targetEl;
    while (node && node !== container) {
      top += node.offsetTop;
      left += node.offsetLeft;
      node = node.offsetParent as HTMLElement | null;
    }

    const indicatorTop = top + (pos === 'bottom' ? targetEl.offsetHeight - 2 : -2);

    indicator.style.display = 'block';
    indicator.style.transform = `translate(${left}px, ${indicatorTop}px)`;
    indicator.style.width = `${targetEl.offsetWidth}px`;
  }, [containerRef, dropIndicatorRef, blockRefs]);

  const hideIndicator = useCallback(() => {
    drag.current.target = null;
    const indicator = dropIndicatorRef.current;
    if (indicator) indicator.style.display = 'none';
  }, [dropIndicatorRef]);

  // Last known pointer position — used so the rAF auto-scroll loop can
  // re-run target detection without fresh dragover events.
  const lastPointer = useRef({ x: 0, y: 0 });

  const refreshTargetAtLastPointer = useCallback(() => {
    const { y } = lastPointer.current;
    const { ids } = drag.current;
    if (ids.length === 0) return;

    // Walk non-dragged blocks looking for one whose vertical range contains y.
    const nonDragged = blocksRef.current.filter(b => !ids.includes(b.id));
    for (const b of nonDragged) {
      const el = blockRefs.current?.[b.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        const pos: 'top' | 'bottom' = y < r.top + r.height / 2 ? 'top' : 'bottom';
        positionIndicator(b.id, pos);
        return;
      }
    }
    // If no block contains y, fall back to the first/last extremity.
    if (nonDragged.length > 0) {
      const firstEl = blockRefs.current?.[nonDragged[0].id];
      const lastEl = blockRefs.current?.[nonDragged[nonDragged.length - 1].id];
      if (firstEl && y < firstEl.getBoundingClientRect().top) {
        positionIndicator(nonDragged[0].id, 'top');
      } else if (lastEl && y > lastEl.getBoundingClientRect().bottom) {
        positionIndicator(nonDragged[nonDragged.length - 1].id, 'bottom');
      }
    }
  }, [blockRefs, positionIndicator]);

  const autoScroll = useRef({ velocity: 0, rafId: 0 });

  const stopAutoScroll = useCallback(() => {
    const s = autoScroll.current;
    if (s.rafId) cancelAnimationFrame(s.rafId);
    s.rafId = 0;
    s.velocity = 0;
  }, []);

  const updateAutoScroll = useCallback((clientY: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();

    /** Pixels from the edge where auto-scroll engages */
    const EDGE = 120;
    /** Max scroll speed in px per frame (≈ 2700 px/sec at 60fps) */
    const MAX_SPEED = 45;

    // Quadratic ease: speed ramps up slowly at the edge boundary and
    // accelerates deeper in, so brushing the edge barely scrolls but
    // holding fully into the zone scrolls fast.
    let v = 0;
    if (clientY < rect.top + EDGE) {
      const t = Math.min(1, (rect.top + EDGE - clientY) / EDGE);
      v = -MAX_SPEED * t * t;
    } else if (clientY > rect.bottom - EDGE) {
      const t = Math.min(1, (clientY - (rect.bottom - EDGE)) / EDGE);
      v = MAX_SPEED * t * t;
    }

    const s = autoScroll.current;
    s.velocity = v;

    if (v !== 0 && !s.rafId) {
      const step = () => {
        const cur = scrollRef.current;
        if (!cur || s.velocity === 0) { s.rafId = 0; return; }
        cur.scrollTop += s.velocity;
        // Re-run target detection at the cursor's last known viewport Y so
        // the drop indicator follows the scroll even when the user is
        // holding the cursor still (no fresh dragover events).
        refreshTargetAtLastPointer();
        s.rafId = requestAnimationFrame(step);
      };
      s.rafId = requestAnimationFrame(step);
    }
  }, [scrollRef, refreshTargetAtLastPointer]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id];
    if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    drag.current.ids = ids;
    drag.current.target = null;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';

    // Ghost — clone actual rendered block DOM for a real preview
    // Wrapper allows badge to overflow the inner container
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute', top: '-1000px',
      zIndex: '9999', pointerEvents: 'none',
      padding: '10px', // room for the badge to overflow
    });

    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      backgroundColor: 'white',
      padding: '8px', borderRadius: '6px', width: '320px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,.1)', border: '1px solid #e5e7eb',
      overflow: 'hidden', position: 'relative',
    });
    wrapper.appendChild(ghost);

    const draggedBlocks = blocks.filter(b => ids.includes(b.id));
    draggedBlocks.slice(0, 3).forEach(b => {
      const blockEl = blockRefs.current?.[b.id];
      if (blockEl) {
        // Clone the .notion-block-content area (the actual rendered content, not the drag handle)
        const contentEl = blockEl.querySelector('.notion-block-content') as HTMLElement | null;
        const source = contentEl || blockEl;
        const clone = source.cloneNode(true) as HTMLElement;
        // Scale down to fit the ghost width
        Object.assign(clone.style, {
          transform: 'scale(0.85)', transformOrigin: 'top left',
          maxHeight: '120px', overflow: 'hidden', pointerEvents: 'none',
          marginBottom: '4px',
        });
        // Remove selection highlight (bg-blue-100) — reset to white/transparent
        clone.classList.remove('bg-blue-100');
        clone.classList.add('bg-white');
        // Also strip from any nested elements that may have selection bg
        clone.querySelectorAll('.bg-blue-100').forEach(el => {
          el.classList.remove('bg-blue-100');
        });
        // Remove interactive states
        clone.querySelectorAll('[contenteditable]').forEach(el => {
          (el as HTMLElement).removeAttribute('contenteditable');
        });
        ghost.appendChild(clone);
      } else {
        // Fallback: text label
        const div = document.createElement('div');
        div.textContent = b.content || ({
          text: 'Texto vazio', h1: 'Título vazio', h2: 'Subtítulo vazio',
          h3: 'Subtítulo vazio', bullet_list: 'Item com marcador',
          numbered_list: 'Item numerado', table: 'Tabela',
          divider: '———', image: 'Imagem',
        } as Record<string, string>)[b.type] || '';
        Object.assign(div.style, {
          fontSize: '12px', color: '#374151', marginBottom: '4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: b.type.startsWith('h') ? 'bold' : 'normal',
        });
        ghost.appendChild(div);
      }
    });
    if (draggedBlocks.length > 3) {
      const more = document.createElement('div');
      more.textContent = `+ mais ${draggedBlocks.length - 3} blocos...`;
      Object.assign(more.style, { fontSize: '10px', color: '#9ca3af', marginTop: '4px' });
      ghost.appendChild(more);
    }
    if (draggedBlocks.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = draggedBlocks.length.toString();
      Object.assign(badge.style, {
        position: 'absolute', top: '2px', right: '2px',
        backgroundColor: '#ef4444', color: 'white', borderRadius: '9999px',
        width: '20px', height: '20px', fontSize: '11px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
      });
      ghost.appendChild(badge);
    }
    document.body.appendChild(wrapper);
    e.dataTransfer.setDragImage(wrapper, 10, 10);
    setTimeout(() => document.body.removeChild(wrapper), 0);
  }, [blocks, selectedIds, setSelectedIds, blockRefs]);

  // Block-level: set target for blocks NOT being dragged.
  // All drag state lives in refs — no React state updates, no re-renders.
  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lastPointer.current.x = e.clientX;
    lastPointer.current.y = e.clientY;
    updateAutoScroll(e.clientY);
    if (drag.current.ids.includes(targetId)) return;
    const el = blockRefs.current?.[targetId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos: 'top' | 'bottom' = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    positionIndicator(targetId, pos);
  }, [blockRefs, positionIndicator, updateAutoScroll]);

  // Container-level: handles the extremes (above the first / below the last)
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lastPointer.current.x = e.clientX;
    lastPointer.current.y = e.clientY;
    updateAutoScroll(e.clientY);
    const { ids } = drag.current;
    if (ids.length === 0) return;
    const nonDragged = blocksRef.current.filter(b => !ids.includes(b.id));
    if (nonDragged.length === 0) return;
    const first = blockRefs.current?.[nonDragged[0].id];
    const last = blockRefs.current?.[nonDragged[nonDragged.length - 1].id];
    if (first && e.clientY < first.getBoundingClientRect().top) {
      positionIndicator(nonDragged[0].id, 'top');
    } else if (last && e.clientY > last.getBoundingClientRect().bottom) {
      positionIndicator(nonDragged[nonDragged.length - 1].id, 'bottom');
    }
  }, [blockRefs, positionIndicator, updateAutoScroll]);

  // Drop: execute the move, then compensate scroll so the target block stays
  // anchored at the same viewport position after React reflows content.
  //
  // Without this compensation, reordering shifts the document vertically by
  // however many pixels the dragged blocks spanned — so after drop the user
  // sees a completely different chunk of the doc, which is disorienting
  // (and in paginated mode looks like "jumping to a random page").
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    stopAutoScroll();
    const { target, ids } = drag.current;
    if (!target || ids.length === 0) return;

    // Snapshot the target block's viewport top BEFORE mutating state so we
    // can put it back in the same spot after React reflows the content.
    const scrollEl = scrollRef.current;
    const targetEl = blockRefs.current?.[target.id];
    const preTop = targetEl?.getBoundingClientRect().top ?? null;

    moveBlocks(ids, target.id, target.position);
    drag.current = { ids: [], target: null };
    hideIndicator();

    // Two rAFs wait for React commit + browser paint, then scroll by the
    // target's delta so the dropped block stays visually anchored.
    if (scrollEl && preTop !== null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newTargetEl = blockRefs.current?.[target.id];
          if (!newTargetEl) return;
          const newTop = newTargetEl.getBoundingClientRect().top;
          const delta = newTop - preTop;
          if (delta !== 0) scrollEl.scrollTop += delta;
        });
      });
    }
  }, [moveBlocks, scrollRef, blockRefs, stopAutoScroll, hideIndicator]);

  const clearDropTarget = useCallback(() => {
    stopAutoScroll();
    drag.current = { ids: [], target: null };
    hideIndicator();
  }, [stopAutoScroll, hideIndicator]);

  // Safety net: stop the rAF loop if the hook unmounts mid-drag.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  return {
    handleDragStart, handleDragOver,
    handleContainerDragOver, handleDrop, clearDropTarget,
  };
};
