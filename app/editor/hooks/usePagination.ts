// ---------------------------------------------------------------------------
// usePagination — manages block height tracking and page-break splitting
//
// How it works:
//   1. Each Block component reports its DOM height via handleHeightChange.
//   2. Heights are stored in a ref (no re-render) and flushed once per frame.
//   3. On first mount, we wait for all ResizeObserver callbacks (which fire in
//      the same frame) before doing the first flush. This prevents the "flicker"
//      where blocks jump between pages as heights arrive one by one.
//   4. getPaginatedBlocks (in utils/) uses these heights to split blocks into
//      pages. If a text block overflows a page boundary, the split logic below
//      breaks it into two blocks using a binary-search + Range API approach.
//
// Returns:
//   - blockHeights: Record<blockId, px> used by getPaginatedBlocks
//   - handleHeightChange: callback for Block's ResizeObserver
//   - ready: false until initial heights are collected (editor hides content)
// ---------------------------------------------------------------------------

import { useEffect, useCallback, useState, useRef } from 'react';
import { BlockData, ViewMode } from '../types';
import { generateId, PAGE_CONTENT_HEIGHT, isListType } from '../utils';

interface UsePaginationProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  viewMode: ViewMode;
  pageContentHeight?: number;
}

export const usePagination = ({ blocks, setBlocks, viewMode, pageContentHeight }: UsePaginationProps) => {
  const PAGE_H = pageContentHeight || PAGE_CONTENT_HEIGHT;
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  // `ready` starts false — the editor renders with opacity:0 until this flips to true
  const [ready, setReady] = useState(false);

  // Heights accumulate in a ref (zero re-renders) and are flushed to state once per frame
  const heightsRef = useRef<Record<string, number>>({});
  // measuredRef: initial heights have been collected (enables overflow split effect).
  // readyRef: layout has stabilized (no pending splits/reflows) — controls opacity gate.
  const measuredRef = useRef(false);
  const readyRef = useRef(false);
  const flushRaf = useRef(0);
  const quietRaf = useRef(0);
  const quietCount = useRef(0);
  const safetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety deadline: no matter what, flip `ready` after this many ms so the
  // editor never gets stuck invisible if layout never converges.
  const SAFETY_MS = 1000;
  const forceReady = useCallback(() => {
    if (readyRef.current) return;
    if (quietRaf.current) { cancelAnimationFrame(quietRaf.current); quietRaf.current = 0; }
    if (safetyTimeout.current) { clearTimeout(safetyTimeout.current); safetyTimeout.current = null; }
    readyRef.current = true;
    // Ensure we show the latest heights even if a flush was pending.
    setBlockHeights({ ...heightsRef.current });
    setReady(true);
  }, []);

  // After the initial flush, layout may still shift as the overflow-split effect
  // breaks long blocks into pages (each split → setBlocks → new ROs → new flush).
  // Instead of flipping `ready` as soon as heights arrive, we wait for a few
  // consecutive "quiet" frames — no height flushes, no splits — before revealing
  // the editor. This eliminates the visible "jumping" during initial pagination.
  const QUIET_FRAMES = 3;
  const armQuietCheck = useCallback(() => {
    if (readyRef.current) return;
    if (quietRaf.current) cancelAnimationFrame(quietRaf.current);
    quietCount.current = 0;
    const tick = () => {
      if (flushRaf.current) {
        // A flush is pending — restart the count after it lands.
        quietCount.current = 0;
      } else {
        quietCount.current++;
      }
      if (quietCount.current >= QUIET_FRAMES) {
        quietRaf.current = 0;
        if (safetyTimeout.current) { clearTimeout(safetyTimeout.current); safetyTimeout.current = null; }
        readyRef.current = true;
        setReady(true);
        return;
      }
      quietRaf.current = requestAnimationFrame(tick);
    };
    quietRaf.current = requestAnimationFrame(tick);
    // Arm (once) the absolute deadline — if quiet frames never happen, force show.
    if (!safetyTimeout.current) {
      safetyTimeout.current = setTimeout(forceReady, SAFETY_MS);
    }
  }, [forceReady]);

  const handleHeightChange = useCallback((id: string, height: number) => {
    // Skip if unchanged — avoids unnecessary RAF scheduling
    const prev = heightsRef.current[id];
    if (prev === height) return;
    heightsRef.current[id] = height;

    if (!measuredRef.current) {
      // FIRST MOUNT: wait for (a) ResizeObservers to settle in this frame AND
      // (b) web fonts to finish loading, then flip `measured` so the split
      // effect can run. `ready` is still false — the quiet-frame check below
      // will flip it once splits converge.
      if (!flushRaf.current) {
        flushRaf.current = 1; // non-zero sentinel so concurrent calls don't re-schedule
        const finalize = () => {
          flushRaf.current = 0;
          measuredRef.current = true;
          setBlockHeights({ ...heightsRef.current });
          armQuietCheck();
        };
        requestAnimationFrame(() => {
          const fontsReady = (typeof document !== 'undefined' && document.fonts?.ready)
            ? document.fonts.ready
            : Promise.resolve();
          fontsReady.then(() => {
            requestAnimationFrame(finalize);
          });
        });
      }
      return;
    }

    // STEADY STATE: batch all height changes within a frame into one setState.
    // If we're still stabilizing (ready=false), re-arm the quiet check — any
    // new flush means layout hasn't settled yet.
    if (!flushRaf.current) {
      flushRaf.current = requestAnimationFrame(() => {
        flushRaf.current = 0;
        setBlockHeights({ ...heightsRef.current });
        if (!readyRef.current) armQuietCheck();
      });
    }
  }, [armQuietCheck]);

  // Cancel pending timers on unmount
  useEffect(() => () => {
    if (quietRaf.current) cancelAnimationFrame(quietRaf.current);
    if (flushRaf.current && flushRaf.current !== 1) cancelAnimationFrame(flushRaf.current);
    if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
  }, []);

  // --- Overflow Split: auto-break text blocks that exceed page height ---
  // Guard against infinite loops: skip if we just split this block
  const lastSplitRef = useRef<string | null>(null);
  const setBlocksRef = useRef(setBlocks);
  useEffect(() => { setBlocksRef.current = setBlocks; });

  // Overflow split (text blocks that exceed page height)
  useEffect(() => {
    if (viewMode !== 'paginated' || !measuredRef.current) return;

    let currentH = 0;
    let splitAction: { id: string; splitPoint: number } | null = null;

    for (const block of blocks) {
      const h = blockHeights[block.id] || 24;
      const canSplit = block.type === 'text' || isListType(block.type);

      if (h >= PAGE_H && canSplit) {
        splitAction = { id: block.id, splitPoint: PAGE_H - 50 };
        break;
      }

      if (currentH + h > PAGE_H) {
        const availableH = PAGE_H - currentH;
        if (canSplit && availableH > 50 && h > availableH) {
          splitAction = { id: block.id, splitPoint: availableH };
          break;
        }
        currentH = h;
      } else {
        currentH += h;
      }
    }

    if (splitAction) {
      const { id, splitPoint } = splitAction;
      if (lastSplitRef.current === id) return;

      const el = document.getElementById(`editable-${id}`);
      if (!el) return;

      const htmlContent = el.innerHTML;

      const measure = document.createElement('div');
      measure.style.cssText = window.getComputedStyle(el).cssText;
      measure.style.position = 'absolute';
      measure.style.visibility = 'hidden';
      measure.style.width = el.clientWidth + 'px';
      measure.innerHTML = htmlContent;
      document.body.appendChild(measure);

      const textNodes: Text[] = [];
      const tw = document.createTreeWalker(measure, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) textNodes.push(tw.currentNode as Text);

      const savedTexts = textNodes.map(n => n.textContent || '');
      const totalLen = savedTexts.reduce((sum, t) => sum + t.length, 0);

      const truncateAt = (idx: number) => {
        let remaining = idx;
        for (let i = 0; i < textNodes.length; i++) {
          const len = savedTexts[i].length;
          if (remaining < len) {
            textNodes[i].textContent = savedTexts[i].substring(0, remaining);
            for (let j = i + 1; j < textNodes.length; j++) textNodes[j].textContent = '';
            return;
          }
          textNodes[i].textContent = savedTexts[i];
          remaining -= len;
        }
      };

      const restoreAll = () => {
        for (let i = 0; i < textNodes.length; i++) textNodes[i].textContent = savedTexts[i];
      };

      let low = 0, high = totalLen, bestIndex = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        truncateAt(mid);
        if (measure.getBoundingClientRect().height <= splitPoint) {
          bestIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      restoreAll();
      document.body.removeChild(measure);

      if (bestIndex > 5 && bestIndex < totalLen - 5) {
        const extract = document.createElement('div');
        extract.innerHTML = htmlContent;

        const textNodes2: Text[] = [];
        const tw2 = document.createTreeWalker(extract, NodeFilter.SHOW_TEXT);
        while (tw2.nextNode()) textNodes2.push(tw2.currentNode as Text);

        let remaining = bestIndex;
        let splitNode: Text = textNodes2[0];
        let splitOffset = 0;
        for (let i = 0; i < textNodes2.length; i++) {
          const len = (textNodes2[i].textContent || '').length;
          if (remaining <= len) {
            splitNode = textNodes2[i];
            splitOffset = remaining;
            break;
          }
          remaining -= len;
        }

        const range1 = document.createRange();
        range1.setStartBefore(extract.firstChild!);
        range1.setEnd(splitNode, splitOffset);
        const div1 = document.createElement('div');
        div1.appendChild(range1.cloneContents());
        const part1 = div1.innerHTML;

        const range2 = document.createRange();
        range2.setStart(splitNode, splitOffset);
        range2.setEndAfter(extract.lastChild!);
        const div2 = document.createElement('div');
        div2.appendChild(range2.cloneContents());
        const part2 = div2.innerHTML;

        const index = blocks.findIndex(b => b.id === id);
        if (index === -1) return;

        const newBlock1 = { ...blocks[index], content: part1 };
        const newBlock2 = { ...blocks[index], id: generateId(), content: part2 };

        const newBlocks = [...blocks];
        newBlocks.splice(index, 1, newBlock1, newBlock2);
        lastSplitRef.current = id;
        setBlocksRef.current(newBlocks);

        requestAnimationFrame(() => {
          const nextEl = document.getElementById(`editable-${newBlock2.id}`);
          if (nextEl) nextEl.focus({ preventScroll: true });
        });
      }
    }
  }, [blockHeights, blocks, viewMode]);

  return { blockHeights, handleHeightChange, ready };
};
