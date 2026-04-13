'use client';

// ---------------------------------------------------------------------------
// ClauseInlineEditor — reuses the real DesignBlock component for inline edits
// ---------------------------------------------------------------------------
// Editing a clause is a stripped-down version of the document editor: the
// user sees each block rendered with its actual contentEditable / image-swap
// affordances, and any change auto-saves to the library after 500ms.
//
// Save state is surfaced in the toolbar (idle / saving / saved / error) so
// the user knows their edits were persisted without needing to look at the
// network tab.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useDesignLibrary } from '../../../designLibrary';
import type { LibraryClause, LibraryTemplate, ClauseItem } from '../../../designLibrary';
import { DesignBlock } from '../DesignBlock';
import { TemplatePreview } from '../TemplatePreview';
import type { BlockData } from '../../../types';
import { generateItemId } from './helpers';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ClauseInlineEditorProps {
  clause: LibraryClause;
  availableTemplates: LibraryTemplate[];
  canInsert: boolean;
  onInsert: () => void;
  onDelete: () => void;
  uploadImage?: (file: File) => Promise<string | null>;
  onMobileBack: () => void;
}

export const ClauseInlineEditor: React.FC<ClauseInlineEditorProps> = ({
  clause, availableTemplates, canInsert, onInsert, onDelete, uploadImage, onMobileBack,
}) => {
  const library = useDesignLibrary();
  const [name, setName] = useState(clause.name);
  const [items, setItems] = useState<ClauseItem[]>(clause.items);
  const [pickingBlock, setPickingBlock] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Skip the very first auto-save effect run — mount values match props,
  // there's nothing to persist.
  const isFirstRun = useRef(true);

  // Hide the "Salvo" indicator after 2s.
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveState !== 'saved') return;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [saveState]);

  // Debounced auto-save: fires 500ms after the user stops typing. Save state
  // walks: idle → saving → saved (or error).
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSaveState('saving');
      try {
        await library.updateClause(clause.id, { name, items });
        setSaveState('saved');
      } catch (err) {
        console.error('[clause autosave] failed', err);
        setSaveState('error');
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [name, items, clause.id, library]);

  // --- Item mutations ---------------------------------------------------
  const updateItemValues = useCallback((itemId: string, newValues: Record<string, string>) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, values: { ...it.values, ...newValues } } : it));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(it => it.id !== itemId));
  }, []);

  const moveItem = useCallback((itemId: string, direction: -1 | 1) => {
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === itemId);
      if (idx < 0) return prev;
      const next = idx + direction;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }, []);

  const addBlock = useCallback((tpl: LibraryTemplate) => {
    setItems(prev => [...prev, { id: generateItemId(), templateId: tpl.id, values: { ...tpl.defaults } }]);
    setPickingBlock(false);
  }, []);

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 sm:px-5 py-3 border-b border-gray-100 shrink-0">
        {/* Back button — only on mobile (list/editor navigation) */}
        <button
          onClick={onMobileBack}
          className="md:hidden p-1.5 -ml-1 rounded-md hover:bg-gray-100 text-gray-500 shrink-0"
          title="Voltar para a lista"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nome da cláusula"
          className="flex-1 min-w-0 text-sm font-semibold text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-purple-300 focus:outline-none px-1 py-1"
        />
        <SaveStateBadge state={saveState} />
        {canInsert && (
          <button
            onClick={onInsert}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0"
          >
            Inserir
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-red-500 hover:bg-red-50 transition-colors shrink-0"
          title="Excluir cláusula"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Mini-page body.
          `relative` is required so the swap popover / icon picker rendered
          by DesignBlock (position: absolute, portalled into this scroll
          container) anchors here instead of climbing to the fixed backdrop. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto bg-gray-100 py-4 sm:py-6 px-3 sm:px-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 px-5 sm:px-10 py-6 sm:py-8">
          {items.length === 0 ? (
            <div className="text-center text-sm text-gray-400 italic py-8">
              Cláusula vazia. Adicione blocos abaixo.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const tpl = availableTemplates.find(t => t.id === item.templateId);
                if (!tpl) {
                  return (
                    <div key={item.id} className="text-xs text-red-600 italic border border-red-200 bg-red-50 rounded p-2">
                      Bloco ausente ({item.templateId})
                      <button onClick={() => removeItem(item.id)} className="ml-2 underline">remover</button>
                    </div>
                  );
                }
                return (
                  <ClauseItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    total={items.length}
                    uploadImage={uploadImage}
                    onChangeValues={values => updateItemValues(item.id, values)}
                    onMoveUp={() => moveItem(item.id, -1)}
                    onMoveDown={() => moveItem(item.id, 1)}
                    onRemove={() => removeItem(item.id)}
                  />
                );
              })}
            </div>
          )}

          {/* Add block */}
          <div className="mt-4">
            {pickingBlock ? (
              <BlockPickerInline
                availableTemplates={availableTemplates}
                onCancel={() => setPickingBlock(false)}
                onPick={addBlock}
              />
            ) : (
              <button
                onClick={() => setPickingBlock(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 rounded-lg text-xs text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors"
              >
                <Plus size={12} /> Adicionar bloco
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Save state pill
// ---------------------------------------------------------------------------

const SaveStateBadge: React.FC<{ state: SaveState }> = ({ state }) => {
  if (state === 'idle') return null;

  if (state === 'saving') {
    return (
      <span className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 shrink-0" aria-live="polite">
        <LoaderCircle size={11} className="animate-spin" /> Salvando...
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-600 shrink-0" aria-live="polite">
        <Check size={11} /> Salvo
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-red-600 shrink-0" aria-live="polite" title="Falha ao salvar — verifique sua conexão">
      <CircleAlert size={11} /> Erro
    </span>
  );
};

// ---------------------------------------------------------------------------
// Inline picker for adding a block to a clause
// ---------------------------------------------------------------------------

const BlockPickerInline: React.FC<{
  availableTemplates: LibraryTemplate[];
  onCancel: () => void;
  onPick: (tpl: LibraryTemplate) => void;
}> = ({ availableTemplates, onCancel, onPick }) => (
  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-semibold text-gray-500">Escolha um bloco</span>
      <button onClick={onCancel} className="text-[11px] text-gray-400 hover:text-gray-600">cancelar</button>
    </div>
    {availableTemplates.length === 0 ? (
      <div className="text-xs text-gray-400 italic">Nenhum bloco disponível. Crie um bloco primeiro na aba Blocos.</div>
    ) : (
      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {availableTemplates.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => onPick(tpl)}
            className="text-left border border-gray-200 rounded-lg p-2 bg-white hover:border-purple-300 hover:bg-purple-50/30 transition-colors"
          >
            <div className="text-[11px] font-medium text-gray-700 truncate mb-1">{tpl.name}</div>
            <div className="rounded bg-white border border-gray-100 p-1 overflow-hidden" style={{ maxHeight: 50 }}>
              <TemplatePreview
                template={tpl}
                style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%' }}
              />
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// One row in the clause editor — wraps a real DesignBlock with item controls
// ---------------------------------------------------------------------------

interface ClauseItemRowProps {
  item: ClauseItem;
  index: number;
  total: number;
  uploadImage?: (file: File) => Promise<string | null>;
  onChangeValues: (values: Record<string, string>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const ClauseItemRow: React.FC<ClauseItemRowProps> = ({
  item, index, total, uploadImage, onChangeValues, onMoveUp, onMoveDown, onRemove,
}) => {
  // Synthesize a BlockData so we can reuse the real DesignBlock component.
  // Note: the memo is keyed on item identity, not item.values — values change
  // on every keystroke and would defeat the cache. Instead we let the new
  // object come through and rely on DesignBlock's internal diffing to keep
  // the DOM stable.
  const syntheticBlock = useMemo<BlockData>(() => ({
    id: item.id,
    type: 'design_block',
    content: '',
    designBlockData: { templateId: item.templateId, values: item.values },
  }), [item]);

  const updateBlock = useCallback((_blockId: string, patch: Partial<BlockData>) => {
    if (patch.designBlockData?.values) {
      onChangeValues(patch.designBlockData.values);
    }
  }, [onChangeValues]);

  return (
    <div className="group relative">
      {/* Desktop controls — vertical stack to the left, hover-revealed */}
      <div className="
        hidden md:flex absolute -left-8 top-1 flex-col gap-0.5
        opacity-0 group-hover:opacity-100 transition-opacity
      ">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para cima"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para baixo"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
          title="Remover bloco"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Mobile controls — top-right overlay, always visible */}
      <div className="md:hidden absolute right-1 top-1 z-10 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-200 p-0.5">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 rounded text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para cima"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1 rounded text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para baixo"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded text-red-500"
          title="Remover bloco"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <DesignBlock
        block={syntheticBlock}
        updateBlock={updateBlock}
        uploadImage={uploadImage}
      />
    </div>
  );
};
