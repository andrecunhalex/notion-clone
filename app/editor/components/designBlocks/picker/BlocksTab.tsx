'use client';

// ---------------------------------------------------------------------------
// BlocksTab — virtualized vertical stack of design block cards
// ---------------------------------------------------------------------------
// Sections (Deste documento / Do workspace) are flattened into a single list
// of "rows" (header rows + card rows) and rendered through @tanstack/react-
// virtual. Only the visible cards are mounted at a time, so the picker
// stays smooth at 500-5000+ blocks.
//
// Card heights are variable (preview height depends on the template), so
// the virtualizer measures each rendered row dynamically via measureElement.
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  loading: boolean;
}

type Row =
  | { kind: 'header'; key: string; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; count: number }
  | { kind: 'block'; key: string; template: LibraryTemplate };

export const BlocksTab: React.FC<BlocksTabProps> = ({
  scrollRef, docBlocks, workspaceBlocks, query, focusedId,
  onFocus, canInsert, onPick, onEdit, onDelete, loading,
}) => {
  // Flatten sections into a single virtualized list. Headers are rows just
  // like cards — they take a slot in the virtualizer with their own height.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (docBlocks.length > 0) {
      out.push({ kind: 'header', key: 'h-doc', icon: FileText, label: 'Deste documento', count: docBlocks.length });
      for (const t of docBlocks) out.push({ kind: 'block', key: t.id, template: t });
    }
    if (workspaceBlocks.length > 0) {
      out.push({ kind: 'header', key: 'h-ws', icon: Library, label: 'Do workspace', count: workspaceBlocks.length });
      for (const t of workspaceBlocks) out.push({ kind: 'block', key: t.id, template: t });
    }
    return out;
  }, [docBlocks, workspaceBlocks]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Estimate is rough — the actual height is measured per-row via
    // measureElement once the row mounts. Picking 140 (typical card)
    // keeps initial layout close to final.
    estimateSize: (index) => rows[index]?.kind === 'header' ? 32 : 140,
    overscan: 4,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const empty = !loading && docBlocks.length === 0 && workspaceBlocks.length === 0;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5">
      {loading ? (
        <BlocksSkeleton />
      ) : empty ? (
        <div className="text-center text-sm text-gray-400 italic py-16">
          {query ? 'Nenhum bloco encontrado.' : 'Nenhum bloco ainda. Clique em "+ Novo" para criar.'}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
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
                    <div className="flex items-center gap-2 mb-2 pt-3 first:pt-0">
                      <row.icon size={11} className="text-gray-400" />
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{row.label}</span>
                      <span className="text-[10px] text-gray-300">{row.count}</span>
                    </div>
                  ) : (
                    <div className="pb-3">
                      <BlockCard
                        template={row.template}
                        focused={focusedId === row.template.id}
                        canInsert={canInsert}
                        onFocus={() => onFocus(row.template.id)}
                        onPick={() => onPick(row.template)}
                        onEdit={() => onEdit(row.template)}
                        onDelete={() => onDelete(row.template)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const BlocksSkeleton: React.FC = () => (
  <div className="space-y-3 max-w-2xl mx-auto" aria-busy="true" aria-label="Carregando blocos">
    {[0, 1, 2].map(i => (
      <div key={i} className="border border-gray-200 rounded-xl p-4 bg-white">
        <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mb-3" />
        <div className="h-20 bg-gray-100 rounded animate-pulse" />
      </div>
    ))}
  </div>
);

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
