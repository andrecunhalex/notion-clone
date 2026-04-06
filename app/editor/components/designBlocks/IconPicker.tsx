'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Iconify API helpers (Phosphor Icons = prefix "ph")
// ---------------------------------------------------------------------------

interface IconifySearchResult {
  icons: string[];
  total: number;
}

const ICON_PREFIX = 'ph';
const ICON_COLORS = [
  { name: 'Preto', value: '#000000' },
  { name: 'Cinza', value: '#6B7280' },
  { name: 'Vermelho', value: '#E03E3E' },
  { name: 'Laranja', value: '#D9730D' },
  { name: 'Amarelo', value: '#DFAB01' },
  { name: 'Verde', value: '#0F7B6C' },
  { name: 'Azul', value: '#0B6E99' },
  { name: 'Roxo', value: '#6940A5' },
  { name: 'Rosa', value: '#AD1A72' },
  { name: 'Branco', value: '#FFFFFF' },
];

const POPULAR_ICONS = [
  'star', 'heart', 'check-circle', 'warning', 'info',
  'user', 'gear', 'envelope', 'phone', 'map-pin',
  'lightning', 'fire', 'shield-check', 'lock', 'eye',
  'camera', 'image', 'file-text', 'folder', 'cloud',
  'chat-circle', 'bell', 'calendar', 'clock', 'trophy',
  'rocket', 'flag', 'bookmark', 'thumbs-up', 'smiley',
  'house', 'briefcase', 'chart-bar', 'megaphone', 'gift',
  'puzzle-piece', 'globe', 'link', 'magic-wand', 'sparkle',
];

async function searchIcons(query: string): Promise<string[]> {
  if (!query.trim()) {
    return POPULAR_ICONS.map(name => `${ICON_PREFIX}:${name}`);
  }
  try {
    const res = await fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefix=${ICON_PREFIX}&limit=40`
    );
    const data: IconifySearchResult = await res.json();
    return data.icons ?? [];
  } catch {
    return [];
  }
}

/** Build a short Iconify URL — this is what gets saved to the document */
export function getIconUrl(icon: string, color: string, size = 48): string {
  const encodedColor = encodeURIComponent(color);
  return `https://api.iconify.design/${icon}.svg?width=${size}&height=${size}&color=${encodedColor}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IconPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [icons, setIcons] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [hexInput, setHexInput] = useState('#000000');
  const [loading, setLoading] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load popular icons on mount
  useEffect(() => {
    searchIcons('').then(setIcons);
    inputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      const results = await searchIcons(value);
      setIcons(results);
      setLoading(false);
    }, 300);
  }, []);

  const handleSelectIcon = useCallback((icon: string) => {
    setSelectedIcon(icon);
    onSelect(getIconUrl(icon, selectedColor));
  }, [selectedColor, onSelect]);

  const handleColorChange = useCallback((color: string) => {
    setSelectedColor(color);
    setHexInput(color);
    if (selectedIcon) {
      onSelect(getIconUrl(selectedIcon, color));
    }
  }, [selectedIcon, onSelect]);

  const submitHex = useCallback(() => {
    const hex = hexInput.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
      handleColorChange(hex);
    }
  }, [hexInput, handleColorChange]);

  const getDisplayName = (icon: string) => {
    return icon.replace(`${ICON_PREFIX}:`, '').replace(/-/g, ' ');
  };

  return (
    <div
      ref={modalRef}
      className="bg-white rounded-xl shadow-2xl border border-gray-200 w-80 max-h-120 flex flex-col overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-medium text-gray-700">Escolher ícone</span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar ícones..."
            value={query}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 transition-colors"
          />
        </div>
      </div>

      {/* Color palette + hex input */}
      <div className="px-3 pb-2">
        <div className="flex gap-1 items-center flex-wrap">
          {ICON_COLORS.map(c => (
            <button
              key={c.value}
              className={`w-6 h-6 rounded-full transition-all ${
                selectedColor === c.value
                  ? 'ring-2 ring-offset-1 ring-blue-400'
                  : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
              } ${c.value === '#FFFFFF' ? 'border border-gray-300' : ''}`}
              style={{ backgroundColor: c.value }}
              title={c.name}
              onClick={() => handleColorChange(c.value)}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div
            className="w-5 h-5 rounded border border-gray-300 shrink-0"
            style={{ backgroundColor: selectedColor }}
          />
          <input
            type="text"
            placeholder="#000000"
            value={hexInput}
            onChange={e => setHexInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitHex(); }}
            onBlur={submitHex}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 font-mono"
            onMouseDown={e => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Icon grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Buscando...
          </div>
        ) : icons.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Nenhum ícone encontrado
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {icons.map(icon => (
              <button
                key={icon}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 ${
                  selectedIcon === icon ? 'bg-blue-50 ring-2 ring-blue-400' : ''
                }`}
                title={getDisplayName(icon)}
                onClick={() => handleSelectIcon(icon)}
              >
                <img
                  src={getIconUrl(icon, selectedColor, 24)}
                  alt={getDisplayName(icon)}
                  className="w-6 h-6"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
