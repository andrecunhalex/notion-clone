'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, Clock, X } from 'lucide-react';
import { BlockData, DocumentVersion } from '../types';
import { NotionEditor } from '../NotionEditor';
import { getTemplate } from './designBlocks';
import type { UseVersionHistoryReturn } from '../hooks/useVersionHistory';

// ---------------------------------------------------------------------------
// Date formatting (pt-BR)
// ---------------------------------------------------------------------------

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase().slice(0, 3)}. de ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()} de ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

function groupByMonth(versions: DocumentVersion[]): { label: string; items: DocumentVersion[] }[] {
  const groups: { label: string; items: DocumentVersion[] }[] = [];
  let current: { label: string; items: DocumentVersion[] } | null = null;
  for (const v of versions) {
    const label = getMonthYear(v.created_at);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(v);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Block-level diff
// ---------------------------------------------------------------------------

interface BlockDiffs {
  modified: Set<string>;
  deleted: Set<string>;
  added: Set<string>;
}

function blocksEqual(a: BlockData, b: BlockData): boolean {
  if (a.type !== b.type || a.content !== b.content || a.align !== b.align) return false;

  if (a.type === 'design_block') {
    if (!a.designBlockData && !b.designBlockData) return true;
    if (!a.designBlockData || !b.designBlockData) return false;
    if (a.designBlockData.templateId !== b.designBlockData.templateId) return false;
    const av = a.designBlockData.values, bv = b.designBlockData.values;
    const keys = new Set([...Object.keys(av), ...Object.keys(bv)]);
    for (const k of keys) { if (av[k] !== bv[k]) return false; }
    return true;
  }

  if (a.type === 'table') {
    if (!a.tableData && !b.tableData) return true;
    if (!a.tableData || !b.tableData) return false;
    const ar = a.tableData.rows, br = b.tableData.rows;
    if (ar.length !== br.length || a.tableData.hasHeaderRow !== b.tableData.hasHeaderRow) return false;
    for (let ri = 0; ri < ar.length; ri++) {
      if (ar[ri].length !== br[ri].length) return false;
      for (let ci = 0; ci < ar[ri].length; ci++) {
        const ac = ar[ri][ci], bc = br[ri][ci];
        if (ac.content !== bc.content || ac.bgColor !== bc.bgColor || ac.textColor !== bc.textColor) return false;
      }
    }
    return true;
  }

  if (a.type === 'image') {
    if (!a.imageData && !b.imageData) return true;
    if (!a.imageData || !b.imageData) return false;
    return a.imageData.src === b.imageData.src && a.imageData.width === b.imageData.width
      && a.imageData.alignment === b.imageData.alignment && (a.imageData.caption || '') === (b.imageData.caption || '');
  }

  return true;
}

function computeDiffs(versionBlocks: BlockData[], currentBlocks: BlockData[]): BlockDiffs {
  const modified = new Set<string>();
  const deleted = new Set<string>();
  const added = new Set<string>();
  const currentMap = new Map(currentBlocks.map(b => [b.id, b]));
  const versionMap = new Map(versionBlocks.map(b => [b.id, b]));

  for (const vb of versionBlocks) {
    const cb = currentMap.get(vb.id);
    if (!cb) deleted.add(vb.id);
    else if (!blocksEqual(vb, cb)) modified.add(vb.id);
  }
  for (const cb of currentBlocks) {
    if (!versionMap.has(cb.id)) added.add(cb.id);
  }
  return { modified, deleted, added };
}

// ---------------------------------------------------------------------------
// Inline word diff (for annotating blocks before passing to editor)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || '';
  const normalized = html.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(?:p|div|li|h[1-6])>/gi, ' ');
  const div = document.createElement('div');
  div.innerHTML = normalized;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenize(text: string): string[] {
  return text.match(/[\w\u00C0-\u024F()]+|[.,!?;:…"'""'']+|\s+/g) || [];
}

function sideBySideDiff(oldText: string, newText: string): { left: string; right: string } {
  if (oldText === newText) return { left: escapeHtml(oldText), right: escapeHtml(newText) };
  const oldT = tokenize(oldText), newT = tokenize(newText);
  const m = oldT.length, n = newT.length;
  if (m > 2000 || n > 2000) return { left: escapeHtml(oldText), right: escapeHtml(newText) };

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldT[i] === newT[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const leftParts: string[] = [], rightParts: string[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (oldT[i] === newT[j]) {
      leftParts.push(escapeHtml(oldT[i])); rightParts.push(escapeHtml(newT[j]));
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      leftParts.push(`<span style="background:#fecaca;padding:0 1px;border-radius:2px;text-decoration:line-through">${escapeHtml(oldT[i])}</span>`);
      i++;
    } else {
      rightParts.push(`<span style="background:#bbf7d0;padding:0 1px;border-radius:2px">${escapeHtml(newT[j])}</span>`);
      j++;
    }
  }
  while (i < m) { leftParts.push(`<span style="background:#fecaca;padding:0 1px;border-radius:2px;text-decoration:line-through">${escapeHtml(oldT[i++])}</span>`); }
  while (j < n) { rightParts.push(`<span style="background:#bbf7d0;padding:0 1px;border-radius:2px">${escapeHtml(newT[j++])}</span>`); }

  return { left: leftParts.join(''), right: rightParts.join('') };
}

/** Annotate blocks for one side of the diff (left=version, right=current) */
function annotateForSide(
  blocks: BlockData[], otherBlocks: BlockData[], modifiedIds: Set<string>, side: 'left' | 'right',
): BlockData[] {
  if (modifiedIds.size === 0) return blocks;
  const otherMap = new Map(otherBlocks.map(b => [b.id, b]));

  return blocks.map(block => {
    if (!modifiedIds.has(block.id)) return block;
    const other = otherMap.get(block.id);
    if (!other) return block;
    const old = side === 'left' ? block : other;
    const cur = side === 'left' ? other : block;

    // Text blocks
    if (['text', 'h1', 'h2', 'h3', 'bullet_list', 'numbered_list'].includes(block.type)) {
      const oT = stripHtml(old.content), nT = stripHtml(cur.content);
      if (oT === nT) return block;
      const diff = sideBySideDiff(oT, nT);
      return { ...block, content: side === 'left' ? diff.left : diff.right };
    }

    // Design blocks
    if (block.type === 'design_block' && block.designBlockData && other.designBlockData) {
      const oldVals = old.designBlockData!.values, newVals = cur.designBlockData!.values;
      const annotated: Record<string, string> = { ...block.designBlockData.values };
      for (const key of Object.keys(annotated)) {
        const oT = stripHtml(oldVals[key] || ''), nT = stripHtml(newVals[key] || '');
        if (oT !== nT) { const d = sideBySideDiff(oT, nT); annotated[key] = side === 'left' ? d.left : d.right; }
      }
      return { ...block, designBlockData: { ...block.designBlockData, values: annotated } };
    }

    // Tables
    if (block.type === 'table' && block.tableData && other.tableData) {
      const oldRows = old.tableData!.rows, newRows = cur.tableData!.rows;
      const annotatedRows = block.tableData.rows.map((row, ri) =>
        row.map((cell, ci) => {
          const oldCell = oldRows[ri]?.[ci], newCell = newRows[ri]?.[ci];
          if (!oldCell || !newCell) return cell;
          const oT = stripHtml(oldCell.content), nT = stripHtml(newCell.content);
          if (oT === nT) return cell;
          const d = sideBySideDiff(oT, nT);
          return { ...cell, content: side === 'left' ? d.left : d.right };
        }),
      );
      return { ...block, tableData: { ...block.tableData, rows: annotatedRows } };
    }

    return block;
  });
}

// ---------------------------------------------------------------------------
// ID prefixing — prevents DOM ID collisions between two editor instances
// ---------------------------------------------------------------------------

function prefixBlockIds(blocks: BlockData[], prefix: string): BlockData[] {
  return blocks.map(b => ({ ...b, id: `${prefix}${b.id}` }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VersionHistoryOverlayProps {
  versionHistory: UseVersionHistoryReturn;
  currentBlocks: BlockData[];
  documentFont: string;
  documentFontSize: number;
  onRestore: (blocks: BlockData[], meta: Record<string, unknown>) => void;
  /** Pass through the editor config for page dimensions, fonts, etc. */
  editorConfig?: import('../types').EditorConfig;
  /** Current document meta (for pageBackground, documentSettings, etc.) */
  currentMeta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main Overlay — uses NotionEditor in readOnly mode
// ---------------------------------------------------------------------------

export const VersionHistoryOverlay: React.FC<VersionHistoryOverlayProps> = ({
  versionHistory,
  currentBlocks,
  documentFont,
  documentFontSize,
  onRestore,
  editorConfig = {},
  currentMeta,
}) => {
  const { versions, loading, selectedVersion, selectVersion, restore, close } = versionHistory;

  const versionFont = (selectedVersion?.meta?.documentFont as string) || documentFont;
  const versionFontSize = (selectedVersion?.meta?.documentFontSize as number) || documentFontSize;

  // Block-level diff
  const diffs = useMemo<BlockDiffs>(() => {
    if (!selectedVersion) return { modified: new Set(), deleted: new Set(), added: new Set() };
    return computeDiffs(selectedVersion.blocks, currentBlocks);
  }, [selectedVersion, currentBlocks]);

  const leftHighlights = useMemo(() => new Set([...diffs.modified, ...diffs.deleted]), [diffs]);
  const rightHighlights = useMemo(() => new Set([...diffs.modified, ...diffs.added]), [diffs]);

  // Memoize versionBlocks to avoid re-creating on every render
  const versionBlocks = useMemo(
    () => selectedVersion?.blocks || currentBlocks,
    [selectedVersion, currentBlocks],
  );

  // Annotate blocks with inline word diff, then prefix IDs to avoid DOM collisions
  const leftBlocks = useMemo(
    () => prefixBlockIds(
      selectedVersion ? annotateForSide(versionBlocks, currentBlocks, diffs.modified, 'left') : currentBlocks,
      'vhl-',
    ),
    [versionBlocks, currentBlocks, diffs.modified, selectedVersion],
  );
  const rightBlocks = useMemo(
    () => prefixBlockIds(
      selectedVersion ? annotateForSide(currentBlocks, versionBlocks, diffs.modified, 'right') : currentBlocks,
      'vhr-',
    ),
    [currentBlocks, versionBlocks, diffs.modified, selectedVersion],
  );

  // Build highlight CSS using prefixed IDs
  const highlightCss = useMemo(() => {
    if (!selectedVersion) return '';
    const rules: string[] = [];
    for (const id of leftHighlights) {
      rules.push(`.vh-left [data-block-id="vhl-${id}"] { background: #fef2f2; border-left: 4px solid #f87171; }`);
    }
    for (const id of rightHighlights) {
      rules.push(`.vh-right [data-block-id="vhr-${id}"] { background: #f0fdf4; border-left: 4px solid #4ade80; }`);
    }
    return rules.join('\n');
  }, [selectedVersion, leftHighlights, rightHighlights]);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'version' | 'current'>('version');

  const handleRestore = useCallback(() => {
    const result = restore();
    if (result) { onRestore(result.blocks, result.meta); close(); }
  }, [restore, onRestore, close]);

  const headerDate = selectedVersion ? formatFullDate(selectedVersion.created_at) : 'Versão atual';
  const grouped = useMemo(() => groupByMonth(versions), [versions]);
  const totalChanges = diffs.modified.size + diffs.deleted.size + diffs.added.size;

  // Editor config without version history (prevent recursion) and without section nav
  const readOnlyConfig = useMemo(() => ({
    ...editorConfig,
    enableVersionHistory: false,
    sectionNav: undefined,
  }), [editorConfig]);

  // Version list (shared between desktop sidebar and mobile bottom sheet)
  const versionList = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhuma versão anterior encontrada.</p>
      ) : (
        <>
          <div className="mb-2">
            <button
              onClick={() => { selectVersion(null); setMobileSidebarOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${!selectedVersion ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
            >
              <div className="text-sm font-medium text-gray-800">Versão atual</div>
            </button>
          </div>
          {grouped.map(group => (
            <div key={group.label} className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.label}</div>
              {group.items.map(version => (
                <button
                  key={version.id}
                  onClick={() => { selectVersion(version); setMobileSidebarOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${selectedVersion?.id === version.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                >
                  <div className="text-sm font-medium text-gray-800">{formatVersionDate(version.created_at)}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: version.user_color }} />
                    <span className="text-xs text-gray-500">{version.user_name}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100" style={{ zIndex: 200 }}>
      {/* Highlight CSS */}
      {highlightCss && <style dangerouslySetInnerHTML={{ __html: highlightCss }} />}

      {/* Top bar */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <button onClick={close} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 shrink-0">
          <ArrowLeft size={20} />
        </button>
        <span className="text-xs md:text-sm text-gray-700 font-medium truncate">{headerDate}</span>
        {selectedVersion && totalChanges > 0 && (
          <span className="hidden md:inline text-xs text-gray-400">{totalChanges} alterações</span>
        )}
        {selectedVersion && (
          <button onClick={handleRestore} className="ml-auto md:ml-2 shrink-0 px-3 md:px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-medium rounded-md transition-colors">
            Restaurar
          </button>
        )}
        <button onClick={() => setMobileSidebarOpen(true)} className="xl:hidden ml-auto p-1.5 hover:bg-gray-100 rounded-md text-gray-600 shrink-0">
          <Clock size={18} />
        </button>
      </div>

      {/* Mobile tabs */}
      {selectedVersion && (
        <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setMobileTab('version')}
            className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${mobileTab === 'version' ? 'text-red-600 border-b-2 border-red-500' : 'text-gray-500'}`}
          >Versão anterior</button>
          <button
            onClick={() => setMobileTab('current')}
            className={`flex-1 py-2 text-xs font-medium text-center transition-colors ${mobileTab === 'current' ? 'text-green-600 border-b-2 border-green-500' : 'text-gray-500'}`}
          >Versão atual</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {selectedVersion ? (
          <>
            {/* Left: version (old) */}
            <div className={`vh-left min-w-0 md:flex-1 md:border-r border-gray-300 ${mobileTab === 'version' ? 'flex-1' : 'hidden md:block'}`}>
              <div className="text-center py-1">
                <span className="text-xs font-medium text-red-500">
                  Anterior · {diffs.deleted.size + diffs.modified.size} alterações
                </span>
              </div>
              <NotionEditor
                key={`left-${selectedVersion.id}-${mobileTab}`}
                initialBlocks={leftBlocks}
                initialMeta={selectedVersion.meta}
                defaultViewMode="paginated"
                title=""
                readOnly
                config={readOnlyConfig}
              />
            </div>

            {/* Right: current */}
            <div className={`vh-right min-w-0 md:flex-1 ${mobileTab === 'current' ? 'flex-1' : 'hidden md:block'}`}>
              <div className="text-center py-1">
                <span className="text-xs font-medium text-green-600">
                  Atual · {diffs.added.size + diffs.modified.size} alterações
                </span>
              </div>
              <NotionEditor
                key={`right-${selectedVersion.id}-${mobileTab}`}
                initialBlocks={rightBlocks}
                initialMeta={{ ...currentMeta, documentFont, documentFontSize }}
                defaultViewMode="paginated"
                title=""
                readOnly
                config={readOnlyConfig}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <NotionEditor
              key="current-only"
              initialBlocks={prefixBlockIds(currentBlocks, 'vhc-')}
              initialMeta={{ ...currentMeta, documentFont, documentFontSize }}
              defaultViewMode="paginated"
              title=""
              readOnly
              config={readOnlyConfig}
            />
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden xl:flex w-72 shrink-0 bg-white border-l border-gray-200 flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Histórico de versões</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">{versionList}</div>
        </div>
      </div>

      {/* Mobile bottom sheet backdrop */}
      <div
        className={`xl:hidden fixed inset-0 bg-black/30 transition-opacity duration-200 ${mobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 210 }}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* Mobile bottom sheet */}
      <div
        className={`xl:hidden fixed left-0 right-0 bottom-0 transition-transform duration-300 ease-out ${mobileSidebarOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ zIndex: 211 }}
      >
        <div className="bg-white rounded-t-2xl shadow-xl max-h-[75vh] flex flex-col">
          <div className="shrink-0 pt-3 pb-2 px-5">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-800">Histórico de versões</span>
              <button onClick={() => setMobileSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto border-t border-gray-100 px-2 py-2 pb-safe">{versionList}</div>
        </div>
      </div>
    </div>
  );
};
