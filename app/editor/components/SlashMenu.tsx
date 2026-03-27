'use client';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Type, Heading1, Heading2, Heading3, List, ListOrdered, Table, Minus, ImagePlus, LayoutTemplate, LucideIcon } from 'lucide-react';
import { BlockType } from '../types';
import { DESIGN_TEMPLATES, DesignBlockTemplate } from './designBlocks';

interface SlashMenuProps {
  x: number;
  y: number;
  close: () => void;
  onSelect: (type: BlockType, templateId?: string) => void;
}

interface MenuOption {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  aliases: string[];
  hasSubmenu?: boolean;
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
  { type: 'design_block', label: 'Design', icon: LayoutTemplate, aliases: ['design', 'template', 'bloco', 'card', 'callout'], hasSubmenu: true },
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

/** Build a static preview HTML from a template, injecting default values */
function buildPreviewHtml(tpl: DesignBlockTemplate): string {
  const div = document.createElement('div');
  div.innerHTML = tpl.html;
  div.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
    const key = el.getAttribute('data-editable')!;
    el.textContent = tpl.defaults[key] ?? '';
    el.removeAttribute('data-editable');
  });
  div.querySelectorAll<HTMLElement>('[data-swappable]').forEach(el => {
    const key = el.getAttribute('data-swappable')!;
    if (el.tagName === 'IMG') (el as HTMLImageElement).src = tpl.defaults[key] ?? '';
    el.removeAttribute('data-swappable');
  });
  return div.innerHTML;
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, close, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [showDesignSubmenu, setShowDesignSubmenu] = useState(false);
  const [submenuPos, setSubmenuPos] = useState<{ left: number; top: number } | null>(null);
  const [submenuIndex, setSubmenuIndex] = useState(0);
  const [inSubmenu, setInSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designTriggerRef = useRef<HTMLButtonElement>(null);

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

  const handleSelect = useCallback((type: BlockType, templateId?: string) => {
    onSelect(type, templateId);
  }, [onSelect]);

  // Helper to open submenu and calculate position
  const openSubmenu = useCallback(() => {
    setShowDesignSubmenu(true);
    setSubmenuIndex(0);
    setInSubmenu(false);
    requestAnimationFrame(() => {
      if (designTriggerRef.current) {
        const rect = designTriggerRef.current.getBoundingClientRect();
        setSubmenuPos({ left: rect.right + 4, top: rect.top });
      }
    });
  }, []);

  // Keyboard navigation + filter building
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // When inside the submenu
      if (inSubmenu && showDesignSubmenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation();
          setSubmenuIndex(prev => (prev + 1) % DESIGN_TEMPLATES.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); e.stopPropagation();
          setSubmenuIndex(prev => (prev - 1 + DESIGN_TEMPLATES.length) % DESIGN_TEMPLATES.length);
        } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          setInSubmenu(false);
        } else if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          handleSelect('design_block', DESIGN_TEMPLATES[submenuIndex].id);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % (filteredOptions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + (filteredOptions.length || 1)) % (filteredOptions.length || 1));
      } else if (e.key === 'ArrowRight') {
        // Open submenu if current item has one
        const opt = filteredOptions[selectedIndex];
        if (opt?.hasSubmenu) {
          e.preventDefault(); e.stopPropagation();
          openSubmenu();
          setInSubmenu(true);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (filteredOptions.length > 0) {
          const opt = filteredOptions[selectedIndex] ?? filteredOptions[0];
          if (opt.hasSubmenu) {
            openSubmenu();
            setInSubmenu(true);
          } else {
            handleSelect(opt.type);
          }
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
  }, [selectedIndex, filteredOptions, close, handleSelect, filter, inSubmenu, showDesignSubmenu, submenuIndex, openSubmenu]);

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
              ref={opt.hasSubmenu ? designTriggerRef : undefined}
              data-menu-item
              onClick={() => {
                if (opt.hasSubmenu) {
                  setSelectedIndex(i);
                  openSubmenu();
                  setInSubmenu(true);
                } else {
                  handleSelect(opt.type);
                }
              }}
              onMouseEnter={() => {
                setSelectedIndex(i);
                setInSubmenu(false);
                if (opt.hasSubmenu) {
                  if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
                  submenuTimerRef.current = setTimeout(() => openSubmenu(), 150);
                } else {
                  if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
                  setShowDesignSubmenu(false);
                }
              }}
              className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <opt.icon size={16} />
              <span className="flex-1">{opt.label}</span>
              {opt.hasSubmenu && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          ))
        ) : (
          <div className="px-2 py-3 text-sm text-gray-400 text-center">
            Nenhum resultado
          </div>
        )}
      </div>

      {/* Design templates submenu — rendered outside scroll area via fixed position */}
      {showDesignSubmenu && submenuPos && (
        <div
          className="fixed w-64 bg-white shadow-xl border border-gray-200 rounded-lg py-1.5 z-[60]"
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
          onMouseEnter={() => {
            if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
            setInSubmenu(true);
          }}
          onMouseLeave={() => {
            setInSubmenu(false);
            setShowDesignSubmenu(false);
          }}
        >
          <div className="px-3 pb-1 text-xs font-semibold text-gray-400 uppercase">Templates</div>
          {DESIGN_TEMPLATES.map((tpl, ti) => {
            const previewHtml = buildPreviewHtml(tpl);
            return (
              <button
                key={tpl.id}
                onClick={() => handleSelect('design_block', tpl.id)}
                onMouseEnter={() => { setSubmenuIndex(ti); setInSubmenu(true); }}
                className={`flex flex-col gap-1 w-full px-2 py-1.5 text-left rounded mx-1 transition-colors ${
                  inSubmenu && submenuIndex === ti
                    ? 'bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <span className="text-sm font-medium text-gray-700">{tpl.name}</span>
                <div
                  className="w-full rounded-md overflow-hidden border border-gray-100 pointer-events-none bg-white px-2 py-1.5"
                  style={{ transform: 'scale(0.75)', transformOrigin: 'top left', maxHeight: 60, width: '133%' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </button>
            );
          })}
        </div>
      )}

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
