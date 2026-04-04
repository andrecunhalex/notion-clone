'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { BlockData, SlashMenuState, ViewMode, NotionEditorProps, EditorConfig } from './types';
import { getPaginatedBlocks, focusBlock, createDefaultTableData, generateId, isContentEmpty, resolvePageConfig, getContentHeight } from './utils';
import {
  useBlockManager,
  useSelection,
  useDragAndDrop,
  useClipboard,
  useKeyboardShortcuts,
  usePagination,
  useSectionNav,
} from './hooks';
import { Block, SlashMenu, Toolbar, SelectionOverlay, FloatingToolbar, SectionNav, SectionTocPage } from './components';
import { SectionNavPanel } from './components/SectionNavPanel';
import type { SectionNavMeta } from './hooks/useSectionNav';
import { getTemplate } from './components/designBlocks';
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
  onSaveNow?: () => Promise<void>;
}> = ({ dataSource, onChange, defaultViewMode, title, config, onBlockFocus, remoteUsers, syncStatus, onSaveNow }) => {
  const { blocks, setBlocks: setBlocksRaw, undo: undoRaw, redo: redoRaw, canUndo, canRedo, meta, setMeta } = dataSource;

  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [zoom, setZoom] = useState(config.defaultZoom ?? 1);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const activeBlockIdRef = useRef<string | null>(null);

  const pageConfig = useMemo(() => resolvePageConfig(config.page), [config.page]);
  const pageContentHeight = config.pageContentHeight ?? getContentHeight(pageConfig);

  const documentFont = (meta.documentFont as string) || SYSTEM_FONTS[0].family;
  const setDocumentFont = useCallback((font: string) => {
    setMeta({ documentFont: font });
  }, [setMeta]);
  // Section nav metadata (custom labels, hidden sections)
  const sectionNavMeta = (meta.sectionNav as SectionNavMeta) || {};
  const setSectionNavMeta = useCallback((navMeta: SectionNavMeta) => {
    setMeta({ sectionNav: navMeta });
  }, [setMeta]);

  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false, x: 0, y: 0, blockId: null
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const navConfig = config.sectionNav || {};
  const {
    sections, scrollToSection, setCustomLabel, toggleHidden, hasSections,
  } = useSectionNav({
    blocks, sectionNavMeta, setSectionNavMeta, scrollRef,
    maxLabelLength: navConfig.maxLabelLength,
  });

  // Section panel: desktop starts open, mobile starts closed
  const [sectionPanelOpen, setSectionPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

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

  const { blockHeights, handleHeightChange, ready: paginationReady } = usePagination({ blocks, setBlocks, viewMode, pageContentHeight });

  const { updateBlock, addBlock, addBlockBefore, addBlockWithContent, addListBlock, removeBlock, mergeWithPrevious, moveBlocks } = useBlockManager({
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

  // Ctrl/Cmd+S → manual save + brief "Salvo!" indicator (throttled to 1 save per 2s)
  const [showSaved, setShowSaved] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!onSaveNow) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (savingRef.current) return;
        savingRef.current = true;
        onSaveNow().then(() => {
          setShowSaved(true);
          setTimeout(() => {
            setShowSaved(false);
            savingRef.current = false;
          }, 2000);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSaveNow]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.notion-block-content') || target.closest('.drag-handle') || target.closest('[data-editor-toolbar]')) return;
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

  // -----------------------------------------------------------------------
  // Section Navigation: config, page filter, collapse, TOC page
  // -----------------------------------------------------------------------

  const navPosition = navConfig.position || 'header';
  const navPageFilter = navConfig.pages ?? 'all';
  const navMaxButtons = navConfig.maxButtons;

  // Set of all section block IDs (for fast lookup)
  const sectionBlockIds = useMemo(
    () => new Set(sections.map(s => s.blockId)),
    [sections],
  );

  const visibleSections = useMemo(() => sections.filter(s => !s.isHidden), [sections]);
  const isCollapsed = navMaxButtons !== undefined && visibleSections.length > navMaxButtons;

  // Per-page: set of section block IDs that live on that page (for "active" state)
  const pageBlockIdSets = useMemo(() => {
    return pages.map(pageBlocks => {
      const ids = new Set<string>();
      for (const b of pageBlocks) {
        if (sectionBlockIds.has(b.id)) ids.add(b.id);
      }
      return ids;
    });
  }, [pages, sectionBlockIds]);

  // Determine which pages show the nav bar
  const shouldShowNav = useCallback((pageIndex: number): boolean => {
    if (!hasSections) return false;
    if (navPageFilter === 'none') return false;
    if (navPageFilter === 'all') return true;
    if (Array.isArray(navPageFilter)) return navPageFilter.includes(pageIndex);
    return navPageFilter(pageIndex, pages.length);
  }, [hasSections, navPageFilter, pages.length]);

  // Build section → page number map (1-based, accounting for TOC page offset)
  const sectionPageMap = useMemo(() => {
    const map: Record<string, number> = {};
    const tocOffset = isCollapsed ? 1 : 0;
    pages.forEach((pageBlocks, pageIdx) => {
      for (const block of pageBlocks) {
        if (sectionBlockIds.has(block.id)) {
          map[block.id] = pageIdx + 1 + (pageIdx >= 1 ? tocOffset : 0);
        }
      }
    });
    return map;
  }, [pages, isCollapsed, sectionBlockIds]);

  // Build rendered pages array — inject TOC page at index 1 when collapsed
  type RenderedPage =
    | { type: 'blocks'; pageBlocks: BlockData[]; pageIndex: number }
    | { type: 'toc' };

  const renderedPages = useMemo<RenderedPage[]>(() => {
    const result: RenderedPage[] = pages.map((pageBlocks, pageIndex) => ({
      type: 'blocks' as const,
      pageBlocks,
      pageIndex,
    }));
    if (isCollapsed && result.length >= 1) {
      result.splice(1, 0, { type: 'toc' as const });
    }
    return result;
  }, [pages, isCollapsed]);

  // Scroll to the TOC page
  const scrollToTocPage = useCallback(() => {
    const tocEl = document.querySelector('[data-toc-page]');
    if (tocEl) {
      tocEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Single-pass pre-computation: list numbers + design auto-numbers
  // Combines what were separate O(n) iterations into one pass
  const { listNumbers, designAutoNumbers } = useMemo(() => {
    const listNums: Record<string, number> = {};
    const autoNums: Record<string, string> = {};
    let headingCount = 0;
    let subCount = 0;

    // List number tracking per indent level
    const listCounters: number[] = [0, 0, 0, 0];
    let prevType: string | null = null;
    let prevIndent = 0;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // List numbers — matches getListNumber logic but forward-scan O(1) per block
      if (block.type === 'numbered_list') {
        const indent = block.indent ?? 0;
        if (prevType !== 'numbered_list') {
          // Non-list break: reset all levels
          listCounters.fill(0);
        } else if (indent > prevIndent) {
          // Deeper indent: reset this level
          listCounters[indent] = 0;
        }
        listCounters[indent]++;
        listNums[block.id] = listCounters[indent];
      }
      prevType = block.type;
      prevIndent = block.indent ?? 0;

      // Design block auto-numbers
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
    }

    return { listNumbers: listNums, designAutoNumbers: autoNums };
  }, [blocks]);

  // Stable edgePadding ref — uses a stringified key so the object identity only changes
  // when actual values change. This is critical for Block memo: if edgePadding were a
  // new object each render, every Block would re-render on every parent update.
  const edgePaddingKey = viewMode === 'paginated'
    ? `p:${pageConfig.paddingTop}:${pageConfig.paddingRight}:${pageConfig.paddingBottom}:${pageConfig.paddingLeft}`
    : 'c:48:48:0:48';
  const edgePadding = useMemo(() => {
    if (viewMode === 'paginated') {
      return { top: pageConfig.paddingTop, right: pageConfig.paddingRight, bottom: pageConfig.paddingBottom, left: pageConfig.paddingLeft };
    }
    return { top: 48, right: 48, bottom: 0, left: 48 };
  }, [edgePaddingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlockFocus = useCallback((blockId: string | null) => {
    activeBlockIdRef.current = blockId;
    setActiveBlockId(blockId);
    onBlockFocus?.(blockId);
  }, [onBlockFocus]);

  // Full-width margin toggle
  const targetBlockIds = useMemo(() => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (activeBlockId && blocks.find(b => b.id === activeBlockId)) return [activeBlockId];
    return [];
  }, [selectedIds, activeBlockId, blocks]);

  const allTargetsFullWidth = targetBlockIds.length > 0 && targetBlockIds.every(id => blocks.find(b => b.id === id)?.fullWidth);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const toggleFullWidth = useCallback(() => {
    const currentBlocks = blocksRef.current;
    const sel = selectedIdsRef.current;
    let targets: string[];
    if (sel.size > 0) {
      targets = Array.from(sel);
    } else {
      const id = activeBlockIdRef.current;
      if (id && currentBlocks.find(b => b.id === id)) {
        targets = [id];
      } else {
        return;
      }
    }
    const targetSet = new Set(targets);
    const allFull = targets.every(id => currentBlocks.find(b => b.id === id)?.fullWidth);
    setBlocks(currentBlocks.map(b =>
      targetSet.has(b.id) ? { ...b, fullWidth: allFull ? undefined : true } : b
    ));
  }, [setBlocks]);

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
      if (target.closest('.notion-block-content') || target.closest('[contenteditable]')) {
        setFollowingUserId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown, { once: true });
    document.addEventListener('mousedown', onMouseDown);
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

    // Center horizontally: the container has width=pageConfig.width (unscaled) with mx-auto,
    // but the browser creates horizontal scroll for the unscaled width.
    // Center the scroll so the scaled page is visually centered.
    requestAnimationFrame(() => {
      if (!scrollEl) return;
      const scrollWidth = scrollEl.scrollWidth;
      const clientWidth = scrollEl.clientWidth;
      if (scrollWidth > clientWidth) {
        scrollEl.scrollLeft = (scrollWidth - clientWidth) / 2;
      }
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
      className={`h-screen flex flex-col text-gray-800 selection:bg-blue-200 ${
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
        showSaved={showSaved}
        followingUserId={followingUserId}
        onFollowUser={setFollowingUserId}
        zoom={zoom}
        onZoomChange={setZoom}
        hasTargetBlocks={targetBlockIds.length > 0}
        allTargetsFullWidth={allTargetsFullWidth}
        onToggleFullWidth={toggleFullWidth}
        hasSections={hasSections}
        onToggleSectionPanel={() => setSectionPanelOpen(prev => !prev)}
      />

      {/* Scroll container — takes all remaining space below toolbar (flex-1).
          Starts opacity:0 in paginated mode until block heights are collected,
          then fades in (duration-200) to avoid the pagination "flicker". */}
      <div
        ref={scrollRef}
        className={`relative overflow-y-auto overflow-x-auto flex-1 min-h-0 transition-opacity duration-200 ${
          viewMode === 'paginated' ? 'pt-4 md:pt-8 pb-8' : ''
        } ${viewMode === 'paginated' && !paginationReady ? 'opacity-0' : 'opacity-100'}`}
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
            } : {}),
          }}
          onDragOver={handleContainerDragOver}
          onDrop={handleDrop}
        >
          {renderedPages.map((page, renderIndex) => {
            // Paginated page style: fixed height (never grows), CSS padding for margins,
            // overflow:hidden clips content that hasn't been moved to the next page yet.
            // The padding values come from config.page (default: 0 on all sides).
            const paginatedStyle = viewMode === 'paginated' ? {
              width: pageConfig.width,
              height: pageConfig.height,
              paddingTop: pageConfig.paddingTop,
              paddingRight: pageConfig.paddingRight,
              paddingBottom: pageConfig.paddingBottom,
              paddingLeft: pageConfig.paddingLeft,
              marginBottom: 32,
              boxSizing: 'border-box' as const,
            } : undefined;

            if (page.type === 'toc') {
              return (
                <div
                  key="toc-page"
                  data-toc-page
                  className={viewMode === 'paginated' ? 'bg-white shadow-lg overflow-hidden' : ''}
                  style={paginatedStyle}
                >
                  <SectionTocPage
                    sections={sections}
                    sectionPageMap={sectionPageMap}
                    onScrollTo={scrollToSection}
                    activeColor={navConfig.activeColor}
                  />
                </div>
              );
            }

            const { pageBlocks, pageIndex } = page;
            const showNav = shouldShowNav(pageIndex);
            const vertical = navPosition === 'left' || navPosition === 'right';

            const sectionNavElement = showNav ? (
              <div data-editor-toolbar className={vertical ? '' : 'mb-2'}>
                <SectionNav
                  sections={sections}
                  position={navPosition}
                  onScrollTo={scrollToSection}
                  pageBlockIds={pageBlockIdSets[pageIndex] || new Set()}
                  collapsed={isCollapsed}
                  onSummaryClick={scrollToTocPage}
                  activeColor={navConfig.activeColor}
                  buttonTemplate={navConfig.buttonTemplate}
                />
              </div>
            ) : null;

            const headerNavBlocks = showNav && (navPosition === 'header' || vertical);
            const footerNavBlocks = showNav && navPosition === 'footer';

            const blocksContent = (
              <div className={vertical && showNav ? 'flex-1 min-w-0' : undefined}>
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
                    onBlockFocus={handleBlockFocus}
                    uploadImage={config.uploadImage}
                    autoNumber={designAutoNumbers[block.id]}
                    edgePadding={edgePadding}
                    isFirstOnPage={index === 0 && !headerNavBlocks}
                    isLastOnPage={index === pageBlocks.length - 1 && !footerNavBlocks}
                  />
                ))}
              </div>
            );

            const pageContent = vertical && showNav ? (
              <div className={`flex gap-3 h-full ${navPosition === 'right' ? 'flex-row-reverse' : ''}`}>
                {sectionNavElement}
                {blocksContent}
              </div>
            ) : (
              <>
                {navPosition === 'header' && sectionNavElement}
                {blocksContent}
                {navPosition === 'footer' && sectionNavElement}
              </>
            );

            return (
              <div
                key={renderIndex}
                data-page-index={pageIndex}
                className={viewMode === 'paginated' ? 'bg-white shadow-lg overflow-hidden' : ''}
                style={paginatedStyle}
                onClick={e => handlePageClick(e, pageBlocks)}
              >
                {pageContent}
              </div>
            );
          })}

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

      {hasSections && (
        <SectionNavPanel
          sections={sections}
          isOpen={sectionPanelOpen}
          onToggle={() => setSectionPanelOpen(prev => !prev)}
          onScrollTo={scrollToSection}
          onSetLabel={setCustomLabel}
          onToggleHidden={toggleHidden}
        />
      )}

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
  onSaveNow,
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
          onSaveNow={onSaveNow}
        />
      </EditorProvider>
    </FontLoader>
  );
};
