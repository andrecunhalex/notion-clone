import { useState, useCallback, useRef, useEffect } from 'react';
import { BlockData, TableData, TableCellData } from '../types';

interface CellCoord { row: number; col: number }

export interface ContextMenuState {
  x: number;
  y: number;
  rowIdx: number;
  colIdx: number;
  targetCells: Set<string>;
}

interface UseTableBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  onNavigateOut?: (direction: 'up' | 'down') => void;
}

export const useTableBlock = ({ block, updateBlock, onNavigateOut }: UseTableBlockProps) => {
  const tableData = block.tableData!;
  const { rows, columnWidths, hasHeaderRow } = tableData;

  const tableRef = useRef<HTMLTableElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [colorSubmenu, setColorSubmenu] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  const resizeStartX = useRef(0);
  const resizeStartWidths = useRef<number[]>([]);
  const lastSyncedData = useRef<TableCellData[][] | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionAnchor = useRef<CellCoord | null>(null);
  const selectionCursor = useRef<CellCoord | null>(null);
  const isMouseDown = useRef(false);
  const selectedCellsRef = useRef(selectedCells);
  selectedCellsRef.current = selectedCells;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colCountRef = useRef(columnWidths.length);
  colCountRef.current = columnWidths.length;

  // Reset selection refs when selection is cleared
  useEffect(() => {
    if (selectedCells.size === 0) {
      selectionAnchor.current = null;
      selectionCursor.current = null;
    }
  }, [selectedCells.size]);

  // --- Table data operations ---

  const updateTableData = useCallback((newData: Partial<TableData>) => {
    updateBlock(block.id, { tableData: { ...tableData, ...newData } });
  }, [block.id, tableData, updateBlock]);

  const addColumn = useCallback(() => {
    const n = columnWidths.length + 1;
    updateTableData({
      rows: rows.map(row => [...row, { content: '' }]),
      columnWidths: Array(n).fill(100 / n),
    });
  }, [rows, columnWidths, updateTableData]);

  const addRow = useCallback(() => {
    const newRow = Array.from({ length: columnWidths.length }, () => ({ content: '' } as TableCellData));
    updateTableData({ rows: [...rows, newRow] });
  }, [rows, columnWidths.length, updateTableData]);

  const insertRowBefore = useCallback((idx: number) => {
    const newRow = Array.from({ length: columnWidths.length }, () => ({ content: '' } as TableCellData));
    const r = [...rows]; r.splice(idx, 0, newRow);
    updateTableData({ rows: r });
  }, [rows, columnWidths.length, updateTableData]);

  const insertRowAfter = useCallback((idx: number) => {
    const newRow = Array.from({ length: columnWidths.length }, () => ({ content: '' } as TableCellData));
    const r = [...rows]; r.splice(idx + 1, 0, newRow);
    updateTableData({ rows: r });
  }, [rows, columnWidths.length, updateTableData]);

  const deleteRow = useCallback((idx: number) => {
    if (rows.length <= 1) return;
    updateTableData({ rows: rows.filter((_, i) => i !== idx) });
  }, [rows, updateTableData]);

  const deleteColumn = useCallback((idx: number) => {
    if (columnWidths.length <= 1) return;
    const n = columnWidths.length - 1;
    updateTableData({
      rows: rows.map(row => row.filter((_, i) => i !== idx)),
      columnWidths: Array(n).fill(100 / n),
    });
  }, [rows, columnWidths, updateTableData]);

  const duplicateRow = useCallback((idx: number) => {
    const r = [...rows];
    r.splice(idx + 1, 0, rows[idx].map(c => ({ ...c })));
    updateTableData({ rows: r });
  }, [rows, updateTableData]);

  const toggleHeaderRow = useCallback(() => {
    updateTableData({ hasHeaderRow: !hasHeaderRow });
  }, [hasHeaderRow, updateTableData]);

  const clearCellContents = useCallback((cellKeys: Set<string>) => {
    if (cellKeys.size === 0) return;
    const newRows = rows.map((row, ri) =>
      row.map((cell, ci) =>
        cellKeys.has(`${ri}-${ci}`) ? { ...cell, content: '' } : cell
      )
    );
    cellKeys.forEach(key => {
      const el = document.querySelector(`[data-table-cell="${block.id}-${key}"]`) as HTMLElement;
      if (el) el.innerHTML = '';
    });
    lastSyncedData.current = newRows;
    updateTableData({ rows: newRows });
  }, [rows, block.id, updateTableData]);

  const updateCellColors = useCallback((cellKeys: Set<string>, updates: { bgColor?: string; textColor?: string }) => {
    if (cellKeys.size === 0) return;
    const newRows = rows.map((row, ri) =>
      row.map((cell, ci) => {
        if (!cellKeys.has(`${ri}-${ci}`)) return cell;
        const updated = { ...cell };
        if ('bgColor' in updates) updated.bgColor = updates.bgColor || undefined;
        if ('textColor' in updates) updated.textColor = updates.textColor || undefined;
        return updated;
      })
    );
    lastSyncedData.current = newRows;
    updateTableData({ rows: newRows });
  }, [rows, updateTableData]);

  // --- Hover ---

  const handleMouseEnter = useCallback(() => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setIsHovered(false), 250);
  }, []);

  // --- Cell selection ---

  const computeRect = useCallback((a: CellCoord, b: CellCoord): Set<string> => {
    const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
    const s = new Set<string>();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        s.add(`${r}-${c}`);
    return s;
  }, []);

  const handleCellMouseDown = useCallback((e: React.MouseEvent, row: number, col: number) => {
    if (e.button !== 0) return;
    if (selectedCellsRef.current.size > 1) setSelectedCells(new Set());
    selectionAnchor.current = { row, col };
    selectionCursor.current = { row, col };
    isMouseDown.current = true;
  }, []);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isMouseDown.current || !selectionAnchor.current) return;
    const anchor = selectionAnchor.current;
    if (anchor.row === row && anchor.col === col) {
      setSelectedCells(new Set());
      return;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    selectionCursor.current = { row, col };
    setSelectedCells(computeRect(anchor, { row, col }));
  }, [computeRect]);

  // Mouse up
  useEffect(() => {
    const onUp = () => {
      if (isMouseDown.current) {
        isMouseDown.current = false;
        if (selectionAnchor.current && selectedCellsRef.current.size <= 1) {
          setSelectedCells(new Set());
        }
      }
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // Click outside table clears selection
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (selectedCellsRef.current.size === 0) return;
      const wrapper = tableRef.current?.parentElement;
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setSelectedCells(new Set());
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // --- Keyboard for selected cells (not editing) ---

  const clearRef = useRef(clearCellContents);
  clearRef.current = clearCellContents;
  const computeRectRef = useRef(computeRect);
  computeRectRef.current = computeRect;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cells = selectedCellsRef.current;
      if (cells.size === 0) return;
      const active = document.activeElement;
      if (active && active.hasAttribute('data-table-cell')) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        clearRef.current(cells);
      }
      if (e.key === 'Escape') {
        setSelectedCells(new Set());
      }

      // Shift+Arrow extends selection
      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (!selectionAnchor.current || !selectionCursor.current) return;
        const c = { ...selectionCursor.current };
        if (e.key === 'ArrowUp') c.row = Math.max(0, c.row - 1);
        if (e.key === 'ArrowDown') c.row = Math.min(rowsRef.current.length - 1, c.row + 1);
        if (e.key === 'ArrowLeft') c.col = Math.max(0, c.col - 1);
        if (e.key === 'ArrowRight') c.col = Math.min(colCountRef.current - 1, c.col + 1);
        selectionCursor.current = c;
        setSelectedCells(computeRectRef.current(selectionAnchor.current, c));
      }

      // Arrow without shift: clear selection, focus cell at cursor
      if (!e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const cursor = selectionCursor.current;
        setSelectedCells(new Set());
        if (cursor) {
          const el = document.querySelector(
            `[data-table-cell="${block.id}-${cursor.row}-${cursor.col}"]`
          ) as HTMLElement;
          el?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [block.id]);

  // --- Cell content save (on input and blur) ---

  const handleCellInput = useCallback((rowIdx: number, colIdx: number, el: HTMLDivElement) => {
    const content = el.innerHTML;
    const newRows = rows.map((row, ri) =>
      row.map((cell, ci) =>
        ri === rowIdx && ci === colIdx ? { ...cell, content } : cell
      )
    );
    lastSyncedData.current = newRows;
    updateTableData({ rows: newRows });
  }, [rows, updateTableData]);

  const handleCellBlur = useCallback((rowIdx: number, colIdx: number, el: HTMLDivElement) => {
    handleCellInput(rowIdx, colIdx, el);
  }, [handleCellInput]);

  // --- Keyboard navigation (in edit mode) ---

  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLDivElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    // Shift+Arrow: start/extend selection from current cell
    if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).blur();

      if (!selectionAnchor.current) {
        selectionAnchor.current = { row: rowIdx, col: colIdx };
      }
      const cursor = selectionCursor.current || { row: rowIdx, col: colIdx };
      const nc = { ...cursor };
      if (e.key === 'ArrowUp') nc.row = Math.max(0, cursor.row - 1);
      if (e.key === 'ArrowDown') nc.row = Math.min(rows.length - 1, cursor.row + 1);
      if (e.key === 'ArrowLeft') nc.col = Math.max(0, cursor.col - 1);
      if (e.key === 'ArrowRight') nc.col = Math.min(columnWidths.length - 1, cursor.col + 1);
      selectionCursor.current = nc;
      setSelectedCells(computeRect(selectionAnchor.current, nc));
      return;
    }

    if (e.key === '/') e.stopPropagation();

    if (e.key === 'Enter') {
      e.stopPropagation();
      if (!e.shiftKey) {
        e.preventDefault();
        const nr = rowIdx + 1;
        if (nr < rows.length)
          (document.querySelector(`[data-table-cell="${block.id}-${nr}-${colIdx}"]`) as HTMLElement)?.focus();
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      let nr = rowIdx, nc = colIdx;
      if (e.shiftKey) { nc--; if (nc < 0) { nr--; nc = columnWidths.length - 1; } }
      else { nc++; if (nc >= columnWidths.length) { nr++; nc = 0; } }
      if (nr >= 0 && nr < rows.length)
        (document.querySelector(`[data-table-cell="${block.id}-${nr}-${nc}"]`) as HTMLElement)?.focus();
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nr = rowIdx + 1;
      if (nr < rows.length)
        (document.querySelector(`[data-table-cell="${block.id}-${nr}-${colIdx}"]`) as HTMLElement)?.focus();
      else onNavigateOut?.('down');
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const pr = rowIdx - 1;
      if (pr >= 0)
        (document.querySelector(`[data-table-cell="${block.id}-${pr}-${colIdx}"]`) as HTMLElement)?.focus();
      else onNavigateOut?.('up');
    }

    if (e.key === 'ArrowLeft') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
        e.preventDefault();
        let pc = colIdx - 1, pr = rowIdx;
        if (pc < 0) { pr--; pc = columnWidths.length - 1; }
        if (pr >= 0)
          (document.querySelector(`[data-table-cell="${block.id}-${pr}-${pc}"]`) as HTMLElement)?.focus();
        else onNavigateOut?.('up');
      }
    }

    if (e.key === 'ArrowRight') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed) {
        const len = e.currentTarget.textContent?.length ?? 0;
        if (sel.anchorOffset >= len) {
          e.preventDefault();
          let nc = colIdx + 1, nr = rowIdx;
          if (nc >= columnWidths.length) { nr++; nc = 0; }
          if (nr < rows.length)
            (document.querySelector(`[data-table-cell="${block.id}-${nr}-${nc}"]`) as HTMLElement)?.focus();
          else onNavigateOut?.('down');
        }
      }
    }
  }, [block.id, rows, columnWidths.length, onNavigateOut, computeRect]);

  // --- Context menu ---

  const handleContextMenu = useCallback((e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `${rowIdx}-${colIdx}`;
    const current = selectedCellsRef.current;
    const cells = current.has(key) && current.size > 0
      ? new Set(current)
      : new Set([key]);
    setSelectedCells(cells);
    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx, targetCells: cells });
    setColorSubmenu(false);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => { setContextMenu(null); setColorSubmenu(false); };
    window.addEventListener('click', close);

    // Block page scroll while context menu is open
    const origOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const preventScroll = (e: Event) => {
      const menuEl = document.querySelector('[data-table-context-menu]');
      if (menuEl && menuEl.contains(e.target as Node)) return;
      e.preventDefault();
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      window.removeEventListener('click', close);
      document.documentElement.style.overflow = origOverflow;
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, [contextMenu]);

  // --- Column resize ---

  const handleResizeStart = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    setResizingCol(colIdx);
    resizeStartX.current = e.clientX;
    resizeStartWidths.current = [...columnWidths];
  }, [columnWidths]);

  useEffect(() => {
    if (resizingCol === null) return;
    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!tableRef.current) return;
        const tw = tableRef.current.offsetWidth;
        const d = ((e.clientX - resizeStartX.current) / tw) * 100;
        const w = [...resizeStartWidths.current];
        const nL = w[resizingCol] + d, nR = w[resizingCol + 1] - d;
        if (nL >= 5 && nR >= 5) { w[resizingCol] = nL; w[resizingCol + 1] = nR; updateTableData({ columnWidths: w }); }
      });
    };
    const onUp = () => { cancelAnimationFrame(rafId); setResizingCol(null); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { cancelAnimationFrame(rafId); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizingCol, updateTableData]);

  // --- DOM sync (external changes only — undo/redo, paste) ---

  useEffect(() => {
    // Skip sync when we just saved from input (lastSyncedData matches current)
    if (lastSyncedData.current === rows) return;
    lastSyncedData.current = rows;
    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const el = document.querySelector(`[data-table-cell="${block.id}-${ri}-${ci}"]`) as HTMLElement;
        if (el) {
          const target = cell.content.replace(/\n/g, '<br>');
          if (el.innerHTML !== target) el.innerHTML = target;
        }
      });
    });
  }, [rows, block.id]);

  return {
    rows, columnWidths, hasHeaderRow,
    updateTableData, addRow, addColumn,
    insertRowBefore, insertRowAfter, deleteRow, deleteColumn,
    duplicateRow, toggleHeaderRow, clearCellContents, updateCellColors,
    selectedCells, setSelectedCells,
    handleCellMouseDown, handleCellMouseEnter,
    handleCellKeyDown, handleCellInput, handleCellBlur,
    contextMenu, setContextMenu, colorSubmenu, setColorSubmenu, handleContextMenu,
    resizingCol, handleResizeStart,
    isHovered, handleMouseEnter, handleMouseLeave,
    tableRef,
  };
};
