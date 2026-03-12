'use client';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, Table, Minus, LucideIcon } from 'lucide-react';
import { BlockType } from '../types';

interface SlashMenuProps {
  x: number;
  y: number;
  close: () => void;
  onSelect: (type: BlockType) => void;
}

interface MenuOption {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  aliases: string[];
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

export const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, close, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredOptions = MENU_OPTIONS.filter(opt => matchesFilter(opt, filter));

  // Position the menu: prefer above the cursor, fallback to below
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const menuHeight = menuRect.height;
    const viewportHeight = window.innerHeight;

    // y already includes +10 offset from Block.tsx, so cursor line is roughly at y - 10
    const cursorY = y - 10;
    const aboveTop = cursorY - menuHeight - MENU_GAP_ABOVE;

    if (aboveTop >= 0) {
      // Fits fully above — prefer this
      setPosition({ left: x, top: aboveTop });
    } else {
      // Doesn't fit above — open below the cursor
      const belowTop = cursorY + MENU_GAP_BELOW;
      if (belowTop + menuHeight > viewportHeight) {
        setPosition({ left: x, top: Math.max(0, viewportHeight - menuHeight - MENU_GAP_BELOW) });
      } else {
        setPosition({ left: x, top: belowTop });
      }
    }
  }, [x, y, filteredOptions.length]);

  // Block page scroll while menu is open
  useEffect(() => {
    const origOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    // Also prevent wheel/touch scroll on the page (but allow inside the menu)
    const preventScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
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

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view (inside the menu list)
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-menu-item]');
    const selected = items[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((type: BlockType) => {
    onSelect(type);
  }, [onSelect]);

  // Keyboard navigation + filter building
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % (filteredOptions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + (filteredOptions.length || 1)) % (filteredOptions.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filteredOptions.length > 0) {
          handleSelect(filteredOptions[selectedIndex]?.type ?? filteredOptions[0].type);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Backspace') {
        if (filter.length > 0) {
          setFilter(prev => prev.slice(0, -1));
        } else {
          close();
        }
      } else if (e.key === ' ') {
        if (filter.endsWith(' ')) {
          e.preventDefault();
          e.stopPropagation();
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
  }, [selectedIndex, filteredOptions, close, handleSelect, filter]);

  // Click outside closes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [close]);

  const headerText = filter ? 'Resultados filtrados' : 'Blocos Basicos';

  return (
    <div
      ref={menuRef}
      className="fixed w-64 bg-white shadow-xl border border-gray-200 rounded-lg z-50 flex flex-col"
      style={{
        left: position?.left ?? x,
        top: position?.top ?? y,
        visibility: position ? 'visible' : 'hidden',
      }}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase">
        {headerText}
      </div>

      {/* Scrollable list */}
      <div
        ref={listRef}
        className="overflow-y-auto px-1"
        style={{ maxHeight: '240px' }}
      >
        {filteredOptions.length > 0 ? (
          filteredOptions.map((opt, i) => (
            <button
              key={opt.type}
              data-menu-item
              onClick={() => handleSelect(opt.type)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <opt.icon size={16} />
              {opt.label}
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
  );
};

export { MENU_OPTIONS };
