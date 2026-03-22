'use client';

import React from 'react';
import { WEIGHT_LABELS } from '../../fonts';

interface WeightPickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  availableWeights: number[];
  currentWeight: number;
  currentFont: string;
  onSelect: (weight: number) => void;
}

export const WeightPicker: React.FC<WeightPickerProps> = ({
  menuRef, menuPos, availableWeights, currentWeight, currentFont, onSelect,
}) => (
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
    {availableWeights.map(w => (
      <button
        key={w}
        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
          currentWeight === w ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
        }`}
        onClick={() => onSelect(w)}
      >
        <span style={{ fontFamily: currentFont, fontWeight: w }}>
          {WEIGHT_LABELS[w] || w}
        </span>
        {currentWeight === w && (
          <span className="text-blue-500 text-xs">&#10003;</span>
        )}
      </button>
    ))}
  </div>
);
