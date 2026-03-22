'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { BlockData } from '../../types';

interface RefPickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  blocks: BlockData[];
  refSearch: string;
  onSearchChange: (search: string) => void;
  onSelect: (blockId: string) => void;
  onClose: () => void;
}

export const RefPicker: React.FC<RefPickerProps> = ({
  menuRef, menuPos, inputRef, blocks, refSearch, onSearchChange, onSelect, onClose,
}) => (
  <div
    ref={menuRef}
    className="fixed z-51 bg-white shadow-xl border border-gray-200 rounded-lg p-2 w-70 max-h-75 flex flex-col"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => { e.stopPropagation(); }}
  >
    <div className="text-xs font-medium text-gray-500 mb-2">Referência interna</div>
    <div className="relative mb-2">
      <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        className="w-full border border-gray-300 rounded px-2 py-1.5 pl-7 text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
        placeholder="Buscar bloco..."
        value={refSearch}
        onChange={e => onSearchChange(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
        onPaste={e => e.stopPropagation()}
      />
    </div>
    <div className="overflow-y-auto flex-1">
      {blocks
        .filter(b => {
          if (b.type === 'divider' || b.type === 'table' || b.type === 'image') return false;
          if (!b.content || b.content === '<br>') return false;
          const text = b.content.replace(/<[^>]*>/g, '').trim();
          if (!text) return false;
          if (refSearch) return text.toLowerCase().includes(refSearch.toLowerCase());
          return true;
        })
        .map(b => {
          const text = b.content.replace(/<[^>]*>/g, '').trim();
          const label = text.length > 50 ? text.slice(0, 50) + '...' : text;
          const typeLabel = b.type === 'h1' ? 'H1' : b.type === 'h2' ? 'H2' : b.type === 'h3' ? 'H3' : '';
          return (
            <button
              key={b.id}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-purple-50 transition-colors flex items-center gap-2"
              onClick={() => onSelect(b.id)}
            >
              {typeLabel && (
                <span className="text-[10px] font-bold text-purple-500 bg-purple-100 px-1 rounded shrink-0">
                  {typeLabel}
                </span>
              )}
              <span className="truncate text-gray-700">{label}</span>
            </button>
          );
        })}
    </div>
  </div>
);
