'use client';

// ---------------------------------------------------------------------------
// DesignBlockPicker — root modal for the design library
// ---------------------------------------------------------------------------
// Owns the cross-cutting state (tab, query, view, selection, mobile step)
// and delegates the actual UI of each tab to dedicated components in this
// folder. Inline create/edit lives in the right pane (no second modal).
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutTemplate, ListOrdered, Plus, Search, X } from 'lucide-react';
import { useDesignLibrary, useLibrarySnapshot, matchesTemplate, matchesClause, normalize } from '../../../designLibrary';
import type { LibraryClause, LibraryTemplate } from '../../../designLibrary';
import { BlocksTab } from './BlocksTab';
import { ClausesTab } from './ClausesTab';
import { TemplateEditor } from './TemplateEditor';
import { UndoToast } from './UndoToast';
import { isEditableFocused } from './helpers';
import type { PickerResult, Tab, View } from './types';

export type { PickerResult } from './types';

interface DesignBlockPickerProps {
  currentDocumentId: string;
  /** Optional — if missing, the modal is in "manage" mode (no insert action) */
  onPick?: (result: PickerResult) => void;
  onClose: () => void;
  /** Forwarded to DesignBlock for inline image swaps in the clause editor */
  uploadImage?: (file: File) => Promise<string | null>;
}

/** A delete that has already been applied to the DB but can still be undone
 *  for `durationMs`. We snapshot the resource here so we can restore it via
 *  createTemplate/createClause if the user clicks "Desfazer". */
type PendingUndo =
  | { kind: 'template'; snapshot: import('../../../designLibrary').LibraryTemplate }
  | { kind: 'clause'; snapshot: import('../../../designLibrary').LibraryClause };

export const DesignBlockPicker: React.FC<DesignBlockPickerProps> = ({
  currentDocumentId, onPick, onClose, uploadImage,
}) => {
  const library = useDesignLibrary();
  const snapshot = useLibrarySnapshot();

  const [tab, setTab] = useState<Tab>('blocks');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ mode: 'list' });
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  /** Mobile-only master-detail step tracker for the clauses tab. */
  const [clausesMobileView, setClausesMobileView] = useState<'list' | 'editor'>('list');
  /** Most recent delete that can still be undone. Null = no pending undo. */
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);

  // --- Search / sectioning -----------------------------------------------
  const templatesById = useMemo(() => {
    const m = new Map<string, LibraryTemplate>();
    for (const t of snapshot.templates) m.set(t.id, t);
    return m;
  }, [snapshot.templates]);

  const { docBlocks, workspaceBlocks } = useMemo(() => {
    const q = normalize(query.trim());
    const all = snapshot.templates.filter(t => matchesTemplate(t, q));
    return {
      docBlocks: all.filter(t => t.documentId === currentDocumentId),
      workspaceBlocks: all.filter(t => t.documentId !== currentDocumentId),
    };
  }, [snapshot.templates, query, currentDocumentId]);

  const { docClauses, workspaceClauses } = useMemo(() => {
    const q = normalize(query.trim());
    const all = snapshot.clauses.filter(c => matchesClause(c, templatesById, q));
    return {
      docClauses: all.filter(c => c.documentId === currentDocumentId),
      workspaceClauses: all.filter(c => c.documentId !== currentDocumentId),
    };
  }, [snapshot.clauses, query, currentDocumentId, templatesById]);

  const flatBlocks = useMemo(() => [...docBlocks, ...workspaceBlocks], [docBlocks, workspaceBlocks]);
  const flatClauses = useMemo(() => [...docClauses, ...workspaceClauses], [docClauses, workspaceClauses]);

  // Effective selection — falls back to the first visible item when stored
  // id has been filtered out, without an extra setState pass.
  const effectiveFocusedBlockId = useMemo(() => {
    if (focusedBlockId && flatBlocks.some(b => b.id === focusedBlockId)) return focusedBlockId;
    return flatBlocks[0]?.id ?? null;
  }, [focusedBlockId, flatBlocks]);

  const effectiveSelectedClauseId = useMemo(() => {
    if (selectedClauseId && flatClauses.some(c => c.id === selectedClauseId)) return selectedClauseId;
    return flatClauses[0]?.id ?? null;
  }, [selectedClauseId, flatClauses]);

  const selectedClause = useMemo(
    () => flatClauses.find(c => c.id === effectiveSelectedClauseId) ?? null,
    [flatClauses, effectiveSelectedClauseId],
  );

  // --- Refs / scroll ------------------------------------------------------
  const blockScrollRef = useRef<HTMLDivElement>(null);
  const clauseListRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Don't auto-focus the search input on open — that would steal arrow-key
  // navigation from the list. The user can still click into the input or
  // start typing (the global keyboard handler doesn't trap text characters
  // unless the user is focused on it).

  const scrollFocusIntoView = useCallback((container: HTMLDivElement | null) => {
    requestAnimationFrame(() => {
      const el = container?.querySelector<HTMLElement>('[data-list-item][data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  useEffect(() => { scrollFocusIntoView(blockScrollRef.current); }, [effectiveFocusedBlockId, scrollFocusIntoView]);
  useEffect(() => { scrollFocusIntoView(clauseListRef.current); }, [effectiveSelectedClauseId, scrollFocusIntoView]);

  // --- Event isolation ---------------------------------------------------
  // NotionEditor attaches window-level keydown / paste listeners. Prevent
  // them from firing for events originating in inputs / contentEditable
  // inside this modal so native paste/undo/typing work.
  useEffect(() => {
    const node = modalRef.current;
    if (!node) return;
    const isolate = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        e.stopPropagation();
      }
    };
    const events = ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut'] as const;
    events.forEach(ev => node.addEventListener(ev, isolate));
    return () => events.forEach(ev => node.removeEventListener(ev, isolate));
  }, []);

  // --- Keyboard nav (list mode only) -------------------------------------
  useEffect(() => {
    if (view.mode !== 'list') return;
    if (pendingUndo) return; // undo toast owns Esc
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      const editing = isEditableFocused();
      const activeIsSearch = document.activeElement === searchRef.current;
      if (e.key === 'Tab' && !editing) {
        e.preventDefault();
        setTab(prev => prev === 'blocks' ? 'clauses' : 'blocks');
        return;
      }
      if (editing && !activeIsSearch) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        if (tab === 'blocks') {
          const idx = flatBlocks.findIndex(b => b.id === effectiveFocusedBlockId);
          const next = Math.max(0, Math.min(flatBlocks.length - 1, (idx < 0 ? 0 : idx) + delta));
          setFocusedBlockId(flatBlocks[next]?.id ?? null);
        } else {
          const idx = flatClauses.findIndex(c => c.id === effectiveSelectedClauseId);
          const next = Math.max(0, Math.min(flatClauses.length - 1, (idx < 0 ? 0 : idx) + delta));
          setSelectedClauseId(flatClauses[next]?.id ?? null);
        }
      } else if (e.key === 'Enter' && onPick && !editing) {
        e.preventDefault();
        if (tab === 'blocks') {
          const b = flatBlocks.find(x => x.id === effectiveFocusedBlockId) ?? flatBlocks[0];
          if (b) onPick({ kind: 'template', template: b });
        } else if (selectedClause) {
          onPick({ kind: 'clause', clause: selectedClause });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.mode, tab, flatBlocks, flatClauses, effectiveFocusedBlockId, effectiveSelectedClauseId, selectedClause, onPick, onClose, pendingUndo]);

  // --- CRUD handlers ------------------------------------------------------
  const openNew = useCallback(async () => {
    if (tab === 'blocks') {
      setView({ mode: 'edit-template' });
    } else {
      const created = await library.createClause({ name: 'Nova cláusula', items: [] });
      setSelectedClauseId(created.id);
      setClausesMobileView('editor');
    }
  }, [tab, library]);

  const selectClause = useCallback((id: string) => {
    setSelectedClauseId(id);
    setClausesMobileView('editor');
  }, []);

  const editTemplate = useCallback((tpl: LibraryTemplate) => {
    setView({ mode: 'edit-template', template: tpl });
  }, []);

  // Optimistic delete + undo toast. We delete immediately and snapshot the
  // resource so the user can restore it within 5s. The realtime channel
  // will propagate the delete to other clients; if the user clicks Undo,
  // we re-create the resource (with the same id) and the realtime channel
  // propagates the re-creation. Race conditions across users editing the
  // same resource simultaneously are unlikely for a design library.
  const requestDeleteTemplate = useCallback(async (tpl: LibraryTemplate) => {
    try {
      await library.deleteTemplate(tpl.id);
      setPendingUndo({ kind: 'template', snapshot: tpl });
    } catch (err) {
      console.error('[design library] delete template failed', err);
    }
  }, [library]);

  const requestDeleteClause = useCallback(async (clause: LibraryClause) => {
    try {
      await library.deleteClause(clause.id);
      setPendingUndo({ kind: 'clause', snapshot: clause });
    } catch (err) {
      console.error('[design library] delete clause failed', err);
    }
  }, [library]);

  const undoDelete = useCallback(async () => {
    if (!pendingUndo) return;
    const undo = pendingUndo;
    setPendingUndo(null);
    try {
      if (undo.kind === 'template') {
        await library.createTemplate({
          id: undo.snapshot.id,
          name: undo.snapshot.name,
          html: undo.snapshot.html,
          defaults: undo.snapshot.defaults,
          autonumber: undo.snapshot.autonumber,
        });
      } else {
        await library.createClause({
          id: undo.snapshot.id,
          name: undo.snapshot.name,
          items: undo.snapshot.items,
        });
      }
    } catch (err) {
      console.error('[design library] undo failed', err);
    }
  }, [pendingUndo, library]);

  const pickBlock = useCallback((tpl: LibraryTemplate) => {
    onPick?.({ kind: 'template', template: tpl });
  }, [onPick]);

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  const modal = (
    <div
      ref={modalRef}
      data-design-picker
      className="fixed inset-0 z-1000 flex sm:items-center sm:justify-center sm:p-4 bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="bg-white shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden rounded-none sm:rounded-2xl h-full sm:h-180 sm:max-h-[90vh]"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutTemplate size={18} className="text-purple-500 shrink-0" />
            <h3 className="text-base font-semibold text-gray-800 truncate">Biblioteca de Design</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Tabs + search + new */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-gray-100 shrink-0">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => { setTab('blocks'); setView({ mode: 'list' }); }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'blocks' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutTemplate size={14} /> Blocos
            </button>
            <button
              onClick={() => { setTab('clauses'); setView({ mode: 'list' }); }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'clauses' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ListOrdered size={14} /> Cláusulas
            </button>
          </div>
          <div className="order-3 sm:order-0 basis-full sm:basis-auto flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou conteúdo..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0 ml-auto sm:ml-0"
          >
            <Plus size={12} /> Novo
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {view.mode === 'edit-template' ? (
            <TemplateEditor
              existing={view.template}
              onCancel={() => setView({ mode: 'list' })}
              onSave={async (input) => {
                if (view.template) await library.updateTemplate(view.template.id, input);
                else await library.createTemplate(input);
                setView({ mode: 'list' });
              }}
            />
          ) : tab === 'blocks' ? (
            <BlocksTab
              scrollRef={blockScrollRef}
              docBlocks={docBlocks}
              workspaceBlocks={workspaceBlocks}
              query={query}
              focusedId={effectiveFocusedBlockId}
              onFocus={setFocusedBlockId}
              canInsert={!!onPick}
              onPick={pickBlock}
              onEdit={editTemplate}
              onDelete={requestDeleteTemplate}
              loading={!snapshot.bootstrapped}
            />
          ) : (
            <ClausesTab
              listRef={clauseListRef}
              docClauses={docClauses}
              workspaceClauses={workspaceClauses}
              selectedClauseId={effectiveSelectedClauseId}
              onSelect={selectClause}
              selectedClause={selectedClause}
              availableTemplates={snapshot.templates}
              canInsert={!!onPick}
              onInsert={(c) => onPick?.({ kind: 'clause', clause: c })}
              onDelete={requestDeleteClause}
              uploadImage={uploadImage}
              mobileView={clausesMobileView}
              onMobileBack={() => setClausesMobileView('list')}
              loading={!snapshot.bootstrapped}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 shrink-0 bg-gray-50 text-[11px] text-gray-500">
          <div className="flex gap-3">
            <span><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">↑↓</kbd> navegar</span>
            {onPick && <span><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">Enter</kbd> inserir</span>}
            <span><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">Tab</kbd> trocar aba</span>
          </div>
          <span><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">Esc</kbd> fechar</span>
        </div>
      </div>

    </div>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      {pendingUndo && (
        <UndoToast
          message={`"${pendingUndo.snapshot.name}" excluído`}
          onUndo={undoDelete}
          onDismiss={() => setPendingUndo(null)}
        />
      )}
    </>
  );
};
