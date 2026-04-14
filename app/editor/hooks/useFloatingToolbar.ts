'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { FontEntry, DEFAULT_FONT_SIZE } from '../fonts';
import { BlockData, TextAlign } from '../types';
import { isMac } from '../constants';

interface UseFloatingToolbarProps {
  /** Reserved for future use (display purposes); not consumed internally. */
  documentFont?: string;
  blocks?: BlockData[];
  updateBlock?: (id: string, updates: Partial<BlockData>) => void;
  /**
   * Batch-update primitive used by the doc-wide apply path. Commits every
   * affected block in a single history entry so undo/redo reverts the whole
   * doc-wide op at once (fixes the "some revert, some don't" bug).
   */
  setBlocks?: (blocks: BlockData[]) => void;
  allFonts: FontEntry[];
  /** Scroll container ref — when provided, positions are absolute within it (no scroll recalc) */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * 'floating' (default) = full behavior including selection-driven visibility,
   *                        keyboard shortcuts, link click navigation.
   * 'top' = persistent toolbar; `visible` stays false (the caller ignores it),
   *         click-outside & global listeners that belong to the floating bar
   *         are suppressed, commands fall back to document-wide operations
   *         when no text selection exists.
   */
  role?: 'floating' | 'top';
  /** Doc-wide fallback: update document-level font when no selection */
  setDocumentFont?: (family: string) => void;
  /** Doc-wide fallback: update document-level font size when no selection */
  setDocumentFontSize?: (size: number) => void;
  /** Block-level selection (shift-clicked blocks). Used to scope doc-wide ops. */
  selectedBlockIds?: Set<string>;
}

export const useFloatingToolbar = ({
  documentFont,
  blocks,
  updateBlock,
  setBlocks,
  allFonts,
  scrollRef,
  role = 'floating',
  setDocumentFont,
  setDocumentFontSize,
  selectedBlockIds,
}: UseFloatingToolbarProps) => {
  const isTop = role === 'top';
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [currentTextColor, setCurrentTextColor] = useState<string>('');
  const [currentBgColor, setCurrentBgColor] = useState<string>('');
  const [currentFont, setCurrentFont] = useState<string>('');
  const [currentWeight, setCurrentWeight] = useState<number>(400);
  const [currentFontSize, setCurrentFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('left');
  const [currentLink, setCurrentLink] = useState<HTMLAnchorElement | null>(null);

  // Submenu open states
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [refSearch, setRefSearch] = useState('');

  // Submenu position states
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const weightMenuRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);
  const refMenuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [fontMenuPos, setFontMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [weightMenuPos, setWeightMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [sizeMenuPos, setSizeMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [alignMenuPos, setAlignMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [linkMenuPos, setLinkMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [refMenuPos, setRefMenuPos] = useState<{ left: number; top: number } | null>(null);

  const savedRange = useRef<Range | null>(null);
  const inputSubmenuOpenRef = useRef(false);
  inputSubmenuOpenRef.current = linkOpen || refOpen || sizeOpen;

  // --- Viewport ↔ Absolute conversion ---

  /** Convert viewport-relative position to scroll-container-absolute position */
  const toAbsolute = useCallback((left: number, top: number): { left: number; top: number } => {
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return { left, top }; // fallback to fixed-like
    const sr = scrollEl.getBoundingClientRect();
    return { left: left - sr.left + scrollEl.scrollLeft, top: top - sr.top + scrollEl.scrollTop };
  }, [scrollRef]);

  // --- Helpers ---

  const getSelectedBlockId = useCallback((): string | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const el = sel.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? sel.anchorNode as HTMLElement
      : sel.anchorNode?.parentElement;
    const editable = el?.closest('[id^="editable-"]') || el?.closest('[data-editable]');
    if (!editable) return null;
    if (editable.id?.startsWith('editable-')) return editable.id.replace('editable-', '');
    // Design block: find parent block wrapper
    const wrapper = editable.closest('[data-block-id]');
    return wrapper?.getAttribute('data-block-id') || null;
  }, []);

  const findStyledSpan = useCallback((node: Node | null): HTMLSpanElement | null => {
    if (!node) return null;
    let el: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE
      ? node as HTMLElement
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

  const isInEditable = useCallback((): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const anchor = sel.anchorNode;
    if (!anchor) return false;
    const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
    if (!el) return false;
    const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
    if (!editable) return false;
    return !!(editable.id?.startsWith('editable-') || editable.hasAttribute('data-table-cell') || editable.hasAttribute('data-editable'));
  }, []);

  // --- Format detection ---

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
    } catch { /* ignore */ }
    setActiveFormats(formats);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode;
      const el = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : (node as Node)?.parentElement;
      if (el) {
        const computed = window.getComputedStyle(el);
        const family = computed.fontFamily;
        const weight = parseInt(computed.fontWeight, 10) || 400;
        const fontSize = Math.round(parseFloat(computed.fontSize) * 0.75) || DEFAULT_FONT_SIZE;
        setCurrentFontSize(fontSize);
        const sortedFonts = [...allFonts].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
        const matched = sortedFonts.find(f =>
          family.toLowerCase().includes(f.family.split(',')[0].trim().replace(/['"]/g, '').toLowerCase())
        );
        setCurrentFont(matched?.family || '');
        setCurrentWeight(weight);

        let colorEl: HTMLElement | null = el;
        let detectedTextColor = '';
        while (colorEl && !colorEl.hasAttribute('contenteditable')) {
          if (colorEl.style.color) { detectedTextColor = colorEl.style.color; break; }
          if (colorEl.tagName === 'FONT' && colorEl.getAttribute('color')) {
            detectedTextColor = colorEl.getAttribute('color') || ''; break;
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
      if (blockId && blocks) {
        const block = blocks.find(b => b.id === blockId);
        setCurrentAlign(block?.align || 'left');
      }
    }
  }, [allFonts, blocks, getSelectedBlockId]);

  // --- Positioning ---

  const updatePosition = useCallback(() => {
    if (inputSubmenuOpenRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setVisible(false); return; }
    if (!isInEditable()) { setVisible(false); return; }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setVisible(false); return; }

    setVisible(true);
    detectFormats();
    saveSelection();
  }, [isInEditable, detectFormats, saveSelection]);

  const repositionFromSavedRange = useCallback(() => {
    if (!toolbarRef.current || !savedRange.current) return;
    const rect = savedRange.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
    let top = rect.top - toolbarRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    if (left < 4) left = 4;
    if (left + toolbarRect.width > vw - 4) left = vw - toolbarRect.width - 4;
    if (top + toolbarRect.height > vh - 4) top = vh - toolbarRect.height - 4;

    setPosition(toAbsolute(left, top));
  }, [toAbsolute]);

  // Position toolbar after visibility change
  useLayoutEffect(() => {
    if (!visible || !toolbarRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
    let top = rect.top - toolbarRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    if (left < 4) left = 4;
    if (left + toolbarRect.width > vw - 4) left = vw - toolbarRect.width - 4;
    if (top + toolbarRect.height > vh - 4) top = vh - toolbarRect.height - 4;

    setPosition(toAbsolute(left, top));
  }, [visible, activeFormats, toAbsolute]);

  /**
   * Returns true if the current selection's anchor is inside any editable
   * region, regardless of whether the selection is collapsed. The top toolbar
   * uses this so it can refresh its displayed state as the caret moves —
   * isInEditable() is stricter (requires a non-collapsed range) and is
   * reserved for the floating toolbar's visibility logic.
   */
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

  // Listen for selection changes.
  // - 'floating' instance: runs updatePosition which shows/hides the bar.
  // - 'top' instance: only needs format detection (the bar is always visible).
  //   It reacts to *any* cursor move — including simple clicks (collapsed) —
  //   so the displayed font/size/bold/etc. reflect wherever the caret is now.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;

    const refreshTop = () => {
      if (!cursorInEditable()) return;
      detectFormats();
      saveSelection();
    };

    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isTop) refreshTop();
        else updatePosition();
      }, 50);
    };

    const onMouseUp = () => setTimeout(() => {
      if (isTop) refreshTop();
      else updatePosition();
    }, 10);

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isTop) return;
      // Arrow keys / home / end move the caret without changing formatting,
      // but the caret may land on differently-formatted text.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'Home' || e.key === 'End' ||
          e.key === 'PageUp' || e.key === 'PageDown') {
        refreshTop();
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
  }, [updatePosition, isTop, detectFormats, saveSelection, cursorInEditable]);

  // Re-detect formats after block state changes (undo/redo, remote edits, or
  // doc-wide batches). Without this, the top toolbar keeps showing the stale
  // values from before the mutation.
  useEffect(() => {
    if (!isTop) return;
    const id = requestAnimationFrame(() => {
      if (cursorInEditable()) detectFormats();
    });
    return () => cancelAnimationFrame(id);
  }, [isTop, blocks, cursorInEditable, detectFormats]);

  // Close menus on click outside.
  // Skipped for 'top' role — the top toolbar manages its own submenu state.
  useEffect(() => {
    if (isTop) return;
    if (!visible) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolbarRef.current?.contains(target)) return;
      if (colorMenuRef.current?.contains(target)) return;
      if (fontMenuRef.current?.contains(target)) return;
      if (weightMenuRef.current?.contains(target)) return;
      if (sizeMenuRef.current?.contains(target)) return;
      if (alignMenuRef.current?.contains(target)) return;
      if (linkMenuRef.current?.contains(target)) return;
      if (refMenuRef.current?.contains(target)) return;
      setLinkOpen(false); setRefOpen(false); setColorOpen(false);
      setFontOpen(false); setWeightOpen(false); setSizeOpen(false); setAlignOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [visible, isTop]);

  // Close submenus when toolbar hides
  useEffect(() => {
    if (!visible) {
      setColorOpen(false); setFontOpen(false); setWeightOpen(false); setSizeOpen(false);
      setAlignOpen(false); setLinkOpen(false); setRefOpen(false);
    }
  }, [visible]);

  // --- Submenu positioning (single effect with dependency on which is open) ---

  const positionSubmenu = useCallback((
    menuRef: React.RefObject<HTMLDivElement | null>,
    setPos: (pos: { left: number; top: number } | null) => void,
    alignRight?: boolean
  ) => {
    if (!menuRef.current || !toolbarRef.current) { setPos(null); return; }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = alignRight ? toolbarRect.right - menuRect.width : toolbarRect.left;
    let top = toolbarRect.bottom + 4;
    if (top + menuRect.height > vh - 4) top = toolbarRect.top - menuRect.height - 4;
    if (left + menuRect.width > vw - 4) left = vw - menuRect.width - 4;
    if (left < 4) left = 4;
    setPos(toAbsolute(left, top));
  }, [toAbsolute]);

  // Single consolidated effect for all submenu positioning
  useLayoutEffect(() => {
    if (colorOpen) positionSubmenu(colorMenuRef, setColorMenuPos);
    else setColorMenuPos(null);

    if (fontOpen) positionSubmenu(fontMenuRef, setFontMenuPos);
    else setFontMenuPos(null);

    if (weightOpen) positionSubmenu(weightMenuRef, setWeightMenuPos);
    else setWeightMenuPos(null);

    if (sizeOpen) positionSubmenu(sizeMenuRef, setSizeMenuPos);
    else setSizeMenuPos(null);

    if (alignOpen) positionSubmenu(alignMenuRef, setAlignMenuPos, true);
    else setAlignMenuPos(null);

    if (linkOpen) {
      positionSubmenu(linkMenuRef, setLinkMenuPos);
      setTimeout(() => linkInputRef.current?.focus(), 0);
    } else setLinkMenuPos(null);

    if (refOpen) {
      positionSubmenu(refMenuRef, setRefMenuPos);
      setTimeout(() => refInputRef.current?.focus(), 0);
    } else setRefMenuPos(null);
  }, [colorOpen, fontOpen, weightOpen, sizeOpen, alignOpen, linkOpen, refOpen, position, positionSubmenu]);

  // --- Doc-wide fallback helpers ---

  /**
   * Returns true when the current (or saved) selection is a non-collapsed range
   * inside an editable element. Doc-wide fallbacks kick in only when this is false.
   */
  const hasTextSelection = useCallback((): boolean => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && isInEditable()) return true;
    const saved = savedRange.current;
    if (!saved || saved.collapsed) return false;
    const node = saved.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!el?.closest('[contenteditable="true"], [contenteditable=""]');
  }, [isInEditable]);

  /**
   * Returns block IDs that doc-wide ops should target: block-selection when present,
   * otherwise all blocks.
   */
  const targetBlocksForDocOp = useCallback((): string[] => {
    if (!blocks) return [];
    if (selectedBlockIds && selectedBlockIds.size > 0) {
      return blocks.filter(b => selectedBlockIds.has(b.id)).map(b => b.id);
    }
    return blocks.map(b => b.id);
  }, [blocks, selectedBlockIds]);

  /**
   * Apply an execCommand-based format (bold, italic, foreColor, hiliteColor, …)
   * across every target block atomically.
   *
   * Instead of mutating live DOM (which bypasses the history system and leaves
   * partial state when undoing) we:
   *
   *   1. Build an offscreen staging contenteditable element.
   *   2. For each target block, load its stored HTML into the staging element,
   *      select-all and run `execCommand(command, false, value)`.
   *   3. Read the transformed innerHTML back.
   *   4. Collect every patch and commit the whole batch through `setBlocks` in
   *      a single call so undo/redo reverts the entire doc-wide op at once.
   *
   * Design blocks store their text in `block.designBlockData.values[key]` — we
   * transform each zone and rebuild the values object.
   */
  const commitDocWideExec = useCallback((command: string, value?: string) => {
    if (!blocks || blocks.length === 0) return;
    if (!setBlocks && !updateBlock) return;

    const targetIds = selectedBlockIds && selectedBlockIds.size > 0
      ? new Set(selectedBlockIds)
      : null;

    const stage = document.createElement('div');
    stage.contentEditable = 'true';
    stage.style.cssText =
      'position:fixed;left:-99999px;top:0;width:600px;white-space:pre-wrap;outline:none;';
    document.body.appendChild(stage);

    const sel = window.getSelection();
    if (!sel) { document.body.removeChild(stage); return; }
    const savedBefore = savedRange.current ? savedRange.current.cloneRange() : null;
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

    const newBlocks = blocks.map(block => {
      if (targetIds && !targetIds.has(block.id)) return block;

      // Design blocks: iterate every editable zone stored in designBlockData.values
      if (block.type === 'design_block' && block.designBlockData) {
        const currentValues = block.designBlockData.values || {};
        let changed = false;
        const newValues: Record<string, string> = { ...currentValues };
        for (const [key, html] of Object.entries(currentValues)) {
          if (typeof html !== 'string') continue;
          const transformed = transform(html);
          if (transformed !== html) { newValues[key] = transformed; changed = true; }
        }
        if (!changed) return block;
        return {
          ...block,
          designBlockData: { ...block.designBlockData, values: newValues },
        };
      }

      // Text-bearing blocks: transform .content directly. Skip non-text block
      // types (divider, table, image) where execCommand doesn't apply.
      if (
        block.type === 'text' || block.type === 'h1' || block.type === 'h2' ||
        block.type === 'h3' || block.type === 'bullet_list' || block.type === 'numbered_list'
      ) {
        const content = block.content || '';
        const transformed = transform(content);
        if (transformed === content) return block;
        return { ...block, content: transformed };
      }

      return block;
    });

    document.body.removeChild(stage);

    // Restore whatever selection was live before we hijacked it for staging.
    sel.removeAllRanges();
    if (liveBefore) { try { sel.addRange(liveBefore); } catch { /* ignore */ } }
    else if (savedBefore) { try { sel.addRange(savedBefore); } catch { /* ignore */ } }

    // Commit atomically. Prefer `setBlocks` (one history entry) over looping
    // `updateBlock` (N history entries — causes the "partial undo" bug).
    if (setBlocks) {
      setBlocks(newBlocks);
    } else if (updateBlock) {
      newBlocks.forEach((b, i) => {
        if (b !== blocks[i]) updateBlock(b.id, b);
      });
    }
  }, [blocks, selectedBlockIds, setBlocks, updateBlock]);

  /**
   * Wrap every selected block's content in a `<span>` carrying the given
   * inline style. Used for font-family and font-size when the user has a
   * block-level selection but no text selection — the wrap is applied through
   * the block state system (no execCommand) so history works cleanly.
   *
   * - `isDefault` strips existing font-family/font-size instead of wrapping,
   *   which lets the block inherit the document default again.
   * - Returns true if it handled the op (i.e. there were selected blocks),
   *   false if the caller should fall through to a different code path.
   */
  const commitBlockSelectionWrap = useCallback((
    styles: { fontFamily?: string; fontSize?: string },
    isDefault = false,
  ): boolean => {
    if (!selectedBlockIds || selectedBlockIds.size === 0) return false;
    if (!blocks) return false;
    if (!setBlocks && !updateBlock) return false;

    const transform = (html: string): string => {
      const div = document.createElement('div');
      div.innerHTML = html || '';

      if (isDefault) {
        // Strip the property so it falls back to the document default. We
        // clear it on every descendant span too — otherwise nested overrides
        // would still win.
        const prop = styles.fontFamily !== undefined ? 'fontFamily' : 'fontSize';
        div.querySelectorAll<HTMLElement>('span').forEach(s => {
          if (s.style[prop as 'fontFamily' | 'fontSize']) {
            s.style[prop as 'fontFamily' | 'fontSize'] = '';
            if (!s.getAttribute('style')?.trim()) s.removeAttribute('style');
          }
        });
        // Unwrap now-empty spans (no style, no class) to keep the DOM clean.
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

    const newBlocks = blocks.map(block => {
      if (!selectedBlockIds.has(block.id)) return block;

      if (block.type === 'design_block' && block.designBlockData) {
        const currentValues = block.designBlockData.values || {};
        let changed = false;
        const newValues: Record<string, string> = { ...currentValues };
        for (const [key, html] of Object.entries(currentValues)) {
          if (typeof html !== 'string') continue;
          const out = transform(html);
          if (out !== html) { newValues[key] = out; changed = true; }
        }
        if (!changed) return block;
        return { ...block, designBlockData: { ...block.designBlockData, values: newValues } };
      }

      if (
        block.type === 'text' || block.type === 'h1' || block.type === 'h2' ||
        block.type === 'h3' || block.type === 'bullet_list' || block.type === 'numbered_list'
      ) {
        const out = transform(block.content || '');
        if (out === block.content) return block;
        return { ...block, content: out };
      }

      return block;
    });

    if (setBlocks) {
      setBlocks(newBlocks);
    } else if (updateBlock) {
      newBlocks.forEach((b, i) => { if (b !== blocks[i]) updateBlock(b.id, b); });
    }
    return true;
  }, [blocks, selectedBlockIds, setBlocks, updateBlock]);

  // --- Format actions ---

  const selectionCoversSpan = useCallback((range: Range, span: HTMLElement): boolean => {
    const spanRange = document.createRange();
    spanRange.selectNodeContents(span);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0
    );
  }, []);

  const wrapRangeInSpan = useCallback((range: Range, sel: Selection, styles: Partial<CSSStyleDeclaration>, parentSpan?: HTMLElement | null) => {
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

  const applyFormat = useCallback((command: string) => {
    restoreSelection();

    // Block-level selection OR no text selection → doc-wide (batched).
    // Skip `code` — it only makes sense on a specific range of characters.
    const hasBlockSel = !!(selectedBlockIds && selectedBlockIds.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
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
  }, [restoreSelection, saveSelection, detectFormats, hasTextSelection, commitDocWideExec, selectedBlockIds]);

  const applyTextColor = useCallback((color: string) => {
    restoreSelection();
    const hasBlockSel = !!(selectedBlockIds && selectedBlockIds.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
      commitDocWideExec(color ? 'foreColor' : 'removeFormat', color || undefined);
      setCurrentTextColor(color);
      setColorOpen(false);
      return;
    }
    if (color) { document.execCommand('foreColor', false, color); }
    else { document.execCommand('removeFormat', false); }
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection, hasTextSelection, commitDocWideExec, selectedBlockIds]);

  const applyBgColor = useCallback((color: string) => {
    restoreSelection();
    const hasBlockSel = !!(selectedBlockIds && selectedBlockIds.size > 0);
    if (hasBlockSel || !hasTextSelection()) {
      commitDocWideExec('hiliteColor', color || 'transparent');
      setCurrentBgColor(color);
      setColorOpen(false);
      return;
    }
    document.execCommand('hiliteColor', false, color || 'transparent');
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection, hasTextSelection, commitDocWideExec, selectedBlockIds]);

  const applyLink = useCallback((url: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setLinkOpen(false); return; }
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
    setLinkOpen(false);
    setLinkUrl('');
  }, [restoreSelection, saveSelection]);

  const removeLink = useCallback(() => {
    restoreSelection();
    if (currentLink) {
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
    }
    setLinkOpen(false);
  }, [restoreSelection, saveSelection, currentLink]);

  const applyRef = useCallback((targetBlockId: string) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setRefOpen(false); return; }
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
    setRefOpen(false);
    setRefSearch('');
  }, [restoreSelection, saveSelection]);

  const applyFont = useCallback((font: FontEntry) => {
    restoreSelection();
    const isDefault = !font.isCustom && font.family === allFonts[0]?.family;

    // Block-level selection: wrap only those blocks (no doc-meta change).
    if (selectedBlockIds && selectedBlockIds.size > 0) {
      if (commitBlockSelectionWrap({ fontFamily: font.family }, isDefault)) {
        setCurrentFont(font.family);
        setFontOpen(false);
        return;
      }
    }

    if (!hasTextSelection()) {
      // Truly no selection → update the document-level meta default so the
      // whole doc cascades through CSS on the editor root.
      setDocumentFont?.(font.family);
      setCurrentFont(font.family);
      setFontOpen(false);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setFontOpen(false); return; }

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
      if (isDefault) { setFontOpen(false); return; }
      wrapRangeInSpan(range, sel, { fontFamily: font.family }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentFont(font.family);
    setFontOpen(false);
  }, [restoreSelection, saveSelection, allFonts, findStyledSpan, selectionCoversSpan, wrapRangeInSpan, hasTextSelection, setDocumentFont, selectedBlockIds, commitBlockSelectionWrap]);

  const applyWeight = useCallback((weight: number) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setWeightOpen(false); return; }

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
      if (weight === 400) { setWeightOpen(false); return; }
      wrapRangeInSpan(range, sel, { fontWeight: String(weight) }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentWeight(weight);
    setWeightOpen(false);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan]);

  const applyFontSize = useCallback((size: number) => {
    // Block-level selection MUST be checked *before* we focus/restore the
    // editable. Focusing an editable fires its `handleFocus` which calls
    // `onClearSelection`, wiping `selectedBlockIds` — so any block-selection
    // check after that would see an empty set and fall through to the
    // single-cursor path (which is why only 1 block was getting resized).
    if (selectedBlockIds && selectedBlockIds.size > 0) {
      if (commitBlockSelectionWrap({ fontSize: `${size}pt` })) {
        setCurrentFontSize(size);
        setSizeOpen(false);
        return;
      }
    }

    // From here on we need a live editable: focus it so that the custom
    // size input can hand focus back before we call execCommand.
    if (savedRange.current) {
      const node = savedRange.current.startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : (node as Node).parentElement;
      const editable = el?.closest('[contenteditable]') as HTMLElement | null;
      if (editable) editable.focus();
    }

    restoreSelection();

    if (!hasTextSelection()) {
      setDocumentFontSize?.(size);
      setCurrentFontSize(size);
      setSizeOpen(false);
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setSizeOpen(false); return; }

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
    setSizeOpen(false);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan, hasTextSelection, setDocumentFontSize, selectedBlockIds, commitBlockSelectionWrap]);

  const applyAlignment = useCallback((align: TextAlign) => {
    restoreSelection();
    if (!blocks) { setAlignOpen(false); return; }

    const alignValue = align === 'left' ? undefined : align;

    // Block-level selection (shift-click / drag-select) takes precedence over
    // whatever block the caret happens to be in.
    if (selectedBlockIds && selectedBlockIds.size > 0) {
      if (setBlocks) {
        setBlocks(blocks.map(b => selectedBlockIds.has(b.id) ? { ...b, align: alignValue } : b));
      } else if (updateBlock) {
        selectedBlockIds.forEach(id => updateBlock(id, { align: alignValue }));
      }
      setCurrentAlign(align);
      setAlignOpen(false);
      return;
    }

    // Caret-in-editable: align the single block that contains the caret.
    if (hasTextSelection()) {
      const blockId = getSelectedBlockId();
      if (blockId && updateBlock) {
        updateBlock(blockId, { align: alignValue });
        setCurrentAlign(align);
        setAlignOpen(false);
        return;
      }
    }

    // Doc-wide fallback: align every block, committed atomically.
    const ids = targetBlocksForDocOp();
    if (ids.length === 0) { setAlignOpen(false); return; }
    if (setBlocks) {
      const idSet = new Set(ids);
      setBlocks(blocks.map(b => idSet.has(b.id) ? { ...b, align: alignValue } : b));
    } else if (updateBlock) {
      ids.forEach(id => updateBlock(id, { align: alignValue }));
    }
    setCurrentAlign(align);
    setAlignOpen(false);
  }, [restoreSelection, getSelectedBlockId, updateBlock, setBlocks, blocks, selectedBlockIds, targetBlocksForDocOp, hasTextSelection]);

  // Close all submenus except one
  const closeSubmenusExcept = useCallback((keep?: string) => {
    if (keep !== 'color') setColorOpen(false);
    if (keep !== 'font') setFontOpen(false);
    if (keep !== 'weight') setWeightOpen(false);
    if (keep !== 'size') setSizeOpen(false);
    if (keep !== 'align') setAlignOpen(false);
    if (keep !== 'link') setLinkOpen(false);
    if (keep !== 'ref') setRefOpen(false);
  }, []);

  // --- Keyboard shortcuts for formatting ---
  // Registered only on the 'floating' instance so shortcuts don't double-fire
  // when both toolbars are mounted.

  useEffect(() => {
    if (isTop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const active = document.activeElement;
      if (!active || !(active as HTMLElement).isContentEditable) return;
      const editable = active.closest('[contenteditable]') as HTMLElement;
      if (!editable) return;
      if (!editable.id?.startsWith('editable-') && !editable.hasAttribute('data-table-cell') && !editable.hasAttribute('data-editable')) return;

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
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
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
        }
        handled = true;
      }

      if (handled) {
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        detectFormats();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detectFormats, isTop]);

  // Listen for Ctrl+K toggle-link event.
  // Only the floating instance opens its link submenu in response, to avoid
  // two link submenus opening at once.
  useEffect(() => {
    if (isTop) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      saveSelection();
      setLinkUrl(detail?.href || '');
      setLinkOpen(prev => !prev);
      closeSubmenusExcept('link');
    };
    document.addEventListener('toolbar:toggle-link', handler);
    return () => document.removeEventListener('toolbar:toggle-link', handler);
  }, [saveSelection, closeSubmenusExcept, isTop]);

  // Handle clicks on links and internal references (global navigation).
  // Registered only once (floating instance) to avoid double-dispatching.
  useEffect(() => {
    if (isTop) return;
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
  }, [isTop]);

  return {
    // Visibility and position
    visible, position, toolbarRef,
    // Active states
    activeFormats, currentTextColor, currentBgColor,
    currentFont, currentWeight, currentFontSize, currentAlign, currentLink,
    // Submenu open states
    colorOpen, setColorOpen, fontOpen, setFontOpen,
    weightOpen, setWeightOpen, sizeOpen, setSizeOpen, alignOpen, setAlignOpen,
    linkOpen, setLinkOpen, refOpen, setRefOpen,
    linkUrl, setLinkUrl, refSearch, setRefSearch,
    // Refs
    colorMenuRef, fontMenuRef, weightMenuRef, sizeMenuRef, alignMenuRef,
    linkMenuRef, refMenuRef, linkInputRef, refInputRef,
    // Menu positions
    colorMenuPos, fontMenuPos, weightMenuPos, sizeMenuPos, alignMenuPos,
    linkMenuPos, refMenuPos,
    // Actions
    applyFormat, applyTextColor, applyBgColor,
    applyLink, removeLink, applyRef,
    applyFont, applyWeight, applyFontSize, applyAlignment,
    closeSubmenusExcept, restoreSelection, getSelectedBlockId,
  };
};
