'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, RotateCw, FileText, Scroll, ChevronDown } from 'lucide-react';
import { ViewMode } from '../types';
import { useFonts } from './FontLoader';

interface ToolbarProps {
  title?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  documentFont: string;
  onDocumentFontChange: (family: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title = 'MiniNotion',
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onToggleViewMode,
  documentFont,
  onDocumentFontChange,
}) => {
  const { allFonts, customFonts } = useFonts();
  const [fontOpen, setFontOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!fontOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setFontOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fontOpen]);

  const currentFontName = allFonts.find(f => f.family === documentFont)?.name || 'Padrão';

  return (
    <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-30 border-b border-gray-100 px-8 py-3 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="font-semibold text-gray-800">{title}</span>
      </div>
      <div className="flex gap-2 text-sm text-gray-500 items-center">
        {/* Document font selector */}
        <div ref={dropdownRef} className="relative">
          <button
            className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs transition-colors ${fontOpen ? 'bg-gray-100' : ''}`}
            onClick={() => setFontOpen(!fontOpen)}
            title="Fonte do documento"
          >
            <span className="max-w-[100px] truncate" style={{ fontFamily: documentFont || undefined }}>
              {currentFontName}
            </span>
            <ChevronDown size={12} />
          </button>

          {fontOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-[200px] max-h-[300px] overflow-y-auto z-50">
              {allFonts.filter(f => !f.isCustom).length > 0 && (
                <>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-3 py-1">
                    Fontes do sistema
                  </div>
                  {allFonts.filter(f => !f.isCustom).map(font => (
                    <button
                      key={font.family}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                        documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                      }`}
                      onClick={() => {
                        onDocumentFontChange(font.family);
                        setFontOpen(false);
                      }}
                    >
                      <span style={{ fontFamily: font.family }}>{font.name}</span>
                      {documentFont === font.family && (
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
                        documentFont === font.family ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                      }`}
                      onClick={() => {
                        onDocumentFontChange(font.family);
                        setFontOpen(false);
                      }}
                    >
                      <span style={{ fontFamily: font.family }}>{font.name}</span>
                      {documentFont === font.family && (
                        <span className="text-blue-500 text-xs">&#10003;</span>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 mx-1"></div>

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
