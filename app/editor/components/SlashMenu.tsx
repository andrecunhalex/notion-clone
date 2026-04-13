'use client';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, Table, Minus, ImagePlus, LayoutTemplate, LucideIcon } from 'lucide-react';
import { BlockType } from '../types';
import { DesignBlockPicker } from './designBlocks/picker';
import type { PickerResult } from './designBlocks/picker';

interface SlashMenuProps {
  x: number;
  y: number;
  close: () => void;
  /**
   * Unified selection callback.
   * - For regular blocks: onSelect({ kind: 'block', type })
   * - For a single design template: onSelect({ kind: 'block', type: 'design_block', templateId })
   * - For a clause: onSelect({ kind: 'clause', clause: ... })
   *
   * Kept as a single entry point so the editor's insertion logic stays in
   * one place.
   */
  onSelect: (sel: SlashSelection) => void;
  /** Document id used by the picker to split "this doc" vs "workspace" sections */
  currentDocumentId: string;
  /** Forwarded to DesignBlock for inline image swaps in the clause editor */
  uploadImage?: (file: File) => Promise<string | null>;
}

export type SlashSelection =
  | { kind: 'block'; type: BlockType; templateId?: string }
  | { kind: 'clause'; clauseId: string };

interface MenuOption {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  aliases: string[];
  /** When true, selecting this option opens the Design library picker */
  opensPicker?: boolean;
}

const MENU_OPTIONS: MenuOption[] = [
  { type: 'text', label: 'Texto', icon: Type, aliases: ['text', 'texto', 'paragrafo', 'paragraph', 'p'] },
  { type: 'h1', label: 'Titulo 1', icon: Heading1, aliases: ['h1', 'heading1', 'titulo1', 'titulo 1', '#'] },
  { type: 'h2', label: 'Titulo 2', icon: Heading2, aliases: ['h2', 'heading2', 'titulo2', 'titulo 2', '##'] },
  { type: 'h3', label: 'Titulo 3', icon: Heading3, aliases: ['h3', 'heading3', 'titulo3', 'titulo 3', '###'] },
  { type: 'bullet_list', label: 'Lista com marcadores', icon: List, aliases: ['bullet', 'ul', 'lista', 'marcadores', '-'] },
  { type: 'numbered_list', label: 'Lista numerada', icon: ListOrdered, aliases: ['numbered', 'ol', 'numerada', 'ordered', '1.'] },
  { type: 'divider', label: 'Divisor', icon: Minus, aliases: ['divider', 'divisor', 'hr', 'linha', '---'] },
  { type: 'table', label: 'Tabela', icon: Table, aliases: ['table', 'tabela', 'grid'] },
  { type: 'image', label: 'Imagem', icon: ImagePlus, aliases: ['image', 'imagem', 'foto', 'picture', 'img'] },
  { type: 'design_block', label: 'Design', icon: LayoutTemplate, aliases: ['design', 'template', 'bloco', 'card', 'callout', 'clausula', 'clause', 'biblioteca'], opensPicker: true },
];

const MENU_GAP_ABOVE = 22;
const MENU_GAP_BELOW = 4;

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesFilter(option: MenuOption, query: string): boolean {
  if (!query) return true;
  const q = normalize(query.trim());
  if (!q) return true;
  if (normalize(option.label).includes(q)) return true;
  if (normalize(option.type).includes(q)) return true;
  return option.aliases.some(alias => normalize(alias).includes(q));
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, close, onSelect, currentDocumentId, uploadImage }) => {
  // Derive selectedIndex from a resettable key (filter) so we avoid a
  // setState-in-effect for the filter-change reset. The stored key is
  // compared against the current filter on every render; a mismatch yields
  // an index of 0 while the next user interaction repopulates the state.
  const [filter, setFilter] = useState('');
  const [idxState, setIdxState] = useState<{ key: string; idx: number }>({ key: '', idx: 0 });
  const selectedIndex = idxState.key === filter ? idxState.idx : 0;
  const setSelectedIndex = useCallback((updater: number | ((prev: number) => number)) => {
    setIdxState(prev => {
      const currentIdx = prev.key === filter ? prev.idx : 0;
      const nextIdx = typeof updater === 'function' ? updater(currentIdx) : updater;
      return { key: filter, idx: nextIdx };
    });
  }, [filter]);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = MENU_OPTIONS.filter(opt => matchesFilter(opt, filter));

  // Position the menu: prefer above the cursor, fallback to below
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const menuHeight = menuRect.height;
    const viewportHeight = window.innerHeight;

    const cursorY = y - 10;
    const aboveTop = cursorY - menuHeight - MENU_GAP_ABOVE;

    if (aboveTop >= 0) {
      setPosition({ left: x, top: aboveTop });
    } else {
      const belowTop = cursorY + MENU_GAP_BELOW;
      if (belowTop + menuHeight > viewportHeight) {
        setPosition({ left: x, top: Math.max(0, viewportHeight - menuHeight - MENU_GAP_BELOW) });
      } else {
        setPosition({ left: x, top: belowTop });
      }
    }
  }, [x, y, filteredOptions.length]);

  // Block page scroll while menu is open. Allow scrolls inside the menu itself
  // or inside any portaled child marked with [data-design-picker] (the design
  // library picker modal) — otherwise the picker's internal scroll is killed.
  useEffect(() => {
    const origOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const preventScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (menuRef.current && target && menuRef.current.contains(target)) return;
      if (target instanceof Element && target.closest('[data-design-picker]')) return;
      e.preventDefault();
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.documentElement.style.overflow = origOverflow;
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, []);


  // Scroll selected item into view (inside the menu list)
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-menu-item]');
    const selected = items[selectedIndex] as HTMLElement;
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((opt: MenuOption) => {
    if (opt.opensPicker) {
      setPickerOpen(true);
      return;
    }
    onSelect({ kind: 'block', type: opt.type });
  }, [onSelect]);

  const handlePickerResult = useCallback((result: PickerResult) => {
    setPickerOpen(false);
    if (result.kind === 'template') {
      onSelect({ kind: 'block', type: 'design_block', templateId: result.template.id });
    } else {
      onSelect({ kind: 'clause', clauseId: result.clause.id });
    }
  }, [onSelect]);

  // Keyboard navigation (disabled while picker is open — picker has its own)
  useEffect(() => {
    if (pickerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % (filteredOptions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + (filteredOptions.length || 1)) % (filteredOptions.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (filteredOptions.length > 0) {
          handleSelect(filteredOptions[selectedIndex] ?? filteredOptions[0]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Backspace') {
        if (filter.length > 0) setFilter(prev => prev.slice(0, -1));
        else close();
      } else if (e.key === ' ') {
        if (filter.endsWith(' ')) {
          e.preventDefault(); e.stopPropagation();
          close();
          return;
        }
        setFilter(prev => prev + ' ');
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setFilter(prev => prev + e.key);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedIndex, filteredOptions, close, handleSelect, filter, pickerOpen, setSelectedIndex]);

  // Click outside closes (but only when picker is not open — picker handles its own)
  useEffect(() => {
    if (pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [close, pickerOpen]);

  const headerText = filter ? 'Resultados filtrados' : 'Blocos Basicos';

  return (
    <>
      <div
        ref={menuRef}
        className="fixed w-64 bg-white shadow-xl border border-gray-200 rounded-lg z-50 flex flex-col"
        style={{
          left: position?.left ?? x,
          top: position?.top ?? y,
          visibility: position ? 'visible' : 'hidden',
        }}
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase">
          {headerText}
        </div>

        {/* Scrollable list */}
        <div ref={listRef} className="overflow-y-auto px-1" style={{ maxHeight: '240px' }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, i) => (
              <button
                key={opt.type}
                data-menu-item
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded text-left transition-colors ${
                  i === selectedIndex ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <opt.icon size={16} />
                <span className="flex-1">{opt.label}</span>
                {opt.opensPicker && (
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Biblioteca</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-2 py-3 text-sm text-gray-400 text-center">
              Nenhum resultado
            </div>
          )}
        </div>

        {/* Footer: close button */}
        <div className="border-t border-gray-100 px-1 py-1">
          <button
            onClick={close}
            className="flex items-center justify-between w-full px-2 py-1.5 text-sm text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            <span>Fechar menu</span>
            <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">esc</kbd>
          </button>
        </div>
      </div>

      {pickerOpen && (
        <DesignBlockPicker
          currentDocumentId={currentDocumentId}
          onPick={handlePickerResult}
          onClose={() => setPickerOpen(false)}
          uploadImage={uploadImage}
        />
      )}
    </>
  );
};

export { MENU_OPTIONS };
