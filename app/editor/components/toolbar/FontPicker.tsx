'use client';

import React from 'react';
import { FontEntry } from '../../fonts';

interface FontPickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  allFonts: FontEntry[];
  customFonts: FontEntry[];
  currentFont: string;
  onSelect: (font: FontEntry) => void;
}

export const FontPicker: React.FC<FontPickerProps> = ({
  menuRef, menuPos, allFonts, customFonts, currentFont, onSelect,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-55 max-h-70 overflow-y-auto"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
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
            onClick={() => onSelect(font)}
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
            onClick={() => onSelect(font)}
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
);
