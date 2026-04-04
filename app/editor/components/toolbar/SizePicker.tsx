'use client';

import React, { useState, useCallback } from 'react';
import { SIZE_PRESETS, DEFAULT_FONT_SIZE } from '../../fonts';

interface SizePickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  currentSize: number;
  onSelect: (size: number) => void;
}

export const SizePicker: React.FC<SizePickerProps> = ({
  menuRef, menuPos, currentSize, onSelect,
}) => {
  const [customValue, setCustomValue] = useState('');

  const submitCustom = useCallback(() => {
    const val = parseInt(customValue, 10);
    if (val >= 8 && val <= 200) {
      onSelect(val);
    }
    setCustomValue('');
  }, [customValue, onSelect]);

  return (
    <div
      ref={menuRef}
      className="fixed z-51 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-40 max-h-70 overflow-y-auto"
      style={{
        left: menuPos?.left ?? 0,
        top: menuPos?.top ?? 0,
        visibility: menuPos ? 'visible' : 'hidden',
      }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="px-3 py-1.5 border-b border-gray-100">
        <input
          type="number"
          min={8}
          max={200}
          placeholder="Tamanho..."
          value={customValue}
          onChange={e => setCustomValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitCustom(); }}
          onBlur={() => setCustomValue('')}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
          onMouseDown={e => e.stopPropagation()}
        />
      </div>

      {SIZE_PRESETS.map(s => (
        <button
          key={s}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
            currentSize === s ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
          }`}
          onClick={() => onSelect(s)}
        >
          <span>{s === DEFAULT_FONT_SIZE ? `${s} (padrão)` : s}</span>
          {currentSize === s && (
            <span className="text-blue-500 text-xs">&#10003;</span>
          )}
        </button>
      ))}
    </div>
  );
};
