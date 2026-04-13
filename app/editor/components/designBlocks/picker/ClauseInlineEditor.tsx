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

type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'error';

/** Backoff delays in ms — each retry waits longer than the previous, capped
 *  at 30s. Resets to the first delay after a successful save. */
const RETRY_BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000] as const;

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
  const [name, setNameRaw] = useState(clause.name);
  const [items, setItemsRaw] = useState<ClauseItem[]>(clause.items);
  const [pickingBlock, setPickingBlock] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // True only after the user has actually mutated something in this
  // component instance. Selecting a clause / mounting / Strict-Mode
  // double-effect will never set it. Without this guard the auto-save
  // effect runs on mount because Strict Mode flips the "first run" flag.
  const userEditedRef = useRef(false);

  // Mutation wrappers — every place that changes name/items goes through
  // these. Any setter that doesn't go through here won't trigger a save.
  const setName = useCallback((v: string) => {
    userEditedRef.current = true;
    setNameRaw(v);
  }, []);
  const setItems = useCallback((updater: (prev: ClauseItem[]) => ClauseItem[]) => {
    userEditedRef.current = true;
    setItemsRaw(updater);
  }, []);

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

  // --- Auto-save with retry/backoff --------------------------------------
  // Strategy:
  //   1. User edits → debounce 500ms → attempt save.
  //   2. On success: state → 'saved' (auto-clears after 2s), reset retry index.
  //   3. On failure: state → 'retrying', schedule next attempt with backoff.
  //   4. Subsequent edits during retry restart the debounce + cancel the
  //      pending retry so we save the freshest snapshot, not the stale one.
  //
  // The save closure captures `name` and `items` from React state, so each
  // attempt naturally retries with the latest values queued at the time of
  // the attempt — no separate "queue" structure needed.
  const retryIndexRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userEditedRef.current) return;

    // Cancel any in-flight scheduled attempt — we'll reschedule with the
    // freshest snapshot below.
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    // Reset retry index on every fresh user edit so backoff doesn't carry
    // over from a previous failure.
    retryIndexRef.current = 0;

    let cancelled = false;

    const attempt = async () => {
      if (cancelled) return;
      setSaveState('saving');
      try {
        await library.updateClause(clause.id, { name, items });
        if (cancelled) return;
        setSaveState('saved');
        retryIndexRef.current = 0;
      } catch (err) {
        if (cancelled) return;
        console.error('[clause autosave] failed, will retry', err);
        const delay = RETRY_BACKOFF[Math.min(retryIndexRef.current, RETRY_BACKOFF.length - 1)];
        retryIndexRef.current += 1;
        setSaveState('retrying');
        pendingTimerRef.current = setTimeout(attempt, delay);
      }
    };

    pendingTimerRef.current = setTimeout(attempt, 500);

    return () => {
      cancelled = true;
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [name, items, clause.id, library]);

  // --- Item mutations ---------------------------------------------------
  const updateItemValues = useCallback((itemId: string, newValues: Record<string, string>) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, values: { ...it.values, ...newValues } } : it));
  }, [setItems]);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(it => it.id !== itemId));
  }, [setItems]);

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
  }, [setItems]);

  const addBlock = useCallback((tpl: LibraryTemplate) => {
    setItems(prev => [...prev, { id: generateItemId(), templateId: tpl.id, values: { ...tpl.defaults } }]);
    setPickingBlock(false);
  }, [setItems]);

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
  if (state === 'retrying') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-600 shrink-0" aria-live="polite" title="Falha ao salvar — tentando novamente">
        <LoaderCircle size={11} className="animate-spin" /> Tentando novamente...
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
