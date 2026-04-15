'use client';

/**
 * useFormatCommands — the **single source of truth** for text formatting in
 * the editor.
 *
 * Responsibilities:
 *   • Reads the current selection and derives format state (active formats,
 *     current font/size/color/alignment/link).
 *   • Exposes `apply*` commands that mutate either:
 *       – the live text selection (execCommand)
 *       – the block-level selection (via staging + `setBlocks`)
 *       – the document meta (for truly-no-selection font/size defaults)
 *     with atomic history batching for every path.
 *   • Owns the keyboard shortcuts (⌘B / ⌘I / ⌘U / ⌘⇧X / ⌘K / ⌘E).
 *   • Owns the click-on-link navigation handler.
 *   • Tracks the "saved" selection so the toolbar can restore it after a
 *     button click steals focus.
 *
 * ## How it is consumed
 *
 * The hook is wrapped in `FormatCommandsProvider`, which is mounted once in
 * `NotionEditor`. Both toolbars (`Toolbar`, `FloatingToolbar`) read from it
 * through `useFormatCommandsContext()`.
 *
 * The provider pattern is **load-bearing**, not a style choice: when format
 * state changes (e.g. the cursor moves and `setActiveFormats` fires), only
 * the provider and its context consumers re-render. `NotionEditor` itself
 * does NOT re-run, which means the large blocks subtree is spared a full
 * reconciliation on every cursor movement. Calling `useFormatCommands`
 * directly in `NotionEditor` would couple format state changes to the whole
 * editor render cycle — a performance regression on large documents.
 */

import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { FontEntry, DEFAULT_FONT_SIZE } from '../fonts';
import { BlockData, TextAlign } from '../types';
import { isMac } from '../constants';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FormatCommands {
  // --- Detected state (re-runs on cursor/selection change and block updates) ---
  activeFormats: Set<string>;
  currentTextColor: string;
  currentBgColor: string;
  currentFont: string;
  currentWeight: number;
  currentFontSize: number;
  currentAlign: TextAlign;
  currentLink: HTMLAnchorElement | null;

  // --- Selection helpers ---
  /** True iff the (live or saved) selection is a non-collapsed range inside an editable. */
  hasTextSelection: () => boolean;
  /** True iff the cursor is anywhere inside any editable (collapsed OK). */
  cursorInEditable: () => boolean;
  saveSelection: () => void;
  restoreSelection: () => void;
  getSelectedBlockId: () => string | null;
  /** Manually re-run format detection. Exposed so UIs can refresh after they mutate state themselves. */
  detectFormats: () => void;

  // --- Apply commands ---
  applyFormat: (command: string) => void;
  applyTextColor: (color: string) => void;
  applyBgColor: (color: string) => void;
  applyFont: (font: FontEntry) => void;
  applyWeight: (weight: number) => void;
  applyFontSize: (size: number) => void;
  applyAlignment: (align: TextAlign) => void;
  applyLink: (url: string) => void;
  removeLink: () => void;
  applyRef: (targetBlockId: string) => void;
}

export interface UseFormatCommandsProps {
  blocks?: BlockData[];
  updateBlock?: (id: string, updates: Partial<BlockData>) => void;
  /**
   * Batch block updater — required for atomic history on doc-wide ops. Every
   * fallback path (block-selection wrap, execCommand staging, alignment
   * spread) commits through a single `setBlocks` call so undo reverts the
   * whole operation in one step.
   */
  setBlocks?: (blocks: BlockData[]) => void;
  /** Block IDs currently shift-/drag-selected. Doc-wide ops scope to these when non-empty. */
  selectedBlockIds?: Set<string>;
  allFonts: FontEntry[];
  /** Truly-no-selection fallback for font family. */
  setDocumentFont?: (family: string) => void;
  /** Truly-no-selection fallback for font size. */
  setDocumentFontSize?: (size: number) => void;
}

// ---------------------------------------------------------------------------
// Module-private: block type gates
// ---------------------------------------------------------------------------

const TEXT_BLOCK_TYPES: ReadonlySet<BlockData['type']> = new Set([
  'text', 'h1', 'h2', 'h3', 'bullet_list', 'numbered_list',
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useFormatCommands = ({
  blocks,
  updateBlock,
  setBlocks,
  selectedBlockIds,
  allFonts,
  setDocumentFont,
  setDocumentFontSize,
}: UseFormatCommandsProps): FormatCommands => {
  // --- Detected state ---
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [currentTextColor, setCurrentTextColor] = useState('');
  const [currentBgColor, setCurrentBgColor] = useState('');
  const [currentFont, setCurrentFont] = useState('');
  const [currentWeight, setCurrentWeight] = useState(400);
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE);
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('left');
  const [currentLink, setCurrentLink] = useState<HTMLAnchorElement | null>(null);

  // The last non-collapsed selection range we saw. Used to restore the
  // selection after a toolbar button click steals focus.
  const savedRange = useRef<Range | null>(null);

  // Live-value refs so `useCallback`-wrapped commands stay stable across
  // renders while still reading the latest blocks / selectedBlockIds / fonts.
  // The assignments happen in an effect so the refs are always in sync with
  // the render that just committed — apply functions run on user interaction,
  // after that effect has fired, so they always see fresh values.
  const blocksRef = useRef(blocks);
  const selectedBlockIdsRef = useRef(selectedBlockIds);
  const allFontsRef = useRef(allFonts);
  useEffect(() => {
    blocksRef.current = blocks;
    selectedBlockIdsRef.current = selectedBlockIds;
    allFontsRef.current = allFonts;
  });

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  const getSelectedBlockId = useCallback((): string | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const el = sel.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (sel.anchorNode as HTMLElement)
      : sel.anchorNode?.parentElement;
    const editable = el?.closest('[id^="editable-"]') || el?.closest('[data-editable]');
    if (!editable) return null;
    if (editable.id?.startsWith('editable-')) return editable.id.replace('editable-', '');
    const wrapper = editable.closest('[data-block-id]');
    return wrapper?.getAttribute('data-block-id') || null;
  }, []);

  const findStyledSpan = useCallback((node: Node | null): HTMLSpanElement | null => {
    if (!node) return null;
    let el: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
    while (el && !el.hasAttribute('contenteditable')) {
      if (el.tagName === 'SPAN' && (el.style.fontFamily || el.style.fontWeight || el.style.fontSize)) {
        return el as HTMLSpanElement;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (savedRange.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
    }
  }, []);

  /** Non-collapsed selection inside an editable. Used by apply* functions to
   *  decide whether to operate on a text range vs. fall back to doc-wide. */
  const hasTextSelection = useCallback((): boolean => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const anchor = sel.anchorNode;
      const el = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor?.parentElement;
      const editable = el?.closest('[contenteditable="true"], [contenteditable=""]');
      if (editable && (
        editable.id?.startsWith('editable-') ||
        editable.hasAttribute('data-table-cell') ||
        editable.hasAttribute('data-editable')
      )) return true;
    }
    const saved = savedRange.current;
    if (!saved || saved.collapsed) return false;
    const node = saved.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!el?.closest('[contenteditable="true"], [contenteditable=""]');
  }, []);

  /** Any cursor position in any editable (collapsed OK). Used by detection
   *  listeners to decide whether to refresh displayed state. */
  const cursorInEditable = useCallback((): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const anchor = sel.anchorNode;
    if (!anchor) return false;
    const el = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    if (!el) return false;
    const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
    if (!editable) return false;
    return !!(
      editable.id?.startsWith('editable-') ||
      editable.hasAttribute('data-table-cell') ||
      editable.hasAttribute('data-editable')
    );
  }, []);

  // -------------------------------------------------------------------------
  // Format detection
  // -------------------------------------------------------------------------

  const detectFormats = useCallback(() => {
    const formats = new Set<string>();
    try {
      if (document.queryCommandState('bold')) formats.add('bold');
      if (document.queryCommandState('italic')) formats.add('italic');
      if (document.queryCommandState('underline')) formats.add('underline');
      if (document.queryCommandState('strikeThrough')) formats.add('strikethrough');
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode?.parentElement;
        if (node?.closest('code')) formats.add('code');
        const anchor = node?.closest('a') as HTMLAnchorElement | null;
        if (anchor) {
          formats.add('link');
          setCurrentLink(anchor);
        } else {
          setCurrentLink(null);
        }
      }
    } catch { /* ignore queryCommandState errors */ }
    setActiveFormats(formats);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const node = sel.anchorNode;
    const el = node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node as Node)?.parentElement;

    if (el) {
      const computed = window.getComputedStyle(el);
      const family = computed.fontFamily;
      const weight = parseInt(computed.fontWeight, 10) || 400;
      const fontSize = Math.round(parseFloat(computed.fontSize) * 0.75) || DEFAULT_FONT_SIZE;
      setCurrentFontSize(fontSize);

      const sortedFonts = [...allFontsRef.current].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
      const matched = sortedFonts.find(f =>
        family.toLowerCase().includes(f.family.split(',')[0].trim().replace(/['"]/g, '').toLowerCase())
      );
      setCurrentFont(matched?.family || '');
      setCurrentWeight(weight);

      // Walk up until we hit the editable root — collects the nearest
      // explicit text color override, if any.
      let colorEl: HTMLElement | null = el;
      let detectedTextColor = '';
      while (colorEl && !colorEl.hasAttribute('contenteditable')) {
        if (colorEl.style.color) { detectedTextColor = colorEl.style.color; break; }
        if (colorEl.tagName === 'FONT' && colorEl.getAttribute('color')) {
          detectedTextColor = colorEl.getAttribute('color') || '';
          break;
        }
        colorEl = colorEl.parentElement;
      }
      setCurrentTextColor(detectedTextColor);

      let bgEl: HTMLElement | null = el;
      let detectedBgColor = '';
      while (bgEl && !bgEl.hasAttribute('contenteditable')) {
        const bg = bgEl.style.backgroundColor;
        if (bg && bg !== 'transparent') { detectedBgColor = bg; break; }
        bgEl = bgEl.parentElement;
      }
      setCurrentBgColor(detectedBgColor);
    }

    const blockId = getSelectedBlockId();
    if (blockId && blocksRef.current) {
      const block = blocksRef.current.find(b => b.id === blockId);
      setCurrentAlign(block?.align || 'left');
    }
  }, [getSelectedBlockId]);

  // -------------------------------------------------------------------------
  // Detection listeners — registered ONCE for the whole editor.
  //
  //   • `selectionchange` + `mouseup` + arrow/home/end `keyup` → refresh on
  //     every cursor move, even collapsed.
  //   • `blocks` dependency → re-run after undo/redo and remote edits so the
  //     displayed font/size/etc. reflect the new block state.
  // -------------------------------------------------------------------------

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;

    const refresh = () => {
      if (!cursorInEditable()) return;
      detectFormats();
      saveSelection();
    };

    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, 50);
    };
    const onMouseUp = () => setTimeout(refresh, 10);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'Home' || e.key === 'End' ||
          e.key === 'PageUp' || e.key === 'PageDown') {
        refresh();
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [cursorInEditable, detectFormats, saveSelection]);

  // Re-detect after block state changes (undo/redo, remote edits, doc-wide
  // batches). Without this, the top toolbar keeps showing stale values.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (cursorInEditable()) detectFormats();
    });
    return () => cancelAnimationFrame(id);
  }, [blocks, cursorInEditable, detectFormats]);

  // -------------------------------------------------------------------------
  // Block-level apply primitive
  //
  // `mapTargetBlocks(transform)` is the workhorse for every code path that
  // mutates block content without a live text selection. It iterates the
  // target blocks (block-selection if present, else all blocks), applies
  // `transform(html)` to each text-bearing region, and returns a new blocks
  // array ready for `setBlocks`.
  //
  // Both the execCommand staging path (`commitDocWideExec`) and the HTML
  // wrapping path (`commitBlockSelectionWrap`) reuse it — the only difference
  // between them is which `transform` they hand over.
  // -------------------------------------------------------------------------

  const mapTargetBlocks = useCallback((
    transform: (html: string) => string,
    scope: 'block-selection' | 'doc-wide',
  ): BlockData[] | null => {
    const current = blocksRef.current;
    if (!current || current.length === 0) return null;

    const selected = selectedBlockIdsRef.current;
    const targetIds = scope === 'block-selection'
      ? selected  // must be non-empty — caller guards
      : (selected && selected.size > 0 ? selected : null); // null = all blocks

    if (scope === 'block-selection' && (!targetIds || targetIds.size === 0)) return null;

    let touched = false;
    const newBlocks = current.map(block => {
      if (targetIds && !targetIds.has(block.id)) return block;

      // Design blocks: iterate every editable zone stored in designBlockData.values
      if (block.type === 'design_block' && block.designBlockData) {
        const currentValues = block.designBlockData.values || {};
        let zoneChanged = false;
        const newValues: Record<string, string> = { ...currentValues };
        for (const [key, html] of Object.entries(currentValues)) {
          if (typeof html !== 'string') continue;
          const out = transform(html);
          if (out !== html) { newValues[key] = out; zoneChanged = true; }
        }
        if (!zoneChanged) return block;
        touched = true;
        return {
          ...block,
          designBlockData: { ...block.designBlockData, values: newValues },
        };
      }

      // Text-bearing blocks — everything else (divider, table, image) is skipped.
      if (TEXT_BLOCK_TYPES.has(block.type)) {
        const out = transform(block.content || '');
        if (out === block.content) return block;
        touched = true;
        return { ...block, content: out };
      }

      return block;
    });

    return touched ? newBlocks : null;
  }, []);

  /** Commit a `newBlocks` array via the best available atomic path. */
  const commit = useCallback((newBlocks: BlockData[]) => {
    const original = blocksRef.current;
    if (!original) return;
    if (setBlocks) {
      setBlocks(newBlocks);
    } else if (updateBlock) {
      newBlocks.forEach((b, i) => { if (b !== original[i]) updateBlock(b.id, b); });
    }
  }, [setBlocks, updateBlock]);

  // -------------------------------------------------------------------------
  // Doc-wide execCommand via staging
  //
  // Builds an offscreen contenteditable, loads each target block's HTML into
  // it, runs the browser's execCommand against a range covering that HTML,
  // reads the result back, and hands it to `mapTargetBlocks`. This isolates
  // the command from the live DOM so design-block input listeners don't fire
  // and history stays clean.
  // -------------------------------------------------------------------------

  const commitDocWideExec = useCallback((command: string, value?: string) => {
    const stage = document.createElement('div');
    stage.contentEditable = 'true';
    stage.style.cssText =
      'position:fixed;left:-99999px;top:0;width:600px;white-space:pre-wrap;outline:none;';
    document.body.appendChild(stage);

    const sel = window.getSelection();
    if (!sel) { document.body.removeChild(stage); return; }
    const liveBefore = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

    const transform = (html: string): string => {
      stage.innerHTML = html || '';
      const range = document.createRange();
      range.selectNodeContents(stage);
      sel.removeAllRanges();
      sel.addRange(range);
      stage.focus();
      try { document.execCommand(command, false, value); } catch { /* ignore */ }
      return stage.innerHTML;
    };

    const newBlocks = mapTargetBlocks(transform, 'doc-wide');
    document.body.removeChild(stage);

    // Restore whichever range was active before we hijacked it.
    sel.removeAllRanges();
    if (liveBefore) { try { sel.addRange(liveBefore); } catch { /* ignore */ } }
    else if (savedRange.current) { try { sel.addRange(savedRange.current); } catch { /* ignore */ } }

    if (newBlocks) commit(newBlocks);
  }, [mapTargetBlocks, commit]);

  // -------------------------------------------------------------------------
  // Block-selection wrap for font-family / font-size
  //
  // When a user has selected blocks but NOT selected text, wrap each block's
  // content in a top-level `<span style>` carrying the font override. Goes
  // through block state so design blocks work and history is atomic.
  // -------------------------------------------------------------------------

  const commitBlockSelectionWrap = useCallback((
    styles: { fontFamily?: string; fontSize?: string },
    isDefault = false,
  ): boolean => {
    const selected = selectedBlockIdsRef.current;
    if (!selected || selected.size === 0) return false;

    const transform = (html: string): string => {
      const div = document.createElement('div');
      div.innerHTML = html || '';

      if (isDefault) {
        // Revert to the document default by stripping the property from every
        // descendant span, then unwrapping spans that end up empty.
        const prop: 'fontFamily' | 'fontSize' = styles.fontFamily !== undefined
          ? 'fontFamily'
          : 'fontSize';
        div.querySelectorAll<HTMLElement>('span').forEach(s => {
          if (s.style[prop]) {
            s.style[prop] = '';
            if (!s.getAttribute('style')?.trim()) s.removeAttribute('style');
          }
        });
        div.querySelectorAll<HTMLElement>('span').forEach(s => {
          if (!s.getAttributeNames().length) {
            while (s.firstChild) s.parentNode?.insertBefore(s.firstChild, s);
            s.remove();
          }
        });
        return div.innerHTML;
      }

      const span = document.createElement('span');
      if (styles.fontFamily) span.style.fontFamily = styles.fontFamily;
      if (styles.fontSize) span.style.fontSize = styles.fontSize;
      while (div.firstChild) span.appendChild(div.firstChild);
      div.appendChild(span);
      return div.innerHTML;
    };

    const newBlocks = mapTargetBlocks(transform, 'block-selection');
    if (!newBlocks) return false;
    commit(newBlocks);
    return true;
  }, [mapTargetBlocks, commit]);

  // -------------------------------------------------------------------------
  // Selection-range wrap (used by the live-text-selection apply path)
  // -------------------------------------------------------------------------

  const selectionCoversSpan = useCallback((range: Range, span: HTMLElement): boolean => {
    const spanRange = document.createRange();
    spanRange.selectNodeContents(span);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0
    );
  }, []);

  const wrapRangeInSpan = useCallback((
    range: Range, sel: Selection,
    styles: Partial<CSSStyleDeclaration>,
    parentSpan?: HTMLElement | null,
  ) => {
    const span = document.createElement('span');
    if (parentSpan) {
      if (parentSpan.style.fontFamily) span.style.fontFamily = parentSpan.style.fontFamily;
      if (parentSpan.style.fontWeight) span.style.fontWeight = parentSpan.style.fontWeight;
      if (parentSpan.style.fontSize) span.style.fontSize = parentSpan.style.fontSize;
    }
    if (styles.fontFamily !== undefined) span.style.fontFamily = styles.fontFamily;
    if (styles.fontWeight !== undefined) span.style.fontWeight = styles.fontWeight;
    if (styles.fontSize !== undefined) span.style.fontSize = styles.fontSize;
    try { range.surroundContents(span); } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
  }, []);

  // -------------------------------------------------------------------------
  // Apply commands — each one decides between 3 paths:
  //   1. Block-level selection (selectedBlockIds) → `commit*` batch via state
  //   2. Live text selection → execCommand / wrapRangeInSpan
  //   3. No selection at all → doc meta (for font/size) or doc-wide exec
  // -------------------------------------------------------------------------

  const applyFormat = useCallback((command: string) => {
    restoreSelection();

    const hasBlockSel = !!(selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
      // `code` only makes sense on a specific range — no doc-wide fallback.
      if (command === 'code') return;
      commitDocWideExec(command);
      detectFormats();
      return;
    }

    if (command === 'code') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const parent = sel.anchorNode?.parentElement;
      if (parent?.tagName === 'CODE') {
        const text = document.createTextNode(parent.textContent || '');
        parent.parentNode?.replaceChild(text, parent);
        const newRange = document.createRange();
        newRange.selectNodeContents(text);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        const code = document.createElement('code');
        code.className = 'bg-gray-100 text-red-500 px-1 py-0.5 rounded text-[0.9em] font-mono';
        try { range.surroundContents(code); } catch {
          const fragment = range.extractContents();
          code.appendChild(fragment);
          range.insertNode(code);
        }
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(code);
        sel.addRange(newRange);
      }
      const editable = sel.anchorNode?.parentElement?.closest('[contenteditable]');
      if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand(command, false);
    }
    saveSelection();
    detectFormats();
  }, [restoreSelection, saveSelection, detectFormats, hasTextSelection, commitDocWideExec]);

  const applyTextColor = useCallback((color: string) => {
    restoreSelection();
    const hasBlockSel = !!(selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
      commitDocWideExec(color ? 'foreColor' : 'removeFormat', color || undefined);
      setCurrentTextColor(color);
      return;
    }
    if (color) document.execCommand('foreColor', false, color);
    else document.execCommand('removeFormat', false);
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
  }, [restoreSelection, saveSelection, hasTextSelection, commitDocWideExec]);

  const applyBgColor = useCallback((color: string) => {
    restoreSelection();
    const hasBlockSel = !!(selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
      commitDocWideExec('hiliteColor', color || 'transparent');
      setCurrentBgColor(color);
      return;
    }
    document.execCommand('hiliteColor', false, color || 'transparent');
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
  }, [restoreSelection, saveSelection, hasTextSelection, commitDocWideExec]);

  const applyLink = useCallback((url: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const anchor = document.createElement('a');
    anchor.href = url.startsWith('http') ? url : `https://${url}`;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.color = '#0B6E99';
    anchor.style.textDecoration = 'underline';
    try { range.surroundContents(anchor); } catch {
      const fragment = range.extractContents();
      anchor.appendChild(fragment);
      range.insertNode(anchor);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(anchor);
    sel.addRange(newRange);
    const editable = anchor.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
  }, [restoreSelection, saveSelection]);

  const removeLink = useCallback(() => {
    restoreSelection();
    if (!currentLink) return;
    const text = document.createTextNode(currentLink.textContent || '');
    currentLink.parentNode?.replaceChild(text, currentLink);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(text);
      sel.addRange(newRange);
    }
    const editable = text.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    setCurrentLink(null);
    saveSelection();
  }, [restoreSelection, saveSelection, currentLink]);

  const applyRef = useCallback((targetBlockId: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const anchor = document.createElement('a');
    anchor.setAttribute('data-block-ref', targetBlockId);
    anchor.href = '#';
    anchor.style.color = '#6940A5';
    anchor.style.textDecoration = 'underline';
    anchor.style.textDecorationStyle = 'dotted';
    try { range.surroundContents(anchor); } catch {
      const fragment = range.extractContents();
      anchor.appendChild(fragment);
      range.insertNode(anchor);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(anchor);
    sel.addRange(newRange);
    const editable = anchor.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
  }, [restoreSelection, saveSelection]);

  const applyFont = useCallback((font: FontEntry) => {
    const isDefault = !font.isCustom && font.family === allFontsRef.current[0]?.family;

    // Block-level selection takes priority — must run *before* restoreSelection
    // so that focus-induced onClearSelection calls don't wipe the set.
    if (selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0) {
      if (commitBlockSelectionWrap({ fontFamily: font.family }, isDefault)) {
        setCurrentFont(font.family);
        return;
      }
    }

    restoreSelection();

    if (!hasTextSelection()) {
      setDocumentFont?.(font.family);
      setCurrentFont(font.family);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const coversAll = styledSpan && styledSpan.contains(sel.focusNode) && selectionCoversSpan(range, styledSpan);

    if (coversAll && styledSpan) {
      if (isDefault) {
        const text = document.createTextNode(styledSpan.textContent || '');
        styledSpan.parentNode?.replaceChild(text, styledSpan);
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(text);
        sel.addRange(newRange);
      } else {
        styledSpan.style.fontFamily = font.family;
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(styledSpan);
        sel.addRange(newRange);
      }
    } else {
      if (isDefault) return;
      wrapRangeInSpan(range, sel, { fontFamily: font.family }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentFont(font.family);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan, hasTextSelection, setDocumentFont, commitBlockSelectionWrap]);

  const applyWeight = useCallback((weight: number) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const coversAll = styledSpan && styledSpan.contains(sel.focusNode) && selectionCoversSpan(range, styledSpan);
    const weightVal = weight === 400 ? '' : String(weight);

    if (coversAll && styledSpan) {
      styledSpan.style.fontWeight = weightVal;
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(styledSpan);
      sel.addRange(newRange);
    } else {
      if (weight === 400) return;
      wrapRangeInSpan(range, sel, { fontWeight: String(weight) }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentWeight(weight);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan]);

  const applyFontSize = useCallback((size: number) => {
    // Block-selection path MUST run before focus/restore: focusing an editable
    // fires `handleFocus` which calls `onClearSelection`, wiping
    // `selectedBlockIds` — so any block-selection check after that would be
    // too late (this is why only 1 block got resized before the fix).
    if (selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0) {
      if (commitBlockSelectionWrap({ fontSize: `${size}pt` })) {
        setCurrentFontSize(size);
        return;
      }
    }

    // Custom size input path: the `<input>` steals focus from the editable,
    // so we re-focus it before running execCommand.
    if (savedRange.current) {
      const node = savedRange.current.startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node as Node).parentElement;
      const editable = el?.closest('[contenteditable]') as HTMLElement | null;
      if (editable) editable.focus();
    }

    restoreSelection();

    if (!hasTextSelection()) {
      setDocumentFontSize?.(size);
      setCurrentFontSize(size);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const coversAll = styledSpan && styledSpan.contains(sel.focusNode) && selectionCoversSpan(range, styledSpan);
    const sizeVal = `${size}pt`;

    if (coversAll && styledSpan) {
      styledSpan.style.fontSize = sizeVal;
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(styledSpan);
      sel.addRange(newRange);
    } else {
      wrapRangeInSpan(range, sel, { fontSize: sizeVal }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentFontSize(size);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan, hasTextSelection, setDocumentFontSize, commitBlockSelectionWrap]);

  const applyAlignment = useCallback((align: TextAlign) => {
    const current = blocksRef.current;
    if (!current) return;
    const alignValue = align === 'left' ? undefined : align;

    // Block-selection path first — takes precedence over cursor location.
    const selected = selectedBlockIdsRef.current;
    if (selected && selected.size > 0) {
      if (setBlocks) {
        setBlocks(current.map(b => selected.has(b.id) ? { ...b, align: alignValue } : b));
      } else if (updateBlock) {
        selected.forEach(id => updateBlock(id, { align: alignValue }));
      }
      setCurrentAlign(align);
      return;
    }

    restoreSelection();

    // Caret in a block → align that block only.
    if (hasTextSelection()) {
      const blockId = getSelectedBlockId();
      if (blockId && updateBlock) {
        updateBlock(blockId, { align: alignValue });
        setCurrentAlign(align);
        return;
      }
    }

    // Doc-wide fallback — align every block, atomic commit.
    if (setBlocks) {
      setBlocks(current.map(b => ({ ...b, align: alignValue })));
    } else if (updateBlock) {
      current.forEach(b => updateBlock(b.id, { align: alignValue }));
    }
    setCurrentAlign(align);
  }, [restoreSelection, getSelectedBlockId, updateBlock, setBlocks, hasTextSelection]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts — registered ONCE for the whole editor.
  // ⌘K dispatches a `toolbar:toggle-link` event that the floating toolbar
  // listens to and opens its own link submenu in response.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const active = document.activeElement;
      if (!active || !(active as HTMLElement).isContentEditable) return;
      const editable = active.closest('[contenteditable]') as HTMLElement;
      if (!editable) return;
      if (!editable.id?.startsWith('editable-') &&
          !editable.hasAttribute('data-table-cell') &&
          !editable.hasAttribute('data-editable')) return;

      let handled = false;
      if (e.key === 'b' && !e.shiftKey) {
        e.preventDefault(); document.execCommand('bold', false); handled = true;
      } else if (e.key === 'i' && !e.shiftKey) {
        e.preventDefault(); document.execCommand('italic', false); handled = true;
      } else if (e.key === 'u' && !e.shiftKey) {
        e.preventDefault(); document.execCommand('underline', false); handled = true;
      } else if (e.key === 'x' && e.shiftKey) {
        e.preventDefault(); document.execCommand('strikeThrough', false); handled = true;
      } else if (e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const anchor = sel.anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null;
          document.dispatchEvent(new CustomEvent('toolbar:toggle-link', { detail: { href: anchor?.href || '' } }));
        }
        handled = true;
      } else if (e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        applyFormat('code');
        handled = true;
      }

      if (handled) {
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        detectFormats();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detectFormats, applyFormat]);

  // -------------------------------------------------------------------------
  // Link / internal-reference click navigation
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const editable = anchor.closest('[id^="editable-"], [data-table-cell], [data-editable]');
      if (!editable) return;

      const refId = anchor.getAttribute('data-block-ref');
      if (refId) {
        e.preventDefault();
        e.stopPropagation();
        const blockEl = document.querySelector(`[data-block-id="${refId}"]`);
        if (blockEl) {
          blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          blockEl.classList.add('bg-purple-50');
          setTimeout(() => blockEl.classList.remove('bg-purple-50'), 1500);
        }
        return;
      }

      if (anchor.href && anchor.href !== '#') {
        e.preventDefault();
        e.stopPropagation();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    activeFormats, currentTextColor, currentBgColor,
    currentFont, currentWeight, currentFontSize, currentAlign, currentLink,
    hasTextSelection, cursorInEditable,
    saveSelection, restoreSelection, getSelectedBlockId, detectFormats,
    applyFormat, applyTextColor, applyBgColor,
    applyFont, applyWeight, applyFontSize, applyAlignment,
    applyLink, removeLink, applyRef,
  };
};

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------
//
// `FormatCommandsProvider` isolates format-state re-renders from the parent
// component tree. Here's the key invariant:
//
//   • `useFormatCommands` is called inside the provider, NOT inside
//     `NotionEditor`. When the hook's internal state changes (e.g. cursor
//     moves and `setActiveFormats` fires), the provider re-renders and its
//     context consumers (Toolbar + FloatingToolbar) re-render — but
//     `NotionEditor` does not, because React's "element identity bailout"
//     skips re-rendering the provider's `children` prop when it's the same
//     element reference as the previous render.
//
//   • `NotionEditor` passes `children` as a JSX subtree to the provider.
//     When the provider re-renders due to its own state change,
//     `NotionEditor`'s function body does NOT re-run, so the `children` prop
//     reference stays the same, and React skips reconciling the entire
//     blocks subtree.
//
// The net effect: cursor movement re-renders ~2 components (Toolbar +
// FloatingToolbar) instead of the whole editor, even on documents with
// hundreds of blocks.
// ---------------------------------------------------------------------------

const FormatCommandsContext = createContext<FormatCommands | null>(null);

interface FormatCommandsProviderProps extends UseFormatCommandsProps {
  children: React.ReactNode;
}

export const FormatCommandsProvider: React.FC<FormatCommandsProviderProps> = ({
  children,
  ...props
}) => {
  const commands = useFormatCommands(props);
  return (
    <FormatCommandsContext.Provider value={commands}>
      {children}
    </FormatCommandsContext.Provider>
  );
};

/** Read the format commands from the nearest provider. Throws if mounted
 *  outside a `FormatCommandsProvider` — a clear error beats silent bugs. */
export const useFormatCommandsContext = (): FormatCommands => {
  const ctx = useContext(FormatCommandsContext);
  if (!ctx) {
    throw new Error('useFormatCommandsContext must be used inside <FormatCommandsProvider>');
  }
  return ctx;
};
