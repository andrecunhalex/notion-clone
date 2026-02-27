'use client';

import React, { useState, useRef, useCallback } from 'react';
import { BlockData, SlashMenuState, ViewMode, NotionEditorProps } from './types';
import { getPaginatedBlocks, focusBlock } from './utils';
import {
  useHistory,
  useBlockManager,
  useSelection,
  useDragAndDrop,
  useClipboard,
  useKeyboardShortcuts,
  usePagination
} from './hooks';
import { Block, SlashMenu, Toolbar, SelectionOverlay } from './components';

const DEFAULT_BLOCK: BlockData = { id: 'initial-block', type: 'text', content: '' };

export const NotionEditor: React.FC<NotionEditorProps> = ({
  initialBlocks = [DEFAULT_BLOCK],
  onChange,
  defaultViewMode = 'paginated',
  title = 'MiniNotion'
}) => {
  const [blocks, setBlocksInternal, undo, redo, canUndo, canRedo] = useHistory<BlockData[]>(initialBlocks);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false, x: 0, y: 0, blockId: null
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setBlocksInternal(newBlocks);
    onChange?.(newBlocks);
  }, [setBlocksInternal, onChange]);

  const { blockHeights, handleHeightChange } = usePagination({ blocks, setBlocks, viewMode });

  const {
    selectedIds, setSelectedIds, selectionBox,
    startSelection, clearSelection, didDragSelect
  } = useSelection({ blocks, containerRef, blockRefs });

  const { updateBlock, addBlock, removeBlock, deleteSelectedBlocks, moveBlocks } = useBlockManager({
    blocks, setBlocks
  });

  const {
    dropTarget, handleDragStart, handleDragOver,
    handleContainerDragOver, handleDrop, clearDropTarget
  } = useDragAndDrop({
    blocks, selectedIds, setSelectedIds, blockRefs, moveBlocks
  });

  const { handleCopy, handlePaste } = useClipboard({ blocks, setBlocks, selectedIds });

  useKeyboardShortcuts({
    blocks, setBlocks, selectedIds, setSelectedIds,
    undo, redo, handleCopy, handlePaste
  });

  // Único handler de mouse — o resto é via listeners nativos no document
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.notion-block-content') || target.closest('.drag-handle')) return;
    e.preventDefault();
    setSlashMenu(prev => ({ ...prev, isOpen: false }));
    startSelection(e);
  }, [startSelection]);

  const handleBottomClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text' && lastBlock.content === '') {
      focusBlock(lastBlock.id);
    } else {
      addBlock(lastBlock?.id);
    }
  }, [blocks, addBlock]);

  const handlePageClick = useCallback((e: React.MouseEvent, pageBlocks: BlockData[]) => {
    if (e.target !== e.currentTarget) return;
    if (didDragSelect()) return;

    const blocksOnPage = pageBlocks
      .map(b => document.getElementById(`editable-${b.id}`))
      .filter(Boolean) as HTMLElement[];
    if (blocksOnPage.length === 0) return;

    // Check if click is below the last block on this page
    const lastBlockEl = blocksOnPage[blocksOnPage.length - 1];
    const lastRect = lastBlockEl.getBoundingClientRect();
    if (e.clientY > lastRect.bottom) {
      // Click is below all blocks — create or focus empty last block
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === 'text' && lastBlock.content === '') {
        focusBlock(lastBlock.id);
      } else {
        addBlock(lastBlock?.id);
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
    const currentBlock = blocks.find(b => b.id === slashMenu.blockId);
    if (!currentBlock) return;

    let cleanContent = currentBlock.content;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && selection.focusNode) {
      const blockEl = document.getElementById(`editable-${slashMenu.blockId}`);
      if (blockEl && blockEl.contains(selection.focusNode)) {
        const currentPos = selection.anchorOffset;
        const textBefore = cleanContent.slice(0, currentPos);
        const slashIndex = textBefore.lastIndexOf('/');
        if (slashIndex !== -1) {
          cleanContent = cleanContent.slice(0, slashIndex) + cleanContent.slice(currentPos);
        }
      }
    }
    if (cleanContent === currentBlock.content) {
      if (cleanContent.trim().endsWith('/')) {
        cleanContent = cleanContent.slice(0, cleanContent.lastIndexOf('/'));
      }
    }

    const el = document.getElementById(`editable-${slashMenu.blockId}`);
    if (el) el.innerText = cleanContent;
    updateBlock(slashMenu.blockId, { type, content: cleanContent });
    setSlashMenu(prev => ({ ...prev, isOpen: false }));
    focusBlock(slashMenu.blockId);
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
                isSelected={selectedIds.has(block.id)}
                updateBlock={updateBlock}
                addBlock={addBlock}
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
    </div>
  );
};
