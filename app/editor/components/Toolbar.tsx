'use client';

import React from 'react';
import { RotateCcw, RotateCw, FileText, Scroll } from 'lucide-react';
import { ViewMode } from '../types';

interface ToolbarProps {
  title?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title = 'MiniNotion',
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onToggleViewMode
}) => {
  return (
    <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-30 border-b border-gray-100 px-8 py-3 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="font-semibold text-gray-800">{title}</span>
      </div>
      <div className="flex gap-2 text-sm text-gray-500">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
          title="Desfazer"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
          title="Refazer"
        >
          <RotateCw size={16} />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-2"></div>
        <button
          onClick={onToggleViewMode}
          className="p-1 hover:bg-gray-100 rounded text-gray-500 flex items-center gap-2"
          title={viewMode === 'continuous' ? 'Mudar para Paginado' : 'Mudar para Contínuo'}
        >
          {viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
        </button>
      </div>
    </div>
  );
};
