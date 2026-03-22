'use client';

import React from 'react';
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
    className="fixed z-51 bg-white shadow-xl border border-gray-200 rounded-lg p-3 w-55"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
  >
    <div className="text-xs font-medium text-gray-500 mb-1.5">Cor do texto</div>
    <div className="grid grid-cols-5 gap-1 mb-3">
      {TEXT_COLORS.map(c => {
        const isActive = c.value
          ? normalizeColor(currentTextColor) === normalizeColor(c.value)
          : !currentTextColor;
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

    <div className="text-xs font-medium text-gray-500 mb-1.5">Cor de fundo</div>
    <div className="grid grid-cols-5 gap-1">
      {BG_COLORS.map(c => {
        const isActive = c.value
          ? normalizeColor(currentBgColor) === normalizeColor(c.value)
          : !currentBgColor;
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
