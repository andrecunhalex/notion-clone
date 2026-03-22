'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Link, ChevronRight,
  Palette, Type, ChevronDown
} from 'lucide-react';
import { FontEntry, WEIGHT_LABELS } from '../fonts';
import { useFonts } from './FontLoader';

// --- Color constants (same as TableBlock) ---

const TEXT_COLORS = [
  { name: 'Padrão', value: '', preview: '#37352F', border: true },
  { name: 'Cinza', value: '#9B9A97', preview: '#9B9A97' },
  { name: 'Marrom', value: '#64473A', preview: '#64473A' },
  { name: 'Laranja', value: '#D9730D', preview: '#D9730D' },
  { name: 'Amarelo', value: '#DFAB01', preview: '#DFAB01' },
  { name: 'Verde', value: '#0F7B6C', preview: '#0F7B6C' },
  { name: 'Azul', value: '#0B6E99', preview: '#0B6E99' },
  { name: 'Roxo', value: '#6940A5', preview: '#6940A5' },
  { name: 'Rosa', value: '#AD1A72', preview: '#AD1A72' },
  { name: 'Vermelho', value: '#E03E3E', preview: '#E03E3E' },
];

const BG_COLORS = [
  { name: 'Padrão', value: '', preview: '#FFFFFF', border: true },
  { name: 'Cinza', value: '#F1F1EF', preview: '#F1F1EF' },
  { name: 'Marrom', value: '#F4EEEE', preview: '#F4EEEE' },
  { name: 'Laranja', value: '#FBECDD', preview: '#FBECDD' },
  { name: 'Amarelo', value: '#FBF3DB', preview: '#FBF3DB' },
  { name: 'Verde', value: '#EDF3EC', preview: '#EDF3EC' },
  { name: 'Azul', value: '#E7F3F8', preview: '#E7F3F8' },
  { name: 'Roxo', value: '#F6F3F9', preview: '#F6F3F9' },
  { name: 'Rosa', value: '#F9F0F5', preview: '#F9F0F5' },
  { name: 'Vermelho', value: '#FBE4E4', preview: '#FBE4E4' },
];

// --- OS detection ---
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl';
const shiftKey = isMac ? '⇧' : 'Shift';

// --- Formatting actions ---
interface FormatAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  command: string;
}

const FORMAT_ACTIONS: FormatAction[] = [
  { id: 'bold', icon: <Bold size={16} strokeWidth={2.5} />, label: 'Negrito', shortcut: `${modKey}+B`, command: 'bold' },
  { id: 'italic', icon: <Italic size={16} />, label: 'Itálico', shortcut: `${modKey}+I`, command: 'italic' },
  { id: 'underline', icon: <Underline size={16} />, label: 'Sublinhado', shortcut: `${modKey}+U`, command: 'underline' },
  { id: 'strikethrough', icon: <Strikethrough size={16} />, label: 'Tachado', shortcut: `${modKey}+${shiftKey}+X`, command: 'strikeThrough' },
  // { id: 'code', icon: <Code size={16} />, label: 'Código', shortcut: `${modKey}+E`, command: 'code' },
];

// --- Tooltip component ---
const Tooltip: React.FC<{ label: string; shortcut: string; children: React.ReactNode }> = ({ label, shortcut, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-[60] pointer-events-none">
          <span>{label}</span>
          <span className="ml-1.5 text-gray-400">{shortcut}</span>
        </div>
      )}
    </div>
  );
};

// --- Main component ---
interface FloatingToolbarProps {
  documentFont?: string;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ documentFont }) => {
  const { allFonts, customFonts } = useFonts();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [colorOpen, setColorOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  // Font picker state
  const [fontOpen, setFontOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const [fontMenuPos, setFontMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [currentFont, setCurrentFont] = useState<string>('');
  const [currentWeight, setCurrentWeight] = useState<number>(400);

  // Weight picker state
  const [weightOpen, setWeightOpen] = useState(false);
  const weightMenuRef = useRef<HTMLDivElement>(null);
  const [weightMenuPos, setWeightMenuPos] = useState<{ left: number; top: number } | null>(null);

  // Store the selection range so we can restore it after button clicks
  const savedRange = useRef<Range | null>(null);

  // Walk up the DOM to find the closest styled <span> (with fontFamily or fontWeight)
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

  // Detect active formats at current selection
  const detectFormats = useCallback(() => {
    const formats = new Set<string>();
    try {
      if (document.queryCommandState('bold')) formats.add('bold');
      if (document.queryCommandState('italic')) formats.add('italic');
      if (document.queryCommandState('underline')) formats.add('underline');
      if (document.queryCommandState('strikeThrough')) formats.add('strikethrough');
      // Check for code: look if selection is inside a <code> element
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode?.parentElement;
        if (node?.closest('code')) formats.add('code');
      }
    } catch { /* ignore */ }
    setActiveFormats(formats);

    // Detect current font and weight at selection
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.anchorNode;
      const el = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : (node as Node)?.parentElement;
      if (el) {
        const computed = window.getComputedStyle(el);
        const family = computed.fontFamily;
        const weight = parseInt(computed.fontWeight, 10) || 400;
        // Try to match against known fonts (prioritize custom fonts over system)
        const sortedFonts = [...allFonts].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
        const matched = sortedFonts.find(f =>
          family.toLowerCase().includes(f.family.split(',')[0].trim().replace(/['"]/g, '').toLowerCase())
        );
        setCurrentFont(matched?.family || '');
        setCurrentWeight(weight);
      }
    }
  }, [allFonts]);

  // Check if selection is inside an editable block or table cell
  const isInEditable = useCallback((): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const anchor = sel.anchorNode;
    if (!anchor) return false;
    const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
    if (!el) return false;
    // Check if inside a contentEditable element within our editor
    const editable = el.closest('[contenteditable="true"], [contenteditable=""]');
    if (!editable) return false;
    // Must be inside our editor (has editable-* id or data-table-cell)
    return !!(editable.id?.startsWith('editable-') || editable.hasAttribute('data-table-cell'));
  }, []);

  // Position the toolbar above the selection
  const updatePosition = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setVisible(false);
      return;
    }

    if (!isInEditable()) {
      setVisible(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setVisible(false);
      return;
    }

    setVisible(true);
    detectFormats();
    saveSelection();
  }, [isInEditable, detectFormats, saveSelection]);

  // Use layoutEffect to position after visible is set
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

    // If doesn't fit above, show below
    if (top < 4) {
      top = rect.bottom + 8;
    }
    // Clamp horizontal
    if (left < 4) left = 4;
    if (left + toolbarRect.width > vw - 4) left = vw - toolbarRect.width - 4;
    // Clamp vertical
    if (top + toolbarRect.height > vh - 4) top = vh - toolbarRect.height - 4;

    setPosition({ left, top });
  }, [visible, activeFormats]);

  // Listen for selection changes
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;

    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updatePosition();
      }, 50);
    };

    const onMouseUp = () => {
      // Small delay to let selection finalize
      setTimeout(updatePosition, 10);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [updatePosition]);

  // Close toolbar on scroll or click outside
  useEffect(() => {
    if (!visible) return;

    const onScroll = () => {
      // Reposition on scroll instead of hiding
      updatePosition();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      if (colorMenuRef.current?.contains(e.target as Node)) return;
      if (fontMenuRef.current?.contains(e.target as Node)) return;
      // Don't close yet - let selectionchange handle it
    };

    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [visible, updatePosition]);

  // Close submenus when toolbar hides
  useEffect(() => {
    if (!visible) {
      setColorOpen(false);
      setFontOpen(false);
      setWeightOpen(false);
    }
  }, [visible]);

  // Position color submenu (re-run when toolbar moves)
  useLayoutEffect(() => {
    if (!colorOpen || !colorMenuRef.current || !toolbarRef.current) {
      setColorMenuPos(null);
      return;
    }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const colorRect = colorMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = toolbarRect.left;
    let top = toolbarRect.bottom + 4;

    if (top + colorRect.height > vh - 4) {
      top = toolbarRect.top - colorRect.height - 4;
    }
    if (left + colorRect.width > vw - 4) left = vw - colorRect.width - 4;
    if (left < 4) left = 4;

    setColorMenuPos({ left, top });
  }, [colorOpen, position]);

  // Position font submenu (re-run when toolbar moves)
  useLayoutEffect(() => {
    if (!fontOpen || !fontMenuRef.current || !toolbarRef.current) {
      setFontMenuPos(null);
      return;
    }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const fontRect = fontMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = toolbarRect.left;
    let top = toolbarRect.bottom + 4;

    if (top + fontRect.height > vh - 4) {
      top = toolbarRect.top - fontRect.height - 4;
    }
    if (left + fontRect.width > vw - 4) left = vw - fontRect.width - 4;
    if (left < 4) left = 4;

    setFontMenuPos({ left, top });
  }, [fontOpen, position]);

  // Position weight submenu (re-run when toolbar moves)
  useLayoutEffect(() => {
    if (!weightOpen || !weightMenuRef.current || !toolbarRef.current) {
      setWeightMenuPos(null);
      return;
    }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const menuRect = weightMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = toolbarRect.left;
    let top = toolbarRect.bottom + 4;

    if (top + menuRect.height > vh - 4) {
      top = toolbarRect.top - menuRect.height - 4;
    }
    if (left + menuRect.width > vw - 4) left = vw - menuRect.width - 4;
    if (left < 4) left = 4;

    setWeightMenuPos({ left, top });
  }, [weightOpen, position]);

  // Apply formatting command
  const applyFormat = useCallback((command: string) => {
    restoreSelection();

    if (command === 'code') {
      // Toggle inline code by wrapping/unwrapping with <code>
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const parent = sel.anchorNode?.parentElement;
      if (parent?.tagName === 'CODE') {
        // Unwrap: replace <code> with its text content
        const text = document.createTextNode(parent.textContent || '');
        parent.parentNode?.replaceChild(text, parent);
        const newRange = document.createRange();
        newRange.selectNodeContents(text);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        const code = document.createElement('code');
        code.className = 'bg-gray-100 text-red-500 px-1 py-0.5 rounded text-[0.9em] font-mono';
        try {
          range.surroundContents(code);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(code);
          sel.addRange(newRange);
        } catch {
          // surroundContents fails if selection crosses element boundaries
          const fragment = range.extractContents();
          code.appendChild(fragment);
          range.insertNode(code);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(code);
          sel.addRange(newRange);
        }
      }
      // Trigger input event so content is saved
      const editable = sel.anchorNode?.parentElement?.closest('[contenteditable]');
      if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand(command, false);
    }

    saveSelection();
    detectFormats();
  }, [restoreSelection, saveSelection, detectFormats]);

  // Apply text color
  const applyTextColor = useCallback((color: string) => {
    restoreSelection();
    if (color) {
      document.execCommand('foreColor', false, color);
    } else {
      // Remove color - set to inherit
      document.execCommand('removeFormat', false);
      // Re-apply other formats that were active
    }
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection]);

  // Apply background color
  const applyBgColor = useCallback((color: string) => {
    restoreSelection();
    if (color) {
      document.execCommand('hiliteColor', false, color);
    } else {
      // Remove highlight
      document.execCommand('hiliteColor', false, 'transparent');
    }
    const sel = window.getSelection();
    const editable = sel?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setColorOpen(false);
  }, [restoreSelection, saveSelection]);

  // Check if the selection range covers the entire contents of a span
  const selectionCoversSpan = useCallback((range: Range, span: HTMLElement): boolean => {
    const spanRange = document.createRange();
    spanRange.selectNodeContents(span);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0
    );
  }, []);

  // Wrap a range in a new span, copying relevant styles from a parent span if present
  const wrapRangeInSpan = useCallback((range: Range, sel: Selection, styles: Partial<CSSStyleDeclaration>, parentSpan?: HTMLElement | null) => {
    const span = document.createElement('span');
    // Copy existing styles from parent span so the new span inherits font+weight
    if (parentSpan) {
      if (parentSpan.style.fontFamily) span.style.fontFamily = parentSpan.style.fontFamily;
      if (parentSpan.style.fontWeight) span.style.fontWeight = parentSpan.style.fontWeight;
    }
    // Apply the new styles on top
    if (styles.fontFamily !== undefined) span.style.fontFamily = styles.fontFamily;
    if (styles.fontWeight !== undefined) span.style.fontWeight = styles.fontWeight;
    try {
      range.surroundContents(span);
    } catch {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
  }, []);

  // Apply font family to selection
  const applyFont = useCallback((font: FontEntry) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setFontOpen(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const isDefault = !font.isCustom && font.family === allFonts[0].family;
    const coversAll = styledSpan && styledSpan.contains(sel.focusNode) && selectionCoversSpan(range, styledSpan);

    if (coversAll && styledSpan) {
      // Selection covers the entire span — modify in place
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
      // Partial selection or no existing span — wrap in a new span
      if (isDefault) {
        setFontOpen(false);
        return;
      }
      wrapRangeInSpan(range, sel, { fontFamily: font.family }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentFont(font.family);
    setFontOpen(false);
  }, [restoreSelection, saveSelection, allFonts, findStyledSpan, selectionCoversSpan, wrapRangeInSpan]);

  // Apply font-weight to selection
  const applyWeight = useCallback((weight: number) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setWeightOpen(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const styledSpan = findStyledSpan(sel.anchorNode);
    const coversAll = styledSpan && styledSpan.contains(sel.focusNode) && selectionCoversSpan(range, styledSpan);
    const weightVal = weight === 400 ? '' : String(weight);

    if (coversAll && styledSpan) {
      // Selection covers the entire span — modify in place
      styledSpan.style.fontWeight = weightVal;
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(styledSpan);
      sel.addRange(newRange);
    } else {
      if (weight === 400) {
        setWeightOpen(false);
        return;
      }
      wrapRangeInSpan(range, sel, { fontWeight: String(weight) }, styledSpan);
    }

    const editable = (sel.anchorNode?.parentElement ?? sel.anchorNode as HTMLElement)?.closest?.('[contenteditable]');
    if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    saveSelection();
    setCurrentWeight(weight);
    setWeightOpen(false);
  }, [restoreSelection, saveSelection, findStyledSpan, selectionCoversSpan, wrapRangeInSpan]);

  // Keyboard shortcuts for formatting
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
        e.preventDefault();
        document.execCommand('bold', false);
        handled = true;
      } else if (e.key === 'i' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('italic', false);
        handled = true;
      } else if (e.key === 'u' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('underline', false);
        handled = true;
      } else if (e.key === 'x' && e.shiftKey) {
        e.preventDefault();
        document.execCommand('strikeThrough', false);
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
            try {
              range.surroundContents(code);
            } catch {
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

  // Get available weights for the currently selected font
  const currentFontEntry = allFonts.find(f => f.family === currentFont);
  const availableWeights = currentFontEntry?.availableWeights;
  const currentWeightLabel = WEIGHT_LABELS[currentWeight] || String(currentWeight);

  if (!visible) return null;

  return (
    <>
      {/* Main toolbar */}
      <div
        ref={toolbarRef}
        className="fixed z-50 bg-white shadow-lg border border-gray-200 rounded-lg p-1 flex items-center gap-0.5"
        style={{ left: position.left, top: position.top }}
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      >
        {/* Font button */}
        <Tooltip label="Fonte" shortcut="">
          <button
            className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 max-w-[100px] ${fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { setFontOpen(!fontOpen); setColorOpen(false); setWeightOpen(false); }}
          >
            <Type size={14} />
            <span className="truncate">
              {currentFont
                ? allFonts.find(f => f.family === currentFont)?.name || 'Fonte'
                : 'Fonte'}
            </span>
            <ChevronDown size={10} />
          </button>
        </Tooltip>

        {/* Weight button — only show when a custom font with multiple weights is active */}
        {availableWeights && availableWeights.length > 1 && (
          <Tooltip label="Peso" shortcut="">
            <button
              className={`px-1.5 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5 text-xs text-gray-600 ${weightOpen ? 'bg-gray-100' : ''}`}
              onClick={() => { setWeightOpen(!weightOpen); setFontOpen(false); setColorOpen(false); }}
            >
              <span className="truncate" style={{ fontWeight: currentWeight }}>
                {currentWeightLabel}
              </span>
              <ChevronDown size={10} />
            </button>
          </Tooltip>
        )}

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Color button */}
        <Tooltip label="Cor" shortcut="">
          <button
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${colorOpen ? 'bg-gray-100' : ''}`}
            onClick={() => { setColorOpen(!colorOpen); setFontOpen(false); }}
          >
            <Palette size={16} className="text-gray-600" />
          </button>
        </Tooltip>

        <div className="w-px h-5 bg-gray-200 mx-0.5" />

        {/* Format buttons */}
        {FORMAT_ACTIONS.map(action => (
          <Tooltip key={action.id} label={action.label} shortcut={action.shortcut}>
            <button
              className={`p-1.5 rounded transition-colors ${
                activeFormats.has(action.id)
                  ? 'bg-gray-200 text-gray-900'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
              onClick={() => applyFormat(action.command)}
            >
              {action.icon}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Color picker dropdown */}
      {colorOpen && (
        <div
          ref={colorMenuRef}
          className="fixed z-[51] bg-white shadow-xl border border-gray-200 rounded-lg p-3 w-[220px]"
          style={{
            left: colorMenuPos?.left ?? 0,
            top: colorMenuPos?.top ?? 0,
            visibility: colorMenuPos ? 'visible' : 'hidden',
          }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        >
          {/* Text colors */}
          <div className="text-xs font-medium text-gray-500 mb-1.5">Cor do texto</div>
          <div className="grid grid-cols-5 gap-1 mb-3">
            {TEXT_COLORS.map(c => (
              <button
                key={c.name}
                className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-gray-50 border border-transparent hover:border-gray-300 transition-colors"
                title={c.name}
                onClick={() => applyTextColor(c.value)}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: c.preview }}
                >A</span>
              </button>
            ))}
          </div>

          {/* Background colors */}
          <div className="text-xs font-medium text-gray-500 mb-1.5">Cor de fundo</div>
          <div className="grid grid-cols-5 gap-1">
            {BG_COLORS.map(c => (
              <button
                key={c.name}
                className={`w-9 h-9 rounded-md hover:ring-2 hover:ring-gray-300 transition-all ${c.border ? 'ring-1 ring-gray-200' : ''}`}
                style={{ backgroundColor: c.preview }}
                title={c.name}
                onClick={() => applyBgColor(c.value)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Font picker dropdown */}
      {fontOpen && (
        <div
          ref={fontMenuRef}
          className="fixed z-[51] bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-[200px] max-h-[280px] overflow-y-auto"
          style={{
            left: fontMenuPos?.left ?? 0,
            top: fontMenuPos?.top ?? 0,
            visibility: fontMenuPos ? 'visible' : 'hidden',
          }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        >
          {allFonts.length > 0 && (
            <>
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 py-1">
                Fontes do sistema
              </div>
              {allFonts.filter(f => !f.isCustom).map(font => (
                <button
                  key={font.family}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    currentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                  }`}
                  onClick={() => applyFont(font)}
                >
                  <span style={{ fontFamily: font.family }}>{font.name}</span>
                  {currentFont === font.family && (
                    <span className="text-blue-500 text-xs">&#10003;</span>
                  )}
                </button>
              ))}
            </>
          )}
          {customFonts.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 py-1">
                Fontes customizadas
              </div>
              {customFonts.map(font => (
                <button
                  key={font.family}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    currentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                  }`}
                  onClick={() => applyFont(font)}
                >
                  <span style={{ fontFamily: font.family }}>{font.name}</span>
                  {currentFont === font.family && (
                    <span className="text-blue-500 text-xs">&#10003;</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Weight picker dropdown */}
      {weightOpen && availableWeights && availableWeights.length > 1 && (
        <div
          ref={weightMenuRef}
          className="fixed z-[51] bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-[160px] max-h-[280px] overflow-y-auto"
          style={{
            left: weightMenuPos?.left ?? 0,
            top: weightMenuPos?.top ?? 0,
            visibility: weightMenuPos ? 'visible' : 'hidden',
          }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        >
          {availableWeights.map(w => (
            <button
              key={w}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                currentWeight === w ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
              }`}
              onClick={() => applyWeight(w)}
            >
              <span style={{ fontFamily: currentFont, fontWeight: w }}>
                {WEIGHT_LABELS[w] || w}
              </span>
              {currentWeight === w && (
                <span className="text-blue-500 text-xs">&#10003;</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
