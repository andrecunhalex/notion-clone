'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { BlockData, SlashMenuState, ViewMode, NotionEditorProps, EditorConfig } from './types';
import { getPaginatedBlocks, focusBlock, createDefaultTableData, generateId, isContentEmpty, getListNumber, resolvePageConfig, getContentHeight } from './utils';
import {
  useBlockManager,
  useSelection,
  useDragAndDrop,
  useClipboard,
  useKeyboardShortcuts,
  usePagination
} from './hooks';
import { Block, SlashMenu, Toolbar, SelectionOverlay, FloatingToolbar } from './components';
import { getTemplate, DESIGN_TEMPLATES } from './components/designBlocks';
import { FontLoader } from './components/FontLoader';
import { SYSTEM_FONTS } from './fonts';
import { EditorProvider, EditorDataSource, useLocalDataSource } from './EditorProvider';

const DEFAULT_BLOCK: BlockData = { id: 'initial-block', type: 'text', content: '' };

const NotionEditorInner: React.FC<{
  dataSource: EditorDataSource;
  onChange?: (blocks: BlockData[]) => void;
  defaultViewMode: ViewMode;
  title: string;
  config: EditorConfig;
  onBlockFocus?: (blockId: string | null) => void;
  remoteUsers?: { id: string; name: string; color: string; cursor?: { blockId: string } | null }[];
  syncStatus?: 'disconnected' | 'connecting' | 'connected' | 'synced';
}> = ({ dataSource, onChange, defaultViewMode, title, config, onBlockFocus, remoteUsers, syncStatus }) => {
  const { blocks, setBlocks: setBlocksRaw, undo: undoRaw, redo: redoRaw, canUndo, canRedo, meta, setMeta } = dataSource;

  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [zoom, setZoom] = useState(config.defaultZoom ?? 1);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

  const pageConfig = useMemo(() => resolvePageConfig(config.page), [config.page]);
  const pageContentHeight = config.pageContentHeight ?? getContentHeight(pageConfig);

  const documentFont = (meta.documentFont as string) || SYSTEM_FONTS[0].family;
  const setDocumentFont = useCallback((font: string) => {
    setMeta({ documentFont: font });
  }, [setMeta]);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false, x: 0, y: 0, blockId: null
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const {
    selectedIds, setSelectedIds, selectionBox,
    startSelection, clearSelection, didDragSelect
  } = useSelection({ blocks, containerRef, blockRefs });

  // Track selected IDs for history through the proper interface
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    dataSource.trackSelectedIds?.(Array.from(selectedIdsRef.current));
    setBlocksRaw(newBlocks);
    onChange?.(newBlocks);
  }, [setBlocksRaw, onChange, dataSource]);

  const undo = useCallback(() => {
    const restoredIds = undoRaw();
    setSelectedIds(new Set(restoredIds));
  }, [undoRaw, setSelectedIds]);

  const redo = useCallback(() => {
    const restoredIds = redoRaw();
    setSelectedIds(new Set(restoredIds));
  }, [redoRaw, setSelectedIds]);

  const { blockHeights, handleHeightChange } = usePagination({ blocks, setBlocks, viewMode, pageContentHeight });

  const { updateBlock, addBlock, addBlockBefore, addBlockWithContent, addListBlock, removeBlock, mergeWithPrevious, deleteSelectedBlocks, moveBlocks } = useBlockManager({
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

    const lastBlockEl = blocksOnPage[blocksOnPage.length - 1];
    const lastRect = lastBlockEl.getBoundingClientRect();
    if (e.clientY > lastRect.bottom) {
      const lastPageBlock = pageBlocks[pageBlocks.length - 1];
      const isLastPage = lastPageBlock.id === blocks[blocks.length - 1].id;

      if (isLastPage) {
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.type === 'text' && isContentEmpty(lastBlock.content)) {
          focusBlock(lastBlock.id);
        } else {
          addBlock(lastBlock?.id);
        }
      } else {
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

    closest.focus({ preventScroll: true });
    const range = document.createRange();
    const sel = window.getSelection();
    if (sel) {
      range.selectNodeContents(closest);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [didDragSelect, blocks, addBlock]);

  const handleSlashMenuSelect = useCallback((type: BlockData['type'], templateId?: string) => {
    if (!slashMenu.blockId) return;

    const blockEl = document.getElementById(`editable-${slashMenu.blockId}`);
    let cleanContent = '';

    if (blockEl) {
      const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      let lastSlashNode: Text | null = null;
      let lastSlashIdx = -1;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.textContent || '';
        const idx = text.lastIndexOf('/');
        if (idx !== -1) { lastSlashNode = node; lastSlashIdx = idx; }
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
          ? { ...b, type: 'image' as const, content: '', imageData: { src: '', width: 50, alignment: 'center' as const } }
          : b
      );
      newBlocks.splice(idx + 1, 0, newTextBlock);
      setBlocks(newBlocks);
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
    } else if (type === 'table') {
      if (blockEl) blockEl.innerHTML = '';
      updateBlock(slashMenu.blockId, { type, content: '', tableData: createDefaultTableData() });
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      setTimeout(() => {
        const firstCell = document.querySelector(`[data-table-cell="${slashMenu.blockId}-0-0"]`) as HTMLElement;
        firstCell?.focus({ preventScroll: true });
      }, 50);
    } else if (type === 'design_block' && templateId) {
      if (blockEl) blockEl.innerHTML = '';
      const tpl = getTemplate(templateId);
      const idx = blocks.findIndex(b => b.id === slashMenu.blockId);
      const newTextBlock: BlockData = { id: generateId(), type: 'text', content: '' };
      const newBlocks = blocks.map(b =>
        b.id === slashMenu.blockId
          ? { ...b, type: 'design_block' as const, content: '', designBlockData: { templateId, values: { ...tpl?.defaults } } }
          : b
      );
      newBlocks.splice(idx + 1, 0, newTextBlock);
      setBlocks(newBlocks);
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      focusBlock(newTextBlock.id);
    } else {
      if (blockEl) blockEl.innerHTML = cleanContent;
      updateBlock(slashMenu.blockId, { type, content: cleanContent });
      setSlashMenu(prev => ({ ...prev, isOpen: false }));
      focusBlock(slashMenu.blockId);
    }
  }, [slashMenu.blockId, blocks, updateBlock, setBlocks]);

  const pages = getPaginatedBlocks(blocks, blockHeights, viewMode, pageContentHeight);

  // Pre-compute list numbers for all blocks to avoid passing the entire blocks array to Block
  const listNumbers = useMemo(() => {
    const map: Record<string, number> = {};
    blocks.forEach((block, idx) => {
      if (block.type === 'numbered_list') {
        map[block.id] = getListNumber(block, blocks, idx);
      }
    });
    return map;
  }, [blocks]);

  // Pre-compute auto-numbers for design blocks (heading: 1,2,3  subheading: 1.1,1.2,2.1)
  const designAutoNumbers = useMemo(() => {
    const map: Record<string, string> = {};
    let headingCount = 0;
    let subCount = 0;
    for (const block of blocks) {
      if (block.type !== 'design_block' || !block.designBlockData) continue;
      const tpl = getTemplate(block.designBlockData.templateId);
      if (!tpl?.autonumber) continue;
      if (tpl.autonumber === 'heading') {
        headingCount++;
        subCount = 0;
        map[block.id] = String(headingCount);
      } else if (tpl.autonumber === 'subheading') {
        subCount++;
        map[block.id] = `${headingCount || 1}.${subCount}`;
      }
    }
    return map;
  }, [blocks]);

  const lastBlockId = blocks[blocks.length - 1]?.id;

  // Follow mode: auto-scroll to the followed user's cursor block
  useEffect(() => {
    if (!followingUserId || !remoteUsers) return;
    const followed = remoteUsers.find(u => u.id === followingUserId);
    const blockId = followed?.cursor?.blockId;
    if (!blockId) return;

    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [followingUserId, remoteUsers]);

  // Stop following when local user starts editing
  useEffect(() => {
    if (!followingUserId) return;
    const onKeyDown = () => setFollowingUserId(null);
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only stop following on clicks inside the editor content
      if (target.closest('.notion-block-content') || target.closest('[contenteditable]')) {
        setFollowingUserId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown, { once: true });
    document.addEventListener('mousedown', onMouseDown, { once: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [followingUserId]);

  // Auto-fit zoom on mount for small screens + always center horizontally
  const hasAutoFitted = useRef(false);
  useEffect(() => {
    if (hasAutoFitted.current) return;
    if (viewMode !== 'paginated') return;
    hasAutoFitted.current = true;

    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const viewportWidth = scrollEl.clientWidth;
    const horizontalPadding = 32;
    const availableWidth = viewportWidth - horizontalPadding;
    let appliedZoom = zoom;

    if (availableWidth < pageConfig.width) {
      appliedZoom = Math.max(0.25, Math.floor((availableWidth / pageConfig.width) * 100) / 100);
      setZoom(appliedZoom);
    }

    // Center horizontally after zoom is applied
    requestAnimationFrame(() => {
      const scaledWidth = pageConfig.width * appliedZoom;
      const overflow = scaledWidth - scrollEl.clientWidth;
      scrollEl.scrollLeft = overflow > 0 ? overflow / 2 : 0;
    });
  }, [viewMode, pageConfig.width, zoom]);

  // Zoom: Ctrl+= / Ctrl+- / Ctrl+0 keyboard shortcuts
  useEffect(() => {
    if (viewMode !== 'paginated') return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(z => Math.min(3, Math.round((z + 0.1) * 100) / 100));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(0.25, Math.round((z - 0.1) * 100) / 100));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [viewMode]);

  // Zoom: Ctrl+wheel — native listener with { passive: false } to allow preventDefault
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    if (viewMode !== 'paginated') return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      const oldZoom = zoomRef.current;
      // Proportional delta clamped to a small range for smooth feel
      const rawDelta = -e.deltaY * 0.001;
      const clampedDelta = Math.max(-0.03, Math.min(0.03, rawDelta));
      const newZoom = Math.min(3, Math.max(0.25, Math.round((oldZoom + clampedDelta) * 100) / 100));
      if (newZoom === oldZoom) return;

      // Zoom toward mouse position: adjust scroll so the point under the cursor stays put
      const scrollRect = scrollEl.getBoundingClientRect();
      const mouseY = e.clientY - scrollRect.top + scrollEl.scrollTop;
      const mouseX = e.clientX - scrollRect.left + scrollEl.scrollLeft;

      // The point in unscaled document coords that the mouse is over
      const docY = mouseY / oldZoom;
      const docX = mouseX / oldZoom;

      setZoom(newZoom);

      // After scale change, adjust scroll so that same doc point stays under cursor
      requestAnimationFrame(() => {
        scrollEl.scrollTop = docY * newZoom - (e.clientY - scrollRect.top);
        scrollEl.scrollLeft = docX * newZoom - (e.clientX - scrollRect.left);
      });
    };

    scrollEl.addEventListener('wheel', handler, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handler);
  }, [viewMode]);

  return (
    <div
      className={`min-h-screen text-gray-800 selection:bg-blue-200 ${
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
        documentFont={documentFont}
        onDocumentFontChange={setDocumentFont}
        remoteUsers={remoteUsers}
        syncStatus={syncStatus}
        followingUserId={followingUserId}
        onFollowUser={setFollowingUserId}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      <div
        ref={scrollRef}
        className={`relative overflow-auto ${
          viewMode === 'paginated' ? 'pt-8 pb-8' : ''
        }`}
      >
        <div
          ref={containerRef}
          className={`relative cursor-text ${
            viewMode === 'paginated'
              ? 'mx-auto'
              : 'max-w-3xl mx-auto mt-12 px-12 pb-64 min-h-[80vh] overflow-x-hidden'
          }`}
          style={{
            fontFamily: documentFont || undefined,
            ...(viewMode === 'paginated' ? {
              width: pageConfig.width,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              /* Reserve visual space for the scaled content */
            } : {}),
          }}
          onDragOver={handleContainerDragOver}
          onDrop={handleDrop}
        >
          {pages.map((pageBlocks, pageIndex) => (
            <div
              key={pageIndex}
              className={
                viewMode === 'paginated'
                  ? 'bg-white shadow-lg overflow-hidden'
                  : ''
              }
              style={viewMode === 'paginated' ? {
                width: pageConfig.width,
                minHeight: pageConfig.height,
                paddingTop: pageConfig.paddingTop,
                paddingRight: pageConfig.paddingRight,
                paddingBottom: pageConfig.paddingBottom,
                paddingLeft: pageConfig.paddingLeft,
                marginBottom: 32,
                boxSizing: 'border-box',
              } : undefined}
              onClick={e => handlePageClick(e, pageBlocks)}
            >
              {pageBlocks.map((block, index) => (
                <Block
                  key={block.id}
                  index={index}
                  block={block}
                  listNumber={listNumbers[block.id] || 1}
                  isLastBlock={block.id === lastBlockId}
                  isSelected={selectedIds.has(block.id)}
                  updateBlock={updateBlock}
                  addBlock={addBlock}
                  addBlockBefore={addBlockBefore}
                  addBlockWithContent={addBlockWithContent}
                  addListBlock={addListBlock}
                  removeBlock={removeBlock}
                  mergeWithPrevious={mergeWithPrevious}
                  setSlashMenu={setSlashMenu}
                  blockRef={el => (blockRefs.current[block.id] = el)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  dropTarget={dropTarget}
                  onHeightChange={handleHeightChange}
                  onClearSelection={clearSelection}
                  onBlockFocus={onBlockFocus}
                  uploadImage={config.uploadImage}
                  autoNumber={designAutoNumbers[block.id]}
                />
              ))}
            </div>
          ))}

          {viewMode === 'continuous' && (
            <div className="h-32 -mx-12 cursor-text" onClick={handleBottomClick} />
          )}
          {viewMode === 'paginated' && (
            <div
              className="cursor-text"
              style={{ width: pageConfig.width, height: 64 }}
              onClick={handleBottomClick}
            />
          )}
        </div>
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

      {!slashMenu.isOpen && <FloatingToolbar documentFont={documentFont} blocks={blocks} updateBlock={updateBlock} />}
    </div>
  );
};

// Main export — sets up FontLoader + data source
export const NotionEditor: React.FC<NotionEditorProps> = ({
  initialBlocks = [DEFAULT_BLOCK],
  onChange,
  defaultViewMode = 'paginated',
  title = 'MiniNotion',
  dataSource: externalDataSource,
  config = {},
  onBlockFocus,
  remoteUsers,
  syncStatus,
}) => {
  const localDataSource = useLocalDataSource(initialBlocks, config.historyDebounceMs);
  const noopSetMeta = useCallback(() => {}, []);
  const emptyMeta = useMemo(() => ({}), []);

  const rawSource = externalDataSource || localDataSource;
  // Ensure meta/setMeta always exist (external data sources may omit them)
  const dataSource: EditorDataSource = useMemo(() => ({
    ...rawSource,
    meta: rawSource.meta || emptyMeta,
    setMeta: rawSource.setMeta || noopSetMeta,
  }), [rawSource, emptyMeta, noopSetMeta]);

  return (
    <FontLoader fetchFonts={config.fetchFonts}>
      <EditorProvider dataSource={dataSource}>
        <NotionEditorInner
          dataSource={dataSource}
          onChange={onChange}
          defaultViewMode={defaultViewMode}
          title={title}
          config={config}
          onBlockFocus={onBlockFocus}
          remoteUsers={remoteUsers}
          syncStatus={syncStatus}
        />
      </EditorProvider>
    </FontLoader>
  );
};
