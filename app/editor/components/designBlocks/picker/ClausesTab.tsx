'use client';

// ---------------------------------------------------------------------------
// ClausesTab — virtualized sidebar list + inline mini-editor (master-detail)
// ---------------------------------------------------------------------------
// On md+ both panes render side-by-side. On mobile only one of the two
// renders at a time and the user navigates via select / back.
//
// The sidebar is virtualized via @tanstack/react-virtual: the list can hold
// thousands of clauses without dropping frames.
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileText, Library } from 'lucide-react';
import type { LibraryClause, LibraryTemplate } from '../../../designLibrary';
import { ClauseInlineEditor } from './ClauseInlineEditor';

export interface ClausesTabProps {
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
  loading: boolean;
}

type SidebarRow =
  | { kind: 'header'; key: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; count: number }
  | { kind: 'clause'; key: string; clause: LibraryClause };

const ROW_HEIGHT_HEADER = 28;
const ROW_HEIGHT_CLAUSE = 32;

export const ClausesTab: React.FC<ClausesTabProps> = ({
  listRef, docClauses, workspaceClauses, selectedClauseId, onSelect, selectedClause,
  availableTemplates, canInsert, onInsert, onDelete, uploadImage, mobileView, onMobileBack, loading,
}) => {
  const listClasses = mobileView === 'editor' ? 'hidden md:block' : 'block';
  const editorClasses = mobileView === 'list' ? 'hidden md:flex' : 'flex';

  const rows = useMemo<SidebarRow[]>(() => {
    const out: SidebarRow[] = [];
    if (docClauses.length > 0) {
      out.push({ kind: 'header', key: 'h-doc', icon: FileText, label: 'Deste documento', count: docClauses.length });
      for (const c of docClauses) out.push({ kind: 'clause', key: c.id, clause: c });
    }
    if (workspaceClauses.length > 0) {
      out.push({ kind: 'header', key: 'h-ws', icon: Library, label: 'Do workspace', count: workspaceClauses.length });
      for (const c of workspaceClauses) out.push({ kind: 'clause', key: c.id, clause: c });
    }
    return out;
  }, [docClauses, workspaceClauses]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => rows[index]?.kind === 'header' ? ROW_HEIGHT_HEADER : ROW_HEIGHT_CLAUSE,
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const empty = !loading && docClauses.length === 0 && workspaceClauses.length === 0;

  return (
    <>
      {/* Sidebar */}
      <div
        ref={listRef}
        className={`${listClasses} w-full md:w-72 md:border-r md:border-gray-100 overflow-y-auto py-3 shrink-0`}
      >
        {loading ? (
          <ClauseListSkeleton />
        ) : empty ? (
          <div className="text-center text-xs text-gray-400 italic py-12 px-3">
            Nenhuma cláusula. Clique em &ldquo;+ Novo&rdquo;.
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.kind === 'header' ? (
                    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
                      <row.icon size={11} className="text-gray-400" />
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{row.label}</span>
                      <span className="text-[10px] text-gray-300">{row.count}</span>
                    </div>
                  ) : (
                    <ClauseSidebarItem
                      clause={row.clause}
                      isSelected={row.clause.id === selectedClauseId}
                      onSelect={onSelect}
                    />
                  )}
                </div>
              );
            })}
          </div>
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
            {loading ? 'Carregando...' : 'Selecione uma cláusula à esquerda'}
          </div>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------

const ClauseListSkeleton: React.FC = () => (
  <div className="px-4 pt-4 space-y-1.5" aria-busy="true" aria-label="Carregando cláusulas">
    {[0, 1, 2, 3, 4].map(i => (
      <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + (i * 7) % 35}%` }} />
    ))}
  </div>
);

// ---------------------------------------------------------------------------

const ClauseSidebarItem: React.FC<{
  clause: LibraryClause;
  isSelected: boolean;
  onSelect: (id: string) => void;
}> = React.memo(({ clause, isSelected, onSelect }) => (
  <button
    data-list-item
    data-selected={isSelected}
    onClick={() => onSelect(clause.id)}
    className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors ${
      isSelected ? 'bg-purple-50 text-purple-700 border-l-2 border-purple-500' : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
    }`}
  >
    <span className="flex-1 truncate">{clause.name}</span>
    <span className="text-[10px] text-gray-400">{clause.items.length}</span>
  </button>
));
ClauseSidebarItem.displayName = 'ClauseSidebarItem';
