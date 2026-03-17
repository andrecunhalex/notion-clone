'use client';

import React, { useState, useRef, useCallback } from 'react';
import { BlockData, SlashMenuState, ViewMode, NotionEditorProps } from './types';
import { getPaginatedBlocks, focusBlock, createDefaultTableData, generateId, isContentEmpty } from './utils';
import {
  useHistory,
  useBlockManager,
  useSelection,
  useDragAndDrop,
  useClipboard,
  useKeyboardShortcuts,
  usePagination
} from './hooks';
import { Block, SlashMenu, Toolbar, SelectionOverlay, FloatingToolbar } from './components';

const DEFAULT_BLOCK: BlockData = { id: 'initial-block', type: 'text', content: '' };

export const NotionEditor: React.FC<NotionEditorProps> = ({
  initialBlocks = [DEFAULT_BLOCK],
  onChange,
  defaultViewMode = 'paginated',
  title = 'MiniNotion'
}) => {
  const [blocks, setBlocksRaw, undoRaw, redoRaw, canUndo, canRedo] = useHistory<BlockData[]>(initialBlocks);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false, x: 0, y: 0, blockId: null
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const {
    selectedIds, setSelectedIds, selectionBox,
    startSelection, clearSelection, didDragSelect
  } = useSelection({ blocks, containerRef, blockRefs });

  // Ref to capture current selectedIds without stale closures
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Wrap setBlocks to save current selection in history before advancing
  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setBlocksRaw(newBlocks, Array.from(selectedIdsRef.current));
    onChange?.(newBlocks);
  }, [setBlocksRaw, onChange]);

  // Wrap undo/redo to also restore selection state
  const undo = useCallback(() => {
    const restoredIds = undoRaw();
    setSelectedIds(new Set(restoredIds));
  }, [undoRaw, setSelectedIds]);

  const redo = useCallback(() => {
    const restoredIds = redoRaw();
    setSelectedIds(new Set(restoredIds));
  }, [redoRaw, setSelectedIds]);

  const { blockHeights, handleHeightChange } = usePagination({ blocks, setBlocks, viewMode });

  const { updateBlock, addBlock, addListBlock, removeBlock, deleteSelectedBlocks, moveBlocks } = useBlockManager({
    blocks, setBlocks
  });

  const {
    dropTarget, handleDragStart, handleDragOver,
    handleContainerDragOver, handleDrop, clearDropTarget
  } = useDragAndDrop({
    blocks, selectedIds, setSelectedIds, blockRefs, moveBlocks
  });

  const { handleCopy, handlePaste } = useClipboard({ blocks, setBlocks, selectedIds, setSelectedIds });

  useKeyboardShortcuts({
    blocks, setBlocks, selectedIds, setSelectedIds,
    undo, redo, handleCopy, handlePaste
  });

  // Único handler de mouse — o resto é via listeners nativos no document
  // NOTE: não usa preventDefault() para não bloquear onClick em Windows
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.notion-block-content') || target.closest('.drag-handle')) return;
    clearSelection();
    setSlashMenu(prev => ({ ...prev, isOpen: false }));
    startSelection(e);
  }, [startSelection, clearSelection]);

  const handleBottomClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearSelection();
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text' && isContentEmpty(lastBlock.content)) {
      focusBlock(lastBlock.id);
    } else {
      addBlock(lastBlock?.id);
    }
  }, [blocks, addBlock, clearSelection]);

  const handlePageClick = useCallback((e: React.MouseEvent, pageBlocks: BlockData[]) => {
    if (e.target !== e.currentTarget) return;
    if (didDragSelect()) return;

    const blocksOnPage = pageBlocks
      .map(b => document.querySelector(`[data-block-id="${b.id}"]`) as HTMLElement | null)
      .filter(Boolean) as HTMLElement[];
    if (blocksOnPage.length === 0) return;

    // Check if click is below the last block on this page
    const lastBlockEl = blocksOnPage[blocksOnPage.length - 1];
    const lastRect = lastBlockEl.getBoundingClientRect();
    if (e.clientY > lastRect.bottom) {
      // Focus last block of THIS page (not the whole document)
      const lastPageBlock = pageBlocks[pageBlocks.length - 1];
      const isLastPage = lastPageBlock.id === blocks[blocks.length - 1].id;

      if (isLastPage) {
        // Last page: create a new block or focus existing empty one
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.type === 'text' && isContentEmpty(lastBlock.content)) {
          focusBlock(lastBlock.id);
        } else {
          addBlock(lastBlock?.id);
        }
      } else {
        // Not the last page: just focus the last block on this page
        focusBlock(lastPageBlock.id);
      }
      return;
    }

    let closest = blocksOnPage[0];
    let minDst = Infinity;
    for (const b of blocksOnPage) {
      const rect = b.getBoundingClientRect();
      let dist = 0;
      if (e.clientY < rect.top) dist = rect.top - e.clientY;
      else if (e.clientY > rect.bottom) dist = e.clientY - rect.bottom;
      if (dist < minDst) { minDst = dist; closest = b; }
    }

    closest.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    if (sel) {
      range.selectNodeContents(closest);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [didDragSelect, blocks, addBlock]);

  const handleSlashMenuSelect = useCallback((type: BlockData['type']) => {
    if (!slashMenu.blockId) return;

    const blockEl = document.getElementById(`editable-${slashMenu.blockId}`);
    let cleanContent = '';

    if (blockEl) {
      // Remove the '/' and any filter text from the DOM directly
      const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      let lastSlashNode: Text | null = null;
      let lastSlashIdx = -1;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.textContent || '';
        const idx = text.lastIndexOf('/');
        if (idx !== -1) {
          lastSlashNode = node;
          lastSlashIdx = idx;
        }
      }
      if (lastSlashNode && lastSlashIdx !== -1) {
        lastSlashNode.deleteData(lastSlashIdx, (lastSlashNode.textContent || '').length - lastSlashIdx);
      }
      cleanContent = blockEl.innerHTML;
      if (isContentEmpty(cleanContent)) cleanContent = '';
    }

    if (type === 'divider') {
      if (blockEl) blockEl.innerHTML = '';
      const idx = blocks.findIndex(b => b.id === slashMenu.blockId);
      const newTextBlock: BlockData = { id: generateId(), type: 'text', content: '' };
      const newBlocks = blocks.map(b => b.id === slashMenu.blockId ? { ...b, type: 'divider' as const, content: '' } : b);
      newBlocks.splice(idx + 1, 0, newTextBlock);
      setBlocks(newBlocks);
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      focusBlock(newTextBlock.id);
    } else if (type === 'image') {
      if (blockEl) blockEl.innerHTML = '';
      const idx = blocks.findIndex(b => b.id === slashMenu.blockId);
      const newTextBlock: BlockData = { id: generateId(), type: 'text', content: '' };
      const newBlocks = blocks.map(b =>
        b.id === slashMenu.blockId
          ? { ...b, type: 'image' as const, content: '', imageData: { src: '', width: 100, alignment: 'center' as const } }
          : b
      );
      newBlocks.splice(idx + 1, 0, newTextBlock);
      setBlocks(newBlocks);
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
    } else if (type === 'table') {
      if (blockEl) blockEl.innerHTML = '';
      updateBlock(slashMenu.blockId, {
        type,
        content: '',
        tableData: createDefaultTableData(),
      });
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      setTimeout(() => {
        const firstCell = document.querySelector(
          `[data-table-cell="${slashMenu.blockId}-0-0"]`
        ) as HTMLElement;
        firstCell?.focus();
      }, 50);
    } else {
      if (blockEl) blockEl.innerHTML = cleanContent;
      updateBlock(slashMenu.blockId, { type, content: cleanContent });
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      focusBlock(slashMenu.blockId);
    }
  }, [slashMenu.blockId, blocks, updateBlock]);

  const pages = getPaginatedBlocks(blocks, blockHeights, viewMode);

  return (
    <div
      className={`min-h-screen text-gray-800 font-sans selection:bg-blue-200 ${
        selectionBox ? 'select-none' : ''
      } ${viewMode === 'paginated' ? 'bg-gray-100' : 'bg-white'}`}
      onMouseDown={handleMouseDown}
      onDragEnd={clearDropTarget}
    >
      <Toolbar
        title={title}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(prev => (prev === 'continuous' ? 'paginated' : 'continuous'))}
      />

      <div
        ref={containerRef}
        className={`mx-auto relative cursor-text transition-all duration-300 ${
          viewMode === 'paginated'
            ? 'pt-8'
            : 'max-w-3xl mt-12 px-12 pb-64 min-h-[80vh]'
        }`}
        onDragOver={handleContainerDragOver}
        onDrop={handleDrop}
      >
        {pages.map((pageBlocks, pageIndex) => (
          <div
            key={pageIndex}
            className={
              viewMode === 'paginated'
                ? 'min-h-[297mm] bg-white shadow-lg px-[20mm] py-[15mm] mb-8 mx-auto max-w-[210mm]'
                : ''
            }
            onClick={e => handlePageClick(e, pageBlocks)}
          >
            {pageBlocks.map((block, index) => (
              <Block
                key={block.id}
                index={index}
                block={block}
                blocks={blocks}
                globalIndex={blocks.findIndex(b => b.id === block.id)}
                isSelected={selectedIds.has(block.id)}
                updateBlock={updateBlock}
                addBlock={addBlock}
                addListBlock={addListBlock}
                removeBlock={removeBlock}
                setSlashMenu={setSlashMenu}
                blockRef={el => (blockRefs.current[block.id] = el)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                dropTarget={dropTarget}
                onHeightChange={handleHeightChange}
                onClearSelection={clearSelection}
              />
            ))}
          </div>
        ))}

        <div className="h-32 -mx-12 cursor-text" onClick={handleBottomClick} />
      </div>

      <SelectionOverlay selectionBox={selectionBox} containerRef={containerRef} />

      {slashMenu.isOpen && (
        <SlashMenu
          x={slashMenu.x}
          y={slashMenu.y}
          close={() => setSlashMenu(prev => ({ ...prev, isOpen: false }))}
          onSelect={handleSlashMenuSelect}
        />
      )}

      {!slashMenu.isOpen && <FloatingToolbar />}
    </div>
  );
};
