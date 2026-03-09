'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BlockData, TableData } from '../types';

interface TableBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

interface ContextMenu {
  x: number;
  y: number;
  rowIdx: number;
  colIdx: number;
}

export const TableBlock: React.FC<TableBlockProps> = ({ block, updateBlock, onNavigateOut }) => {
  const tableData = block.tableData;
  const tableRef = useRef<HTMLTableElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidths = useRef<number[]>([]);
  const lastSyncedData = useRef<string>('');
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setIsHovered(false), 250);
  }, []);

  if (!tableData) return null;

  const { rows, columnWidths, hasHeaderRow } = tableData;

  const updateTableData = useCallback((newData: Partial<TableData>) => {
    updateBlock(block.id, {
      tableData: { ...tableData, ...newData },
    });
  }, [block.id, tableData, updateBlock]);

  // Sync cell DOM content from tableData (for undo/redo/external changes)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const dataKey = JSON.stringify(rows);
    if (lastSyncedData.current === dataKey) return;
    lastSyncedData.current = dataKey;

    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const el = document.querySelector(
          `[data-table-cell="${block.id}-${ri}-${ci}"]`
        ) as HTMLElement;
        if (el) {
          const currentHtml = el.innerHTML;
          const targetHtml = cell.content.replace(/\n/g, '<br>');
          if (currentHtml !== targetHtml) {
            el.innerHTML = targetHtml;
          }
        }
      });
    });
  }, [rows, block.id]);

  // Close context menu on outside click
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const handleCellBlur = useCallback((rowIdx: number, colIdx: number, el: HTMLDivElement) => {
    const content = el.innerHTML;
    const newRows = rows.map((row, ri) =>
      row.map((cell, ci) =>
        ri === rowIdx && ci === colIdx ? { content } : cell
      )
    );
    lastSyncedData.current = JSON.stringify(newRows);
    updateTableData({ rows: newRows });
  }, [rows, updateTableData]);

  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLDivElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    if (e.key === '/') {
      e.stopPropagation();
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
      if (!e.shiftKey) {
        e.preventDefault();
        const nextRow = rowIdx + 1;
        if (nextRow < rows.length) {
          const nextCell = document.querySelector(
            `[data-table-cell="${block.id}-${nextRow}-${colIdx}"]`
          ) as HTMLElement;
          nextCell?.focus();
        }
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();

      let nextRow = rowIdx;
      let nextCol = colIdx;

      if (e.shiftKey) {
        nextCol--;
        if (nextCol < 0) {
          nextRow--;
          nextCol = columnWidths.length - 1;
        }
      } else {
        nextCol++;
        if (nextCol >= columnWidths.length) {
          nextRow++;
          nextCol = 0;
        }
      }

      if (nextRow >= 0 && nextRow < rows.length) {
        const nextCell = document.querySelector(
          `[data-table-cell="${block.id}-${nextRow}-${nextCol}"]`
        ) as HTMLElement;
        nextCell?.focus();
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = rowIdx + 1;
      if (nextRow < rows.length) {
        const nextCell = document.querySelector(
          `[data-table-cell="${block.id}-${nextRow}-${colIdx}"]`
        ) as HTMLElement;
        nextCell?.focus();
      } else {
        onNavigateOut?.('down');
      }
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = rowIdx - 1;
      if (prevRow >= 0) {
        const prevCell = document.querySelector(
          `[data-table-cell="${block.id}-${prevRow}-${colIdx}"]`
        ) as HTMLElement;
        prevCell?.focus();
      } else {
        onNavigateOut?.('up');
      }
    }

    if (e.key === 'ArrowLeft') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
        e.preventDefault();
        let prevCol = colIdx - 1;
        let prevRow = rowIdx;
        if (prevCol < 0) {
          prevRow--;
          prevCol = columnWidths.length - 1;
        }
        if (prevRow >= 0) {
          const prevCell = document.querySelector(
            `[data-table-cell="${block.id}-${prevRow}-${prevCol}"]`
          ) as HTMLElement;
          prevCell?.focus();
        } else {
          onNavigateOut?.('up');
        }
      }
    }

    if (e.key === 'ArrowRight') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed) {
        const textLen = e.currentTarget.textContent?.length ?? 0;
        if (sel.anchorOffset >= textLen) {
          e.preventDefault();
          let nextCol = colIdx + 1;
          let nextRow = rowIdx;
          if (nextCol >= columnWidths.length) {
            nextRow++;
            nextCol = 0;
          }
          if (nextRow < rows.length) {
            const nextCell = document.querySelector(
              `[data-table-cell="${block.id}-${nextRow}-${nextCol}"]`
            ) as HTMLElement;
            nextCell?.focus();
          } else {
            onNavigateOut?.('down');
          }
        }
      }
    }
  }, [block.id, rows, columnWidths.length, onNavigateOut]);

  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    rowIdx: number,
    colIdx: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx });
  }, []);

  const addColumn = useCallback(() => {
    const newColCount = columnWidths.length + 1;
    const newWidths = Array(newColCount).fill(100 / newColCount);
    const newRows = rows.map(row => [...row, { content: '' }]);
    updateTableData({ rows: newRows, columnWidths: newWidths });
  }, [rows, columnWidths, updateTableData]);

  const addRow = useCallback(() => {
    const newRow = Array.from({ length: columnWidths.length }, () => ({ content: '' }));
    updateTableData({ rows: [...rows, newRow] });
  }, [rows, columnWidths.length, updateTableData]);

  const deleteRow = useCallback((rowIdx: number) => {
    if (rows.length <= 1) return; // keep at least 1 row
    const newRows = rows.filter((_, i) => i !== rowIdx);
    updateTableData({ rows: newRows });
    setContextMenu(null);
  }, [rows, updateTableData]);

  const deleteColumn = useCallback((colIdx: number) => {
    if (columnWidths.length <= 1) return; // keep at least 1 column
    const newRows = rows.map(row => row.filter((_, i) => i !== colIdx));
    const newColCount = columnWidths.length - 1;
    const newWidths = Array(newColCount).fill(100 / newColCount);
    updateTableData({ rows: newRows, columnWidths: newWidths });
    setContextMenu(null);
  }, [rows, columnWidths, updateTableData]);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colIdx);
    resizeStartX.current = e.clientX;
    resizeStartWidths.current = [...columnWidths];
  }, [columnWidths]);

  useEffect(() => {
    if (resizingCol === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!tableRef.current) return;
      const tableWidth = tableRef.current.offsetWidth;
      const deltaPercent = ((e.clientX - resizeStartX.current) / tableWidth) * 100;
      const newWidths = [...resizeStartWidths.current];
      const minWidth = 5;

      const newLeft = newWidths[resizingCol] + deltaPercent;
      const newRight = newWidths[resizingCol + 1] - deltaPercent;

      if (newLeft >= minWidth && newRight >= minWidth) {
        newWidths[resizingCol] = newLeft;
        newWidths[resizingCol + 1] = newRight;
        updateTableData({ columnWidths: newWidths });
      }
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, updateTableData]);

  return (
    <div
      className="relative my-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >

      <table
        ref={tableRef}
        className="w-full border-collapse border border-gray-200"
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
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className={`border border-gray-200 relative has-focus:shadow-[inset_0_0_0_2px_#3b82f6] ${
                    hasHeaderRow && rowIdx === 0
                      ? 'bg-gray-50 font-medium'
                      : 'bg-white'
                  }`}
                  onContextMenu={e => handleContextMenu(e, rowIdx, colIdx)}
                >
                  <div
                    data-table-cell={`${block.id}-${rowIdx}-${colIdx}`}
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none px-2 py-1.5 text-sm text-gray-700 min-h-[28px] break-words"
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
              ))}
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

      {/* Context menu for delete row/column */}
      {contextMenu && (
        <div
          className="fixed bg-white shadow-xl border border-gray-200 rounded-lg p-1 w-48 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => deleteRow(contextMenu.rowIdx)}
            disabled={rows.length <= 1}
          >
            <Trash2 size={14} />
            Deletar linha
          </button>
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => deleteColumn(contextMenu.colIdx)}
            disabled={columnWidths.length <= 1}
          >
            <Trash2 size={14} />
            Deletar coluna
          </button>
        </div>
      )}
    </div>
  );
};
