'use client';

import React, { useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, Palette, ChevronRight, ArrowUp, ArrowDown,
  Copy, XCircle, TableProperties
} from 'lucide-react';
import { BlockData } from '../types';
import { useTableBlock } from '../hooks/useTableBlock';
import { TABLE_TEXT_COLORS as TEXT_COLORS, TABLE_BG_COLORS as BG_COLORS } from '../constants';

// --- Helpers ---

function getSelectionBounds(cells: Set<string>) {
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  cells.forEach(k => {
    const [r, c] = k.split('-').map(Number);
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  });
  return { minR, maxR, minC, maxC };
}

// --- Component ---

interface TableBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export const TableBlock: React.FC<TableBlockProps> = (props) => {
  if (!props.block.tableData) return null;
  return <TableBlockInner {...props} />;
};

const TableBlockInner: React.FC<TableBlockProps> = (props) => {
  const {
    rows, columnWidths, hasHeaderRow,
    addRow, addColumn, insertRowBefore, insertRowAfter,
    deleteRow, deleteColumn, duplicateRow, toggleHeaderRow,
    clearCellContents, updateCellColors,
    selectedCells,
    handleCellMouseDown, handleCellMouseEnter,
    handleCellKeyDown, handleCellInput, handleCellBlur,
    contextMenu, setContextMenu, colorSubmenu, setColorSubmenu, handleContextMenu,
    handleResizeStart,
    isHovered, handleMouseEnter, handleMouseLeave,
    tableRef,
  } = useTableBlock(props);

  const { block } = props;
  const hasMultiSelection = selectedCells.size > 1;
  const selBounds = hasMultiSelection ? getSelectionBounds(selectedCells) : null;

  // Dynamic context menu positioning
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let top = contextMenu.y;
    let left = contextMenu.x;

    if (top + rect.height > vh) {
      top = Math.max(4, contextMenu.y - rect.height);
    }
    if (left + rect.width > vw) {
      left = Math.max(4, vw - rect.width - 4);
    }
    setMenuPos({ left, top });
  }, [contextMenu]);

  // Dynamic color submenu positioning
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const colorTriggerRef = useRef<HTMLDivElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!colorSubmenu || !colorMenuRef.current || !contextMenuRef.current) {
      setColorMenuPos(null);
      return;
    }
    const mainRect = contextMenuRef.current.getBoundingClientRect();
    const colorRect = colorMenuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Position to the right of the main menu
    let left = mainRect.right + 2;
    if (left + colorRect.width > vw) {
      left = Math.max(4, mainRect.left - colorRect.width - 2);
    }

    // Align top with the "Cor" trigger, but clamp to viewport
    const triggerRect = colorTriggerRef.current?.getBoundingClientRect();
    let top = triggerRect ? triggerRect.top : mainRect.top;
    if (top + colorRect.height > vh) {
      top = Math.max(4, vh - colorRect.height - 4);
    }

    setColorMenuPos({ left, top });
  }, [colorSubmenu]);

  return (
    <div
      className="relative my-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <table
        ref={tableRef}
        className={`w-full border-collapse border border-gray-200 ${hasMultiSelection ? 'select-none' : ''}`}
        style={{ tableLayout: 'fixed' }}
      >
        <colgroup>
          {columnWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => {
                const cellKey = `${rowIdx}-${colIdx}`;
                const isSelected = selectedCells.has(cellKey);
                const isHeader = hasHeaderRow && rowIdx === 0;

                // Selection outline: only draw borders on the edges of the rectangle
                let selShadow: string | undefined;
                if (isSelected && selBounds) {
                  const parts: string[] = [];
                  if (rowIdx === selBounds.minR) parts.push('inset 0 2px 0 0 #3b82f6');
                  if (rowIdx === selBounds.maxR) parts.push('inset 0 -2px 0 0 #3b82f6');
                  if (colIdx === selBounds.minC) parts.push('inset 2px 0 0 0 #3b82f6');
                  if (colIdx === selBounds.maxC) parts.push('inset -2px 0 0 0 #3b82f6');
                  if (parts.length > 0) selShadow = parts.join(', ');
                }

                return (
                  <td
                    key={colIdx}
                    className={`border border-gray-200 relative ${
                      !selShadow ? 'has-focus:shadow-[inset_0_0_0_2px_#3b82f6]' : ''
                    } ${isHeader ? 'font-medium' : ''}`}
                    style={{
                      backgroundColor: cell.bgColor || (isHeader ? '#F9FAFB' : 'white'),
                      boxShadow: selShadow,
                    }}
                    onMouseDown={e => handleCellMouseDown(e, rowIdx, colIdx)}
                    onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                  >
                    <div
                      data-table-cell={`${block.id}-${rowIdx}-${colIdx}`}
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none px-2 py-1.5 text-sm min-h-7 wrap-break-word"
                      style={{ color: cell.textColor || '#374151' }}
                      onContextMenu={e => handleContextMenu(e, rowIdx, colIdx)}
                      onInput={e => handleCellInput(rowIdx, colIdx, e.currentTarget as HTMLDivElement)}
                      onBlur={e => handleCellBlur(rowIdx, colIdx, e.currentTarget)}
                      onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                    />
                    {colIdx < columnWidths.length - 1 && (
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 z-10"
                        style={{ transform: 'translateX(50%)' }}
                        onMouseDown={e => handleResizeStart(e, colIdx)}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add column button */}
      {isHovered && (
        <button
          className="absolute -right-7 top-1/2 -translate-y-1/2 z-30 w-5 h-5 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-sm transition-colors"
          onClick={addColumn}
          onMouseEnter={handleMouseEnter}
          title="Adicionar coluna"
        >
          <Plus size={12} />
        </button>
      )}

      {/* Add row button */}
      {isHovered && (
        <button
          className="absolute left-1/2 -translate-x-1/2 -bottom-7 z-30 w-5 h-5 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-sm transition-colors"
          onClick={addRow}
          onMouseEnter={handleMouseEnter}
          title="Adicionar linha"
        >
          <Plus size={12} />
        </button>
      )}

      {/* Context menu — rendered via portal to escape transform containing block */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          data-table-context-menu
          className="fixed bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-52 z-50"
          style={{
            left: menuPos ? menuPos.left : contextMenu.x,
            top: menuPos ? menuPos.top : contextMenu.y,
            visibility: menuPos ? 'visible' : 'hidden',
          }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header row toggle */}
          <button
            className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors"
            onClick={() => { toggleHeaderRow(); setContextMenu(null); }}
          >
            <span className="flex items-center gap-2">
              <TableProperties size={14} className="text-gray-500" />
              Linha do cabeçalho
            </span>
            <div className={`w-8 h-4.5 rounded-full transition-colors flex items-center ${
              hasHeaderRow ? 'bg-blue-500 justify-end' : 'bg-gray-300 justify-start'
            }`}>
              <div className="w-3.5 h-3.5 rounded-full bg-white mx-0.5 shadow-sm" />
            </div>
          </button>

          {/* Color submenu trigger */}
          <div
            ref={colorTriggerRef}
            className="relative"
            onMouseEnter={() => setColorSubmenu(true)}
            onMouseLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (colorMenuRef.current && related && colorMenuRef.current.contains(related)) return;
              setColorSubmenu(false);
            }}
          >
            <button className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors">
              <span className="flex items-center gap-2">
                <Palette size={14} className="text-gray-500" />
                Cor
              </span>
              <ChevronRight size={14} className="text-gray-400" />
            </button>

            {colorSubmenu && (
              <div
                ref={colorMenuRef}
                data-table-context-menu
                className="fixed bg-white shadow-xl border border-gray-200 rounded-lg py-2 w-52 z-50 max-h-[70vh] overflow-y-auto"
                style={{
                  left: colorMenuPos ? colorMenuPos.left : undefined,
                  top: colorMenuPos ? colorMenuPos.top : undefined,
                  visibility: colorMenuPos ? 'visible' : 'hidden',
                }}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={e => e.stopPropagation()}
                onMouseLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (colorTriggerRef.current && related && colorTriggerRef.current.contains(related)) return;
                  setColorSubmenu(false);
                }}
              >
                <div className="px-3 pb-1 text-xs font-medium text-gray-500">Cor do texto</div>
                {TEXT_COLORS.map(c => (
                  <button
                    key={c.name}
                    className="flex items-center gap-2.5 w-full px-3 py-1 text-sm text-left hover:bg-gray-100 transition-colors"
                    onClick={() => {
                      updateCellColors(contextMenu.targetCells, { textColor: c.value });
                      setContextMenu(null);
                    }}
                  >
                    <span
                      className="w-5 h-5 flex items-center justify-center rounded font-bold text-sm border border-gray-200"
                      style={{ color: c.preview }}
                    >A</span>
                    {c.name}
                  </button>
                ))}

                <div className="border-t border-gray-200 my-1.5" />

                <div className="px-3 pb-1 text-xs font-medium text-gray-500">Cor de fundo</div>
                {BG_COLORS.map(c => (
                  <button
                    key={c.name}
                    className="flex items-center gap-2.5 w-full px-3 py-1 text-sm text-left hover:bg-gray-100 transition-colors"
                    onClick={() => {
                      updateCellColors(contextMenu.targetCells, { bgColor: c.value });
                      setContextMenu(null);
                    }}
                  >
                    <span
                      className="w-5 h-5 rounded border border-gray-200"
                      style={{ backgroundColor: c.preview }}
                    />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 my-1" />

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors"
            onClick={() => { insertRowBefore(contextMenu.rowIdx); setContextMenu(null); }}
          >
            <ArrowUp size={14} className="text-gray-500" />
            Inserir acima
          </button>

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors"
            onClick={() => { insertRowAfter(contextMenu.rowIdx); setContextMenu(null); }}
          >
            <ArrowDown size={14} className="text-gray-500" />
            Inserir abaixo
          </button>

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors"
            onClick={() => { duplicateRow(contextMenu.rowIdx); setContextMenu(null); }}
          >
            <Copy size={14} className="text-gray-500" />
            Duplicar
          </button>

          <div className="border-t border-gray-200 my-1" />

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 transition-colors"
            onClick={() => { clearCellContents(contextMenu.targetCells); setContextMenu(null); }}
          >
            <XCircle size={14} className="text-gray-500" />
            Apagar conteúdo
          </button>

          <div className="border-t border-gray-200 my-1" />

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => { deleteRow(contextMenu.rowIdx); setContextMenu(null); }}
            disabled={rows.length <= 1}
          >
            <Trash2 size={14} />
            Deletar linha
          </button>

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => { deleteColumn(contextMenu.colIdx); setContextMenu(null); }}
            disabled={columnWidths.length <= 1}
          >
            <Trash2 size={14} />
            Deletar coluna
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};
