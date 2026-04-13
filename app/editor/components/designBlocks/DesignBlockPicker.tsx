'use client';

// ---------------------------------------------------------------------------
// DesignBlockPicker — unified library modal (browse + CRUD, inline)
// ---------------------------------------------------------------------------
// Two tabs with different layouts:
//
//   Blocos:   single scroll area, cards stacked vertically. Click a card to
//             insert it; edit/delete icons live in the card's corner.
//
//   Cláusulas: sidebar of clause titles on the left + inline "mini editor"
//              on the right. The editor reuses DesignBlock so the user can
//              edit text / swap images directly like in the real document.
//              All edits auto-save (debounced) to the library.
//
// "+ Novo":
//   - Blocos: opens an inline JSON editor (swapped into the main area)
//   - Cláusulas: creates an empty clause immediately and selects it
//
// onPick is optional — when absent the modal is in "manage" mode (no insert
// on click), used by the Settings panel.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, LayoutTemplate, ListOrdered, Plus, Save, Trash2, Pencil, ChevronUp, ChevronDown, FileText, Library, ArrowLeft } from 'lucide-react';
import { useDesignLibrary, useLibrarySnapshot } from '../../designLibrary';
import type {
  LibraryTemplate,
  LibraryClause,
  ClauseItem,
  TemplateInput,
} from '../../designLibrary';
import { buildPreviewHtml } from './previewHtml';
import { DesignBlock } from './DesignBlock';
import type { BlockData } from '../../types';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

export type PickerResult =
  | { kind: 'template'; template: LibraryTemplate }
  | { kind: 'clause'; clause: LibraryClause };

interface DesignBlockPickerProps {
  currentDocumentId: string;
  /** Optional — if missing, the modal is in "manage" mode (no insert action) */
  onPick?: (result: PickerResult) => void;
  onClose: () => void;
  /** Forwarded to DesignBlock for image swap uploads */
  uploadImage?: (file: File) => Promise<string | null>;
}

type Tab = 'blocks' | 'clauses';

/** Right-pane view state. Clause editing is always inline in the detail
 *  panel; only template create/edit uses a dedicated view. */
type View = { mode: 'list' } | { mode: 'edit-template'; template?: LibraryTemplate };

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function templateSearchBlob(t: LibraryTemplate): string {
  const valueText = Object.values(t.defaults || {}).map(htmlToText).join(' ');
  return normalize(`${t.name} ${valueText}`);
}

function clauseSearchBlob(c: LibraryClause, templatesById: Map<string, LibraryTemplate>): string {
  const parts: string[] = [c.name];
  for (const item of c.items) {
    const tpl = templatesById.get(item.templateId);
    if (tpl) parts.push(tpl.name);
    for (const v of Object.values(item.values || {})) parts.push(htmlToText(v));
  }
  return normalize(parts.join(' '));
}

function generateItemId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** True when keyboard focus is inside a contentEditable / input — we should
 *  stop stealing arrow/enter keys in that case. */
function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const DesignBlockPicker: React.FC<DesignBlockPickerProps> = ({ currentDocumentId, onPick, onClose, uploadImage }) => {
  const library = useDesignLibrary();
  const snapshot = useLibrarySnapshot();

  const [tab, setTab] = useState<Tab>('blocks');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ mode: 'list' });
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  /** Mobile-only master-detail step tracker for the clauses tab. On desktop
   *  both panes render side-by-side regardless of this value. */
  const [clausesMobileView, setClausesMobileView] = useState<'list' | 'editor'>('list');

  const templatesById = useMemo(() => {
    const m = new Map<string, LibraryTemplate>();
    for (const t of snapshot.templates) m.set(t.id, t);
    return m;
  }, [snapshot.templates]);

  // --- Filtered + sectioned lists ----------------------------------------
  const { docBlocks, workspaceBlocks } = useMemo(() => {
    const q = normalize(query.trim());
    const match = (t: LibraryTemplate) => !q || templateSearchBlob(t).includes(q);
    const all = snapshot.templates.filter(match);
    return {
      docBlocks: all.filter(t => t.documentId === currentDocumentId),
      workspaceBlocks: all.filter(t => t.documentId !== currentDocumentId),
    };
  }, [snapshot.templates, query, currentDocumentId]);

  const { docClauses, workspaceClauses } = useMemo(() => {
    const q = normalize(query.trim());
    const match = (c: LibraryClause) => !q || clauseSearchBlob(c, templatesById).includes(q);
    const all = snapshot.clauses.filter(match);
    return {
      docClauses: all.filter(c => c.documentId === currentDocumentId),
      workspaceClauses: all.filter(c => c.documentId !== currentDocumentId),
    };
  }, [snapshot.clauses, query, currentDocumentId, templatesById]);

  const flatBlocks = useMemo(() => [...docBlocks, ...workspaceBlocks], [docBlocks, workspaceBlocks]);
  const flatClauses = useMemo(() => [...docClauses, ...workspaceClauses], [docClauses, workspaceClauses]);

  // Derive the "effective" selection by falling back to the first visible
  // item when the stored id has been filtered out (search, deletion, etc).
  // This keeps state and render in sync without the setState-in-effect dance.
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

  // --- Keyboard ----------------------------------------------------------
  const blockScrollRef = useRef<HTMLDivElement>(null);
  const clauseListRef = useRef<HTMLDivElement>(null);

  const scrollFocusIntoView = useCallback((container: HTMLDivElement | null) => {
    requestAnimationFrame(() => {
      const el = container?.querySelector<HTMLElement>('[data-list-item][data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  useEffect(() => { scrollFocusIntoView(blockScrollRef.current); }, [effectiveFocusedBlockId, scrollFocusIntoView]);
  useEffect(() => { scrollFocusIntoView(clauseListRef.current); }, [effectiveSelectedClauseId, scrollFocusIntoView]);

  useEffect(() => {
    if (view.mode !== 'list') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }

      // When the user is typing in the clause inline editor, let the DOM
      // handle arrow/enter — we only want Tab (tab switch) + Escape (close).
      const editing = isEditableFocused();
      const activeIsSearch = document.activeElement === searchRef.current;

      if (e.key === 'Tab' && !editing) {
        e.preventDefault();
        setTab(prev => prev === 'blocks' ? 'clauses' : 'blocks');
        return;
      }

      if (editing && !activeIsSearch) return; // hands off — clause editor is typing

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
  }, [view.mode, tab, flatBlocks, flatClauses, effectiveFocusedBlockId, effectiveSelectedClauseId, selectedClause, onPick, onClose]);

  // --- CRUD handlers ------------------------------------------------------
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // --- Event isolation ----------------------------------------------------
  // NotionEditor attaches window-level keydown / paste listeners (see
  // useKeyboardShortcuts). Those fire for every event on the page — including
  // Cmd+V / Cmd+Z / typed chars inside the picker's textarea and contenteditable
  // zones — and call preventDefault, breaking native paste/undo inside the
  // modal. We fix it by attaching a bubble-phase listener on the modal root
  // that stops propagation when the target is a form input / contentEditable.
  // The target element still receives the event (target phase happens before
  // bubble), so native paste/undo/redo/typing all work normally.
  const modalRef = useRef<HTMLDivElement>(null);
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

  const openNew = useCallback(async () => {
    if (tab === 'blocks') {
      setView({ mode: 'edit-template' });
    } else {
      // Create empty clause immediately so the inline editor can take over.
      const created = await library.createClause({ name: 'Nova cláusula', items: [] });
      setSelectedClauseId(created.id);
      setClausesMobileView('editor');
    }
  }, [tab, library]);

  /** Click on a clause in the sidebar — also advances to editor view on mobile */
  const selectClause = useCallback((id: string) => {
    setSelectedClauseId(id);
    setClausesMobileView('editor');
  }, []);

  const editTemplate = useCallback((tpl: LibraryTemplate) => {
    setView({ mode: 'edit-template', template: tpl });
  }, []);

  const deleteTemplate = useCallback(async (tpl: LibraryTemplate) => {
    if (confirm(`Excluir "${tpl.name}"?`)) await library.deleteTemplate(tpl.id);
  }, [library]);

  const deleteClause = useCallback(async (clause: LibraryClause) => {
    if (confirm(`Excluir "${clause.name}"?`)) {
      await library.deleteClause(clause.id);
    }
  }, [library]);

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
      className="fixed inset-0 z-[1000] flex sm:items-center sm:justify-center sm:p-4 bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="bg-white shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden rounded-none sm:rounded-2xl h-full sm:h-[720px] sm:max-h-[90vh]"
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

        {/* Tabs + search + new — wraps gracefully on narrow screens */}
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
          <div className="order-3 sm:order-none basis-full sm:basis-auto flex-1 relative">
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
            <BlocksTabBody
              scrollRef={blockScrollRef}
              docBlocks={docBlocks}
              workspaceBlocks={workspaceBlocks}
              query={query}
              focusedId={effectiveFocusedBlockId}
              onFocus={setFocusedBlockId}
              canInsert={!!onPick}
              onPick={pickBlock}
              onEdit={editTemplate}
              onDelete={deleteTemplate}
            />
          ) : (
            <ClausesTabBody
              listRef={clauseListRef}
              docClauses={docClauses}
              workspaceClauses={workspaceClauses}
              selectedClauseId={effectiveSelectedClauseId}
              onSelect={selectClause}
              selectedClause={selectedClause}
              availableTemplates={snapshot.templates}
              canInsert={!!onPick}
              onInsert={(c) => onPick?.({ kind: 'clause', clause: c })}
              onDelete={deleteClause}
              uploadImage={uploadImage}
              mobileView={clausesMobileView}
              onMobileBack={() => setClausesMobileView('list')}
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

  return createPortal(modal, document.body);
};

// ---------------------------------------------------------------------------
// Blocks tab — vertical stack of cards, no sidebar
// ---------------------------------------------------------------------------

const BlocksTabBody: React.FC<{
  scrollRef: React.RefObject<HTMLDivElement | null>;
  docBlocks: LibraryTemplate[];
  workspaceBlocks: LibraryTemplate[];
  query: string;
  focusedId: string | null;
  onFocus: (id: string) => void;
  canInsert: boolean;
  onPick: (tpl: LibraryTemplate) => void;
  onEdit: (tpl: LibraryTemplate) => void;
  onDelete: (tpl: LibraryTemplate) => void;
}> = ({ scrollRef, docBlocks, workspaceBlocks, query, focusedId, onFocus, canInsert, onPick, onEdit, onDelete }) => {
  const empty = docBlocks.length === 0 && workspaceBlocks.length === 0;
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5">
      {empty ? (
        <div className="text-center text-sm text-gray-400 italic py-16">
          {query ? 'Nenhum bloco encontrado.' : 'Nenhum bloco ainda. Clique em "+ Novo" para criar.'}
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto">
          <BlockSection
            icon={FileText}
            label="Deste documento"
            blocks={docBlocks}
            focusedId={focusedId}
            onFocus={onFocus}
            canInsert={canInsert}
            onPick={onPick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <BlockSection
            icon={Library}
            label="Do workspace"
            blocks={workspaceBlocks}
            focusedId={focusedId}
            onFocus={onFocus}
            canInsert={canInsert}
            onPick={onPick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
};

const BlockSection: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  blocks: LibraryTemplate[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  canInsert: boolean;
  onPick: (tpl: LibraryTemplate) => void;
  onEdit: (tpl: LibraryTemplate) => void;
  onDelete: (tpl: LibraryTemplate) => void;
}> = ({ icon: Icon, label, blocks, focusedId, onFocus, canInsert, onPick, onEdit, onDelete }) => {
  if (blocks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={11} className="text-gray-400" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-gray-300">{blocks.length}</span>
      </div>
      <div className="space-y-3">
        {blocks.map(tpl => (
          <BlockCard
            key={tpl.id}
            template={tpl}
            focused={focusedId === tpl.id}
            canInsert={canInsert}
            onFocus={() => onFocus(tpl.id)}
            onPick={() => onPick(tpl)}
            onEdit={() => onEdit(tpl)}
            onDelete={() => onDelete(tpl)}
          />
        ))}
      </div>
    </div>
  );
};

const BlockCard: React.FC<{
  template: LibraryTemplate;
  focused: boolean;
  canInsert: boolean;
  onFocus: () => void;
  onPick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ template, focused, canInsert, onFocus, onPick, onEdit, onDelete }) => (
  <div
    data-list-item
    data-selected={focused}
    onMouseEnter={onFocus}
    onClick={() => { onFocus(); if (canInsert) onPick(); }}
    className={`group relative border rounded-xl p-4 bg-white transition-all ${
      canInsert ? 'cursor-pointer' : ''
    } ${focused ? 'border-purple-400 shadow-sm ring-2 ring-purple-100' : 'border-gray-200 hover:border-gray-300'}`}
  >
    {/* Header */}
    <div className="flex items-center justify-between mb-3 gap-2">
      <span className="text-xs font-semibold text-gray-700 truncate">{template.name}</span>
      {/* Actions: always visible on touch, hover-revealed on desktop */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          title="Editar"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600"
          title="Excluir"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>

    {/* Real-size preview */}
    <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: buildPreviewHtml(template) }} />
  </div>
);

// ---------------------------------------------------------------------------
// Clauses tab — sidebar + inline mini-editor
// ---------------------------------------------------------------------------

const ClausesTabBody: React.FC<{
  listRef: React.RefObject<HTMLDivElement | null>;
  docClauses: LibraryClause[];
  workspaceClauses: LibraryClause[];
  selectedClauseId: string | null;
  onSelect: (id: string) => void;
  selectedClause: LibraryClause | null;
  availableTemplates: LibraryTemplate[];
  canInsert: boolean;
  onInsert: (c: LibraryClause) => void;
  onDelete: (c: LibraryClause) => void;
  uploadImage?: (file: File) => Promise<string | null>;
  /** Mobile master-detail step. Ignored on ≥md. */
  mobileView: 'list' | 'editor';
  onMobileBack: () => void;
}> = ({ listRef, docClauses, workspaceClauses, selectedClauseId, onSelect, selectedClause, availableTemplates, canInsert, onInsert, onDelete, uploadImage, mobileView, onMobileBack }) => {
  // On mobile we render only one of the two panes at a time. On md+ both
  // render side-by-side (the hidden/flex toggles below become no-ops).
  const listClasses = mobileView === 'editor' ? 'hidden md:block' : 'block';
  const editorClasses = mobileView === 'list' ? 'hidden md:flex' : 'flex';
  return (
    <>
      {/* Sidebar */}
      <div
        ref={listRef}
        className={`${listClasses} w-full md:w-72 md:border-r md:border-gray-100 overflow-y-auto py-3 shrink-0`}
      >
        {(docClauses.length === 0 && workspaceClauses.length === 0) ? (
          <div className="text-center text-xs text-gray-400 italic py-12 px-3">
            Nenhuma cláusula. Clique em &ldquo;+ Novo&rdquo;.
          </div>
        ) : (
          <>
            <ClauseSidebarSection icon={FileText} label="Deste documento" clauses={docClauses} selectedId={selectedClauseId} onSelect={onSelect} />
            <ClauseSidebarSection icon={Library} label="Do workspace" clauses={workspaceClauses} selectedId={selectedClauseId} onSelect={onSelect} />
          </>
        )}
      </div>

      {/* Inline editor */}
      <div className={`${editorClasses} flex-1 min-w-0 flex-col w-full md:w-auto`}>
        {selectedClause ? (
          <ClauseInlineEditor
            key={selectedClause.id}
            clause={selectedClause}
            availableTemplates={availableTemplates}
            canInsert={canInsert}
            onInsert={() => onInsert(selectedClause)}
            onDelete={() => onDelete(selectedClause)}
            uploadImage={uploadImage}
            onMobileBack={onMobileBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-6 text-center">
            Selecione uma cláusula à esquerda
          </div>
        )}
      </div>
    </>
  );
};

const ClauseSidebarSection: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  clauses: LibraryClause[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ icon: Icon, label, clauses, selectedId, onSelect }) => {
  if (clauses.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <Icon size={11} className="text-gray-400" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-gray-300">{clauses.length}</span>
      </div>
      {clauses.map(c => {
        const isSelected = c.id === selectedId;
        return (
          <button
            key={c.id}
            data-list-item
            data-selected={isSelected}
            onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors ${
              isSelected ? 'bg-purple-50 text-purple-700 border-l-2 border-purple-500' : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
            }`}
          >
            <span className="flex-1 truncate">{c.name}</span>
            <span className="text-[10px] text-gray-400">{c.items.length}</span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Clause inline editor — reuses DesignBlock for real contentEditable editing
// ---------------------------------------------------------------------------

const ClauseInlineEditor: React.FC<{
  clause: LibraryClause;
  availableTemplates: LibraryTemplate[];
  canInsert: boolean;
  onInsert: () => void;
  onDelete: () => void;
  uploadImage?: (file: File) => Promise<string | null>;
  onMobileBack: () => void;
}> = ({ clause, availableTemplates, canInsert, onInsert, onDelete, uploadImage, onMobileBack }) => {
  const library = useDesignLibrary();
  const [name, setName] = useState(clause.name);
  const [items, setItems] = useState<ClauseItem[]>(clause.items);
  const [pickingBlock, setPickingBlock] = useState(false);

  // When a different clause is selected the parent remounts this component
  // (via `key={clause.id}`), so we don't need to handle prop-change resets.

  // Debounced auto-save: fires 500ms after the user stops typing. We skip
  // the very first effect run so mount doesn't immediately re-persist the
  // values we just received.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const handle = setTimeout(() => {
      library.updateClause(clause.id, { name, items }).catch(err => {
        console.error('[clause autosave] failed', err);
      });
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
        {canInsert && (
          <button
            onClick={onInsert}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors shrink-0"
          >
            Inserir cláusula completa
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
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500">Escolha um bloco</span>
                  <button onClick={() => setPickingBlock(false)} className="text-[11px] text-gray-400 hover:text-gray-600">cancelar</button>
                </div>
                {availableTemplates.length === 0 ? (
                  <div className="text-xs text-gray-400 italic">Nenhum bloco disponível. Crie um bloco primeiro na aba Blocos.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {availableTemplates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => addBlock(tpl)}
                        className="text-left border border-gray-200 rounded-lg p-2 bg-white hover:border-purple-300 hover:bg-purple-50/30 transition-colors"
                      >
                        <div className="text-[11px] font-medium text-gray-700 truncate mb-1">{tpl.name}</div>
                        <div className="rounded bg-white border border-gray-100 p-1 overflow-hidden" style={{ maxHeight: 50 }}>
                          <div
                            style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%' }}
                            dangerouslySetInnerHTML={{ __html: buildPreviewHtml(tpl) }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

const ClauseItemRow: React.FC<{
  item: ClauseItem;
  index: number;
  total: number;
  uploadImage?: (file: File) => Promise<string | null>;
  onChangeValues: (values: Record<string, string>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}> = ({ item, index, total, uploadImage, onChangeValues, onMoveUp, onMoveDown, onRemove }) => {
  // Synthesize a BlockData so we can reuse the real DesignBlock component.
  // Any edit inside the DesignBlock is translated back into clause items via
  // onChangeValues.
  const syntheticBlock = useMemo<BlockData>(() => ({
    id: item.id,
    type: 'design_block',
    content: '',
    designBlockData: { templateId: item.templateId, values: item.values },
  }), [item.id, item.templateId, item.values]);

  const updateBlock = useCallback((_blockId: string, patch: Partial<BlockData>) => {
    if (patch.designBlockData?.values) {
      onChangeValues(patch.designBlockData.values);
    }
  }, [onChangeValues]);

  return (
    <div className="group relative">
      {/* Item controls.
          Desktop (≥md): vertical stack floating to the left of the block,
          appears on hover. Mobile (<md): horizontal row overlayed on the
          top-right of the block, always visible so touch users can reach it. */}
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

      {/* Mobile controls: top-right overlay, always visible */}
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

// ---------------------------------------------------------------------------
// Template editor (inline, used for create/edit in the Blocks tab)
// ---------------------------------------------------------------------------

const TemplateEditor: React.FC<{
  existing?: LibraryTemplate;
  onSave: (input: TemplateInput) => Promise<void>;
  onCancel: () => void;
}> = ({ existing, onSave, onCancel }) => {
  const [json, setJson] = useState(() =>
    existing
      ? JSON.stringify({ name: existing.name, html: existing.html, defaults: existing.defaults, autonumber: existing.autonumber ?? null }, null, 2)
      : `{
  "name": "Meu novo bloco",
  "html": "<div class=\\"p-4 rounded-xl bg-purple-100\\"><p data-editable=\\"body\\"></p></div>",
  "defaults": { "body": "Texto padrão" },
  "autonumber": null
}`
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo<Partial<TemplateInput> | null>(() => {
    try {
      const obj = JSON.parse(json);
      if (!obj.name || !obj.html) return null;
      return obj;
    } catch {
      return null;
    }
  }, [json]);

  const previewTemplate: LibraryTemplate | null = useMemo(() => {
    if (!parsed || !parsed.name || !parsed.html) return null;
    return {
      id: existing?.id ?? 'preview',
      name: parsed.name,
      html: parsed.html,
      defaults: parsed.defaults ?? {},
      autonumber: parsed.autonumber as 'heading' | 'subheading' | undefined,
      workspaceId: existing?.workspaceId ?? '',
      documentId: existing?.documentId ?? '',
    };
  }, [parsed, existing]);

  const handleSave = useCallback(async () => {
    setError(null);
    try {
      const obj = JSON.parse(json);
      if (!obj.name || typeof obj.name !== 'string') throw new Error('O campo "name" é obrigatório');
      if (!obj.html || typeof obj.html !== 'string') throw new Error('O campo "html" é obrigatório');
      if (obj.defaults && typeof obj.defaults !== 'object') throw new Error('"defaults" deve ser um objeto');
      setSaving(true);
      await onSave({
        id: existing?.id,
        name: obj.name,
        html: obj.html,
        defaults: obj.defaults ?? {},
        autonumber: obj.autonumber ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON inválido');
      setSaving(false);
    }
  }, [json, existing, onSave]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-gray-100 shrink-0">
        <span className="text-sm font-semibold text-gray-800">{existing ? 'Editar bloco' : 'Novo bloco'}</span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!parsed || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Split: JSON / preview.
          Stacks vertically on mobile (single column, each pane takes ~half
          the available height), side-by-side on md+. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 px-3 sm:px-5 py-3 sm:py-4 overflow-y-auto md:overflow-hidden">
        <div className="flex flex-col min-h-[200px] md:min-h-0">
          <label className="text-[11px] text-gray-500 mb-1">JSON do bloco</label>
          <textarea
            value={json}
            onChange={e => setJson(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full text-xs font-mono border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 resize-none"
          />
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>
        <div className="flex flex-col min-h-[200px] md:min-h-0">
          <label className="text-[11px] text-gray-500 mb-1">Preview</label>
          <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-gray-50 overflow-auto">
            {previewTemplate ? (
              <div dangerouslySetInnerHTML={{ __html: buildPreviewHtml(previewTemplate) }} />
            ) : (
              <div className="text-xs text-gray-400 italic">JSON inválido — o preview aparece quando estiver correto.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
