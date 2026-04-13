'use client';

// ---------------------------------------------------------------------------
// ClausesTab — sidebar list + inline mini-editor (master-detail)
// ---------------------------------------------------------------------------
// On md+ both panes render side-by-side. On mobile only one of the two
// renders at a time and the user navigates via select / back.
// ---------------------------------------------------------------------------

import React from 'react';
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
}

export const ClausesTab: React.FC<ClausesTabProps> = ({
  listRef, docClauses, workspaceClauses, selectedClauseId, onSelect, selectedClause,
  availableTemplates, canInsert, onInsert, onDelete, uploadImage, mobileView, onMobileBack,
}) => {
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

// ---------------------------------------------------------------------------

interface ClauseSidebarSectionProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  clauses: LibraryClause[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ClauseSidebarSection: React.FC<ClauseSidebarSectionProps> = ({
  icon: Icon, label, clauses, selectedId, onSelect,
}) => {
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
