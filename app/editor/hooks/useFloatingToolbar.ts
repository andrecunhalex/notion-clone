'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { FontEntry } from '../fonts';
import { BlockData, TextAlign } from '../types';
import { isMac } from '../constants';

interface UseFloatingToolbarProps {
  documentFont?: string;
  blocks?: BlockData[];
  updateBlock?: (id: string, updates: Partial<BlockData>) => void;
  allFonts: FontEntry[];
}

export const useFloatingToolbar = ({ documentFont, blocks, updateBlock, allFonts }: UseFloatingToolbarProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [currentTextColor, setCurrentTextColor] = useState<string>('');
  const [currentBgColor, setCurrentBgColor] = useState<string>('');
  const [currentFont, setCurrentFont] = useState<string>('');
  const [currentWeight, setCurrentWeight] = useState<number>(400);
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('left');
  const [currentLink, setCurrentLink] = useState<HTMLAnchorElement | null>(null);

  // Submenu open states
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [refSearch, setRefSearch] = useState('');

  // Submenu position states
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const weightMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);
  const refMenuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [fontMenuPos, setFontMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [weightMenuPos, setWeightMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [alignMenuPos, setAlignMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [linkMenuPos, setLinkMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [refMenuPos, setRefMenuPos] = useState<{ left: number; top: number } | null>(null);

  const savedRange = useRef<Range | null>(null);
  const inputSubmenuOpenRef = useRef(false);
  inputSubmenuOpenRef.current = linkOpen || refOpen;

  // --- Helpers ---

  const getSelectedBlockId = useCallback((): string | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const el = sel.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? sel.anchorNode as HTMLElement
      : sel.anchorNode?.parentElement;
    const editable = el?.closest('[id^="editable-"]');
    return editable?.id?.replace('editable-', '') || null;
  }, []);

  const findStyledSpan = useCallback((node: Node | null): HTMLSpanElement | null => {
    if (!node) return null;
    let el: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE
      ? node as HTMLElement
      : node.parentElement;
    while (el && !el.hasAttribute('contenteditable')) {
      if (el.tagName === 'SPAN' && (el.style.fontFamily || el.style.fontWeight)) {
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
    return !!(editable.id?.startsWith('editable-') || editable.hasAttribute('data-table-cell'));
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

    setPosition({ left, top });
  }, []);

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

    setPosition({ left, top });
  }, [visible, activeFormats]);

  // Listen for selection changes
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updatePosition, 50);
    };
    const onMouseUp = () => setTimeout(updatePosition, 10);

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [updatePosition]);

  // Reposition on scroll + close menus on click outside
  useEffect(() => {
    if (!visible) return;

    const onScroll = () => {
      if (inputSubmenuOpenRef.current) repositionFromSavedRange();
      else updatePosition();
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolbarRef.current?.contains(target)) return;
      if (colorMenuRef.current?.contains(target)) return;
      if (fontMenuRef.current?.contains(target)) return;
      if (weightMenuRef.current?.contains(target)) return;
      if (alignMenuRef.current?.contains(target)) return;
      if (linkMenuRef.current?.contains(target)) return;
      if (refMenuRef.current?.contains(target)) return;
      setLinkOpen(false); setRefOpen(false); setColorOpen(false);
      setFontOpen(false); setWeightOpen(false); setAlignOpen(false);
    };

    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [visible, updatePosition, repositionFromSavedRange]);

  // Close submenus when toolbar hides
  useEffect(() => {
    if (!visible) {
      setColorOpen(false); setFontOpen(false); setWeightOpen(false);
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
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (colorOpen) positionSubmenu(colorMenuRef, setColorMenuPos);
    else setColorMenuPos(null);
  }, [colorOpen, position, positionSubmenu]);

  useLayoutEffect(() => {
    if (fontOpen) positionSubmenu(fontMenuRef, setFontMenuPos);
    else setFontMenuPos(null);
  }, [fontOpen, position, positionSubmenu]);

  useLayoutEffect(() => {
    if (weightOpen) positionSubmenu(weightMenuRef, setWeightMenuPos);
    else setWeightMenuPos(null);
  }, [weightOpen, position, positionSubmenu]);

  useLayoutEffect(() => {
    if (alignOpen) positionSubmenu(alignMenuRef, setAlignMenuPos, true);
    else setAlignMenuPos(null);
  }, [alignOpen, position, positionSubmenu]);

  useLayoutEffect(() => {
    if (linkOpen) {
      positionSubmenu(linkMenuRef, setLinkMenuPos);
      setTimeout(() => linkInputRef.current?.focus(), 0);
    } else setLinkMenuPos(null);
  }, [linkOpen, position, positionSubmenu]);

  useLayoutEffect(() => {
    if (refOpen) {
      positionSubmenu(refMenuRef, setRefMenuPos);
      setTimeout(() => refInputRef.current?.focus(), 0);
    } else setRefMenuPos(null);
  }, [refOpen, position, positionSubmenu]);

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
    }
    if (styles.fontFamily !== undefined) span.style.fontFamily = styles.fontFamily;
    if (styles.fontWeight !== undefined) span.style.fontWeight = styles.fontWeight;
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
  }, [restoreSelection, saveSelection, detectFormats]);

  const applyTextColor = useCallback((color: string) => {
    restoreSelection();
    if (color) { document.execCommand('foreColor', false, color); }
    else { document.execCommand('removeFormat', false); }
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection]);

  const applyBgColor = useCallback((color: string) => {
    restoreSelection();
    document.execCommand('hiliteColor', false, color || 'transparent');
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection]);

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
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setFontOpen(false); return; }

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const isDefault = !font.isCustom && font.family === allFonts[0]?.family;
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
  }, [restoreSelection, saveSelection, allFonts, findStyledSpan, selectionCoversSpan, wrapRangeInSpan]);

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

  const applyAlignment = useCallback((align: TextAlign) => {
    restoreSelection();
    const blockId = getSelectedBlockId();
    if (blockId && updateBlock) {
      updateBlock(blockId, { align: align === 'left' ? undefined : align });
      setCurrentAlign(align);
    }
    setAlignOpen(false);
  }, [restoreSelection, getSelectedBlockId, updateBlock]);

  // Close all submenus except one
  const closeSubmenusExcept = useCallback((keep?: string) => {
    if (keep !== 'color') setColorOpen(false);
    if (keep !== 'font') setFontOpen(false);
    if (keep !== 'weight') setWeightOpen(false);
    if (keep !== 'align') setAlignOpen(false);
    if (keep !== 'link') setLinkOpen(false);
    if (keep !== 'ref') setRefOpen(false);
  }, []);

  // --- Keyboard shortcuts for formatting ---

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const active = document.activeElement;
      if (!active || !(active as HTMLElement).isContentEditable) return;
      const editable = active.closest('[contenteditable]') as HTMLElement;
      if (!editable) return;
      if (!editable.id?.startsWith('editable-') && !editable.hasAttribute('data-table-cell')) return;

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
  }, [detectFormats]);

  // Listen for Ctrl+K toggle-link event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      saveSelection();
      setLinkUrl(detail?.href || '');
      setLinkOpen(prev => !prev);
      closeSubmenusExcept('link');
    };
    document.addEventListener('toolbar:toggle-link', handler);
    return () => document.removeEventListener('toolbar:toggle-link', handler);
  }, [saveSelection, closeSubmenusExcept]);

  // Handle clicks on links and internal references
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const editable = anchor.closest('[id^="editable-"], [data-table-cell]');
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

  return {
    // Visibility and position
    visible, position, toolbarRef,
    // Active states
    activeFormats, currentTextColor, currentBgColor,
    currentFont, currentWeight, currentAlign, currentLink,
    // Submenu open states
    colorOpen, setColorOpen, fontOpen, setFontOpen,
    weightOpen, setWeightOpen, alignOpen, setAlignOpen,
    linkOpen, setLinkOpen, refOpen, setRefOpen,
    linkUrl, setLinkUrl, refSearch, setRefSearch,
    // Refs
    colorMenuRef, fontMenuRef, weightMenuRef, alignMenuRef,
    linkMenuRef, refMenuRef, linkInputRef, refInputRef,
    // Menu positions
    colorMenuPos, fontMenuPos, weightMenuPos, alignMenuPos,
    linkMenuPos, refMenuPos,
    // Actions
    applyFormat, applyTextColor, applyBgColor,
    applyLink, removeLink, applyRef,
    applyFont, applyWeight, applyAlignment,
    closeSubmenusExcept, restoreSelection, getSelectedBlockId,
  };
};
