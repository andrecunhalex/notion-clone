'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Pencil, Eye, EyeOff, Check, X } from 'lucide-react';
import { SectionItem } from '../hooks/useSectionNav';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionNavPanelProps {
  sections: SectionItem[];
  isOpen: boolean;
  onToggle: () => void;
  onScrollTo: (blockId: string) => void;
  onSetLabel: (blockId: string, label: string) => void;
  onToggleHidden: (blockId: string) => void;
}

// ---------------------------------------------------------------------------
// Desktop: floating card (top-left)
// Mobile: bottom sheet (slides up from bottom)
// ---------------------------------------------------------------------------

export const SectionNavPanel: React.FC<SectionNavPanelProps> = ({
  sections,
  isOpen,
  onToggle,
  onScrollTo,
  onSetLabel,
  onToggleHidden,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = useCallback((section: SectionItem) => {
    setEditingId(section.blockId);
    const isCustom = section.customLabel !== section.originalLabel &&
      !section.originalLabel.startsWith(section.customLabel.replace('...', ''));
    setEditValue(isCustom ? section.customLabel : '');
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      onSetLabel(editingId, editValue.trim());
      setEditingId(null);
      setEditValue('');
    }
  }, [editingId, editValue, onSetLabel]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  // Shared section list content
  const sectionList = (
    <>
      {sections.length === 0 && (
        <p className="text-sm text-gray-400 px-5 py-4 text-center">
          Nenhum título encontrado.
        </p>
      )}
      {sections.map(section => (
        <div
          key={section.blockId}
          className="group flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            {editingId === section.blockId ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  placeholder={section.originalLabel}
                  className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-2 py-0.5 outline-none focus:border-purple-400"
                  maxLength={40}
                />
                <button onClick={commitEdit} className="p-0.5 text-green-500 hover:text-green-700" title="Confirmar">
                  <Check size={14} />
                </button>
                <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600" title="Cancelar">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { onScrollTo(section.blockId); }}
                className="text-left w-full"
              >
                <span className="text-sm font-medium text-gray-800 block truncate">
                  {section.customLabel}
                </span>
                {section.customLabel !== section.originalLabel && (
                  <span className="text-xs text-gray-400 block truncate mt-0.5">
                    {section.originalLabel}
                  </span>
                )}
              </button>
            )}
          </div>

          {editingId !== section.blockId && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 max-md:opacity-100">
              <button
                onClick={() => startEdit(section)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
                title="Editar rótulo"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => onToggleHidden(section.blockId)}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  section.isHidden ? 'text-gray-300' : 'text-gray-400 hover:text-gray-600'
                }`}
                title={section.isHidden ? 'Mostrar na barra' : 'Ocultar da barra'}
              >
                {section.isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* ---- Desktop: floating card ---- */}
      <div
        data-editor-toolbar
        className="hidden md:block fixed left-5 top-20 z-50"
        style={{ maxHeight: 'calc(100vh - 80px)' }}
      >
        <div
          className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 80px)', width: 280 }}
        >
          <button
            onClick={onToggle}
            className="flex items-center justify-between px-5 py-3.5 shrink-0 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-base font-semibold text-gray-800">Seções do documento</span>
            {isOpen ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
          </button>
          {isOpen && (
            <div className="overflow-y-auto border-t border-gray-100 py-1">
              {sectionList}
            </div>
          )}
        </div>
      </div>

      {/* ---- Mobile: bottom sheet ---- */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onToggle}
      />
      {/* Sheet */}
      <div
        data-editor-toolbar
        className={`md:hidden fixed left-0 right-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col">
          {/* Handle + header */}
          <div className="shrink-0 pt-3 pb-2 px-5">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-800">Seções do documento</span>
              <button
                onClick={onToggle}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
          {/* Section list */}
          <div className="overflow-y-auto border-t border-gray-100 py-1 pb-safe">
            {sectionList}
          </div>
        </div>
      </div>
    </>
  );
};
