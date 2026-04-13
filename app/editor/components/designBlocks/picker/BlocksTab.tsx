'use client';

// ---------------------------------------------------------------------------
// BlocksTab — vertical stack of design block cards
// ---------------------------------------------------------------------------
// Replaces the old sidebar+detail layout for blocks. Each card shows the real
// preview, has inline edit/delete actions, and click = insert.
// ---------------------------------------------------------------------------

import React from 'react';
import { Pencil, Trash2, FileText, Library } from 'lucide-react';
import type { LibraryTemplate } from '../../../designLibrary';
import { TemplatePreview } from '../TemplatePreview';

export interface BlocksTabProps {
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
}

export const BlocksTab: React.FC<BlocksTabProps> = ({
  scrollRef, docBlocks, workspaceBlocks, query, focusedId,
  onFocus, canInsert, onPick, onEdit, onDelete,
}) => {
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

// ---------------------------------------------------------------------------

interface BlockSectionProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  blocks: LibraryTemplate[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  canInsert: boolean;
  onPick: (tpl: LibraryTemplate) => void;
  onEdit: (tpl: LibraryTemplate) => void;
  onDelete: (tpl: LibraryTemplate) => void;
}

const BlockSection: React.FC<BlockSectionProps> = ({
  icon: Icon, label, blocks, focusedId, onFocus, canInsert, onPick, onEdit, onDelete,
}) => {
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

// ---------------------------------------------------------------------------

interface BlockCardProps {
  template: LibraryTemplate;
  focused: boolean;
  canInsert: boolean;
  onFocus: () => void;
  onPick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
  template, focused, canInsert, onFocus, onPick, onEdit, onDelete,
}) => (
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
    <TemplatePreview template={template} className="pointer-events-none" />
  </div>
);
