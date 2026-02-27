'use client';

import React, { useState, useEffect } from 'react';
import { Type, Heading1, Heading2, LucideIcon } from 'lucide-react';
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
}

const MENU_OPTIONS: MenuOption[] = [
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'h1', label: 'Título 1', icon: Heading1 },
  { type: 'h2', label: 'Título 2', icon: Heading2 }
];

export const SlashMenu: React.FC<SlashMenuProps> = ({ x, y, close, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Navegação via teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev + 1) % MENU_OPTIONS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => (prev - 1 + MENU_OPTIONS.length) % MENU_OPTIONS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(MENU_OPTIONS[selectedIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedIndex, close, onSelect]);

  useEffect(() => {
    const handle = () => close();
    window.addEventListener('click', handle);
    return () => window.removeEventListener('click', handle);
  }, [close]);

  return (
    <div
      className="fixed bg-white shadow-xl border border-gray-200 rounded-lg p-1 w-48 z-50 flex flex-col"
      style={{ left: x, top: y }}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">
        Blocos Básicos
      </div>
      {MENU_OPTIONS.map((opt, i) => (
        <button
          key={opt.type}
          onClick={() => onSelect(opt.type)}
          onMouseEnter={() => setSelectedIndex(i)}
          className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded text-left transition-colors ${
            i === selectedIndex
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <opt.icon size={16} />
          {opt.label}
        </button>
      ))}
    </div>
  );
};

// Exporta as opções para uso externo (ex: adicionar novos tipos)
export { MENU_OPTIONS };
