'use client';

import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { TextAlign } from '../../types';

interface AlignmentPickerProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  currentAlign: TextAlign;
  onSelect: (align: TextAlign) => void;
}

const ALIGN_OPTIONS: { align: TextAlign; icon: React.ReactNode; label: string }[] = [
  { align: 'left', icon: <AlignLeft size={16} />, label: 'Esquerda' },
  { align: 'center', icon: <AlignCenter size={16} />, label: 'Centro' },
  { align: 'right', icon: <AlignRight size={16} />, label: 'Direita' },
  { align: 'justify', icon: <AlignJustify size={16} />, label: 'Justificar' },
];

export const AlignmentPicker: React.FC<AlignmentPickerProps> = ({
  menuRef, menuPos, currentAlign, onSelect,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-lg p-1 flex items-center gap-0.5"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
  >
    {ALIGN_OPTIONS.map(a => (
      <button
        key={a.align}
        className={`p-1.5 rounded transition-colors ${
          currentAlign === a.align
            ? 'bg-gray-200 text-gray-900'
            : 'hover:bg-gray-100 text-gray-600'
        }`}
        title={a.label}
        onClick={() => onSelect(a.align)}
      >
        {a.icon}
      </button>
    ))}
  </div>
);
