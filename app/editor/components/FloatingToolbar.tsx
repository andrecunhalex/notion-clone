'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Link, ChevronRight,
  Palette
} from 'lucide-react';

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
export const FloatingToolbar: React.FC = () => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [colorOpen, setColorOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  // Store the selection range so we can restore it after button clicks
  const savedRange = useRef<Range | null>(null);

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
  }, []);

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
      // Don't close yet - let selectionchange handle it
    };

    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [visible, updatePosition]);

  // Close color picker when toolbar hides
  useEffect(() => {
    if (!visible) {
      setColorOpen(false);
    }
  }, [visible]);

  // Position color submenu
  useLayoutEffect(() => {
    if (!colorOpen || !colorMenuRef.current || !toolbarRef.current) {
      setColorMenuPos(null);
      return;
    }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const colorRect = colorMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Position below the toolbar, aligned to the left of the color button area
    let left = toolbarRect.left;
    let top = toolbarRect.bottom + 4;

    // If goes off bottom, show above toolbar
    if (top + colorRect.height > vh - 4) {
      top = toolbarRect.top - colorRect.height - 4;
    }
    // Clamp horizontal
    if (left + colorRect.width > vw - 4) left = vw - colorRect.width - 4;
    if (left < 4) left = 4;

    setColorMenuPos({ left, top });
  }, [colorOpen]);

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
        {/* Color button */}
        <Tooltip label="Cor" shortcut="">
          <button
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${colorOpen ? 'bg-gray-100' : ''}`}
            onClick={() => setColorOpen(!colorOpen)}
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
    </>
  );
};
