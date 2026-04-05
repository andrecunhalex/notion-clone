'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Check, Loader2, Clock, X } from 'lucide-react';
import { BlockData, DocumentVersion, PageConfig } from '../types';
import { getListNumber, resolvePageConfig, getContentHeight } from '../utils';
import { ReadOnlyBlock } from './ReadOnlyBlock';
import { getTemplate } from './designBlocks';
import type { UseVersionHistoryReturn } from '../hooks/useVersionHistory';

// ---------------------------------------------------------------------------
// Date formatting helpers (pt-BR)
// ---------------------------------------------------------------------------

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()].toLowerCase().slice(0, 3);
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} de ${month}. de ${year}, ${hours}:${minutes}`;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()].toLowerCase();
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} de ${month} de ${year}, ${hours}:${minutes}`;
}

function getMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Group versions by month/year */
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
// Simple pagination for read-only view (no height measurement needed for MVP)
// ---------------------------------------------------------------------------

function paginateBlocks(blocks: BlockData[], pageContentHeight: number): BlockData[][] {
  // Estimate: each block ~30px, headings ~45px
  const EST: Record<string, number> = {
    h1: 50, h2: 40, h3: 35, text: 28, bullet_list: 28, numbered_list: 28,
    divider: 20, table: 120, image: 200, design_block: 100,
  };

  const pages: BlockData[][] = [];
  let page: BlockData[] = [];
  let h = 0;

  for (const block of blocks) {
    const est = EST[block.type] || 28;
    if (h + est > pageContentHeight && page.length > 0) {
      pages.push(page);
      page = [];
      h = 0;
    }
    page.push(block);
    h += est;
  }
  if (page.length > 0) pages.push(page);
  if (pages.length === 0) pages.push([]);

  return pages;
}

// ---------------------------------------------------------------------------
// Word-level diff (LCS-based)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html;
  // Replace <br>, </p>, </div> with spaces so line breaks don't merge words
  const normalized = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, ' ');
  const div = document.createElement('div');
  div.innerHTML = normalized;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Tokenize text into words, whitespace, and punctuation separately */
function tokenize(text: string): string[] {
  // Match: word chars (including accented), or punctuation, or whitespace runs
  return text.match(/[\w\u00C0-\u024F()]+|[.,!?;:…"'""'']+|\s+/g) || [];
}

/** Max tokens for LCS diff. Beyond this, skip inline diff to avoid O(n²) cost. */
const MAX_DIFF_TOKENS = 5000;

function wordDiff(oldText: string, newText: string): string {
  if (oldText === newText) return escapeHtml(newText);

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  // Skip inline diff for very large texts — O(m*n) would be too slow
  if (oldTokens.length > MAX_DIFF_TOKENS || newTokens.length > MAX_DIFF_TOKENS) {
    return escapeHtml(newText);
  }

  const m = oldTokens.length, n = newTokens.length;

  // Build LCS table from the END so we can scan FORWARD.
  // dp[i][j] = LCS length of oldTokens[i..] and newTokens[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldTokens[i] === newTokens[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Forward scan — naturally matches words with their earliest occurrence
  const ops: { type: 'same' | 'add' | 'del'; text: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (oldTokens[i] === newTokens[j]) {
      ops.push({ type: 'same', text: oldTokens[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: oldTokens[i] });
      i++;
    } else {
      ops.push({ type: 'add', text: newTokens[j] });
      j++;
    }
  }
  while (i < m) { ops.push({ type: 'del', text: oldTokens[i++] }); }
  while (j < n) { ops.push({ type: 'add', text: newTokens[j++] }); }

  // Build annotated HTML
  const parts: string[] = [];
  for (const op of ops) {
    const escaped = escapeHtml(op.text);
    if (op.type === 'same') parts.push(escaped);
    else if (op.type === 'add') parts.push(`<span style="background-color:#bbf7d0;padding:0 1px;border-radius:2px">${escaped}</span>`);
    else parts.push(`<span style="text-decoration:line-through;color:#f87171;opacity:0.7">${escaped}</span>`);
  }

  return parts.join('');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build annotated blocks for diff display.
 *
 * Uses CURRENT blocks as the base (so block positions are correct), then:
 * - Modified blocks: show current content with inline word diff
 * - Added blocks (new in current): shown with 'added' marker
 * - Deleted blocks (removed from current): injected from old version with 'deleted' marker
 */
function annotateBlocks(
  versionBlocks: BlockData[],
  currentBlocks: BlockData[],
  diffs: Map<string, import('../hooks/useVersionHistory').BlockDiffType>,
): BlockData[] {
  if (diffs.size === 0) return currentBlocks;

  const versionMap = new Map(versionBlocks.map(b => [b.id, b]));

  // Step 1: Start from current blocks, annotate modified ones with inline diff
  const result: BlockData[] = currentBlocks.map(block => {
    const diffType = diffs.get(block.id);
    if (diffType !== 'modified') return block;

    const old = versionMap.get(block.id);
    if (!old) return block;

    // Text-based blocks: inline diff (old → current)
    if (['text', 'h1', 'h2', 'h3', 'bullet_list', 'numbered_list'].includes(block.type)) {
      const oldText = stripHtml(old.content);
      const newText = stripHtml(block.content);
      if (oldText === newText) return block;
      return { ...block, content: wordDiff(oldText, newText) };
    }

    // Design blocks: inline diff on each editable value
    if (block.type === 'design_block' && block.designBlockData && old.designBlockData) {
      const oldVals = old.designBlockData.values;
      const newVals = block.designBlockData.values;
      const annotatedValues: Record<string, string> = { ...newVals };

      for (const key of Object.keys(newVals)) {
        const oldText = stripHtml(oldVals[key] || '');
        const newText = stripHtml(newVals[key] || '');
        if (oldText !== newText) {
          annotatedValues[key] = wordDiff(oldText, newText);
        }
      }

      return {
        ...block,
        designBlockData: { ...block.designBlockData, values: annotatedValues },
      };
    }

    return block;
  });

  // Step 2: Inject deleted blocks (in old version but not in current) at approximate positions
  const currentIds = new Set(currentBlocks.map(b => b.id));
  const deletedBlocks = versionBlocks.filter(b => !currentIds.has(b.id));

  for (const deleted of deletedBlocks) {
    const idxInVersion = versionBlocks.indexOf(deleted);
    // Find the closest preceding block that exists in the result
    let insertAfterIdx = -1;
    for (let k = idxInVersion - 1; k >= 0; k--) {
      const prevId = versionBlocks[k].id;
      const found = result.findIndex(b => b.id === prevId);
      if (found !== -1) { insertAfterIdx = found; break; }
    }
    result.splice(insertAfterIdx + 1, 0, deleted);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VersionHistoryOverlayProps {
  versionHistory: UseVersionHistoryReturn;
  currentBlocks: BlockData[];
  pageConfigProp?: PageConfig;
  documentFont: string;
  documentFontSize: number;
  onRestore: (blocks: BlockData[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VersionHistoryOverlay: React.FC<VersionHistoryOverlayProps> = ({
  versionHistory,
  currentBlocks,
  pageConfigProp,
  documentFont,
  documentFontSize,
  onRestore,
}) => {
  const {
    versions, loading, selectedVersion, selectVersion,
    highlightChanges, toggleHighlightChanges, restore, close, blockDiffs,
  } = versionHistory;

  const pageConfig = useMemo(() => resolvePageConfig(pageConfigProp), [pageConfigProp]);
  const pageContentHeight = getContentHeight(pageConfig);

  // Blocks to display: selected version or current
  const rawDisplayBlocks = selectedVersion ? selectedVersion.blocks : currentBlocks;

  // Apply inline word-level diff annotations to modified blocks
  const displayBlocks = useMemo(() => {
    if (!highlightChanges || !selectedVersion) return rawDisplayBlocks;
    return annotateBlocks(rawDisplayBlocks, currentBlocks, blockDiffs);
  }, [rawDisplayBlocks, currentBlocks, blockDiffs, highlightChanges, selectedVersion]);

  // Paginate for display
  const pages = useMemo(
    () => paginateBlocks(displayBlocks, pageContentHeight),
    [displayBlocks, pageContentHeight],
  );

  // Compute list numbers and design auto-numbers for display blocks
  const { listNumbers, autoNumbers } = useMemo(() => {
    const listNums: Record<string, number> = {};
    const autoNums: Record<string, string> = {};
    let headingCount = 0;
    let subCount = 0;

    displayBlocks.forEach((block, i) => {
      listNums[block.id] = getListNumber(block, displayBlocks, i);

      if (block.type === 'design_block' && block.designBlockData) {
        const tpl = getTemplate(block.designBlockData.templateId);
        if (tpl?.autonumber === 'heading') {
          headingCount++;
          subCount = 0;
          autoNums[block.id] = String(headingCount);
        } else if (tpl?.autonumber === 'subheading') {
          subCount++;
          autoNums[block.id] = `${headingCount || 1}.${subCount}`;
        }
      }
    });

    return { listNumbers: listNums, autoNumbers: autoNums };
  }, [displayBlocks]);

  // Scroll container ref
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mobile sidebar bottom sheet
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Zoom state (simple, starts at fit)
  const [zoom, setZoom] = useState(1);

  // Auto-fit zoom on mount
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const isMobile = window.innerWidth < 768;
    const sidebarW = isMobile ? 0 : 320;
    const available = scrollEl.clientWidth - sidebarW;
    const ratio = available / (pageConfig.width + 48);
    setZoom(Math.min(1, Math.max(0.3, ratio)));
  }, [pageConfig.width]);

  const handleRestore = useCallback(() => {
    const blocks = restore();
    if (blocks) {
      onRestore(blocks);
      close();
    }
  }, [restore, onRestore, close]);

  // Format header date
  const headerDate = selectedVersion
    ? formatFullDate(selectedVersion.created_at)
    : 'Versão atual';

  const grouped = useMemo(() => groupByMonth(versions), [versions]);

  // Shared version list content (used by both desktop sidebar and mobile bottom sheet)
  const versionListContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhuma versão anterior encontrada.
        </p>
      ) : (
        <>
          {/* Current version entry */}
          <div className="mb-2">
            <button
              onClick={() => { selectVersion(null); setMobileSidebarOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                !selectedVersion ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-medium text-gray-800">Versão atual</div>
              <div className="text-xs text-gray-500 mt-0.5">Estado atual do documento</div>
            </button>
          </div>

          {/* Grouped versions */}
          {grouped.map(group => (
            <div key={group.label} className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {group.label}
              </div>
              {group.items.map(version => {
                const isSelected = selectedVersion?.id === version.id;
                return (
                  <button
                    key={version.id}
                    onClick={() => { selectVersion(version); setMobileSidebarOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-800">
                      {formatVersionDate(version.created_at)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: version.user_color }}
                      />
                      <span className="text-xs text-gray-500">{version.user_name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </>
  );

  const highlightToggle = (
    <div className="px-4 py-3 border-t border-gray-100">
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            highlightChanges ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
          }`}
          onClick={toggleHighlightChanges}
        >
          {highlightChanges && <Check size={12} className="text-white" />}
        </div>
        <span className="text-sm text-gray-700 select-none" onClick={toggleHighlightChanges}>
          Destacar mudanças
        </span>
      </label>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100" style={{ zIndex: 200 }}>
      {/* --- Top bar --- */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={close}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 shrink-0"
          title="Voltar ao editor"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-xs md:text-sm text-gray-700 font-medium truncate">{headerDate}</span>
        {selectedVersion && (
          <button
            onClick={handleRestore}
            className="ml-auto md:ml-2 shrink-0 px-3 md:px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-medium rounded-md transition-colors"
          >
            Restaurar
          </button>
        )}
        {/* Mobile: open versions button */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden ml-auto p-1.5 hover:bg-gray-100 rounded-md text-gray-600 shrink-0"
          title="Versões"
        >
          <Clock size={18} />
        </button>
      </div>

      {/* --- Content + Sidebar --- */}
      <div className="flex flex-1 min-h-0">
        {/* --- Document view --- */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto pt-4 md:pt-6 pb-8">
          <div
            className="mx-auto"
            style={{
              width: pageConfig.width,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              fontFamily: documentFont || undefined,
              fontSize: `${documentFontSize}px`,
            }}
          >
            {pages.map((pageBlocks, pageIdx) => (
              <div
                key={pageIdx}
                className="bg-white shadow-lg overflow-hidden"
                style={{
                  width: pageConfig.width,
                  minHeight: pageConfig.height,
                  paddingTop: pageConfig.paddingTop,
                  paddingRight: pageConfig.paddingRight,
                  paddingBottom: pageConfig.paddingBottom,
                  paddingLeft: pageConfig.paddingLeft,
                  marginBottom: 32,
                  boxSizing: 'border-box',
                }}
              >
                {pageBlocks.map(block => {
                  const diff = blockDiffs.get(block.id);
                  const passedDiff = diff === 'deleted' ? 'deleted' : diff === 'added' ? 'added' : undefined;
                  return (
                    <ReadOnlyBlock
                      key={block.id}
                      block={block}
                      listNumber={listNumbers[block.id] || 1}
                      diffType={passedDiff}
                      autoNumber={autoNumbers[block.id]}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* --- Desktop Sidebar --- */}
        <div className="hidden md:flex w-80 shrink-0 bg-white border-l border-gray-200 flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Histórico de versões</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {versionListContent}
          </div>
          {highlightToggle}
        </div>
      </div>

      {/* --- Mobile: Bottom Sheet Backdrop --- */}
      <div
        className={`md:hidden fixed inset-0 bg-black/30 transition-opacity duration-200 ${
          mobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 210 }}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* --- Mobile: Bottom Sheet --- */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 transition-transform duration-300 ease-out ${
          mobileSidebarOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ zIndex: 211 }}
      >
        <div className="bg-white rounded-t-2xl shadow-xl max-h-[75vh] flex flex-col">
          {/* Handle + header */}
          <div className="shrink-0 pt-3 pb-2 px-5">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-800">Histórico de versões</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Scrollable version list */}
          <div className="overflow-y-auto border-t border-gray-100 px-2 py-2 pb-safe">
            {versionListContent}
          </div>

          {/* Highlight toggle */}
          {highlightToggle}
        </div>
      </div>
    </div>
  );
};
