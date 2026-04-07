'use client';

import React from 'react';
import { X } from 'lucide-react';
import { TEXT_COLORS, BG_COLORS, normalizeColor } from '../../constants';

interface ColorPickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  currentTextColor: string;
  currentBgColor: string;
  onTextColor: (color: string) => void;
  onBgColor: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  menuRef, menuPos, currentTextColor, currentBgColor, onTextColor, onBgColor,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-lg p-3 w-55"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
  >
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-medium text-gray-500">Cor do texto</span>
      {currentTextColor && (
        <button
          className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          title="Limpar cor do texto"
          onClick={() => onTextColor('')}
        >
          <X size={10} />
          <span>Limpar</span>
        </button>
      )}
    </div>
    <div className="grid grid-cols-5 gap-1 mb-3">
      {TEXT_COLORS.map(c => {
        const isActive = normalizeColor(currentTextColor) === normalizeColor(c.value);
        return (
          <button
            key={c.name}
            className={`w-9 h-9 rounded-md flex items-center justify-center hover:bg-gray-50 border transition-colors ${
              isActive ? 'border-gray-400 bg-gray-100' : 'border-transparent hover:border-gray-300'
            }`}
            title={c.name}
            onClick={() => onTextColor(c.value)}
          >
            <span className="text-sm font-bold" style={{ color: c.preview }}>A</span>
          </button>
        );
      })}
    </div>

    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-medium text-gray-500">Cor de fundo</span>
      {currentBgColor && (
        <button
          className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          title="Limpar cor de fundo"
          onClick={() => onBgColor('')}
        >
          <X size={10} />
          <span>Limpar</span>
        </button>
      )}
    </div>
    <div className="grid grid-cols-5 gap-1">
      {BG_COLORS.map(c => {
        const isActive = normalizeColor(currentBgColor) === normalizeColor(c.value);
        return (
          <button
            key={c.name}
            className={`w-9 h-9 rounded-md transition-all ${
              isActive
                ? 'ring-2 ring-gray-400'
                : `hover:ring-2 hover:ring-gray-300 ${c.border ? 'ring-1 ring-gray-200' : ''}`
            }`}
            style={{ backgroundColor: c.preview }}
            title={c.name}
            onClick={() => onBgColor(c.value)}
          />
        );
      })}
    </div>
  </div>
);
