'use client';

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  RotateCcw, RotateCw, ArrowLeft, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, ChevronDown, Share2, Download,
  MoreHorizontal, FileText, Scroll, MoveHorizontal, List,
  Clock, Settings, Cloud, CloudOff, RefreshCw, CheckCircle2, Check,
  Plus, Minus, X,
} from 'lucide-react';
import { ViewMode, BlockData, TextAlign } from '../types';
import { FontEntry } from '../fonts';
import { useFonts } from './FontLoader';
import { useFloatingToolbar } from '../hooks/useFloatingToolbar';
import { ColorPicker } from './toolbar/ColorPicker';
import { FontPicker } from './toolbar/FontPicker';
import { SizePicker } from './toolbar/SizePicker';
import { LinkInput } from './toolbar/LinkInput';
import { AlignmentPicker } from './toolbar/AlignmentPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PresenceUser {
  id: string;
  name: string;
  color: string;
  cursor?: { blockId: string } | null;
}

interface ToolbarProps {
  title?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  documentFont: string;
  onDocumentFontChange: (family: string) => void;
  documentFontSize: number;
  onDocumentFontSizeChange: (size: number) => void;
  remoteUsers?: PresenceUser[];
  syncStatus?: 'disconnected' | 'connecting' | 'connected' | 'synced';
  showSaved?: boolean;
  followingUserId?: string | null;
  onFollowUser?: (userId: string | null) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  hasTargetBlocks?: boolean;
  allTargetsFullWidth?: boolean;
  onToggleFullWidth?: () => void;
  hasSections?: boolean;
  onToggleSectionPanel?: () => void;
  onOpenVersionHistory?: () => void;
  onToggleSettings?: () => void;
  /** Format command wiring (needed for the in-toolbar formatting controls). */
  blocks?: BlockData[];
  updateBlock?: (id: string, updates: Partial<BlockData>) => void;
  /** Batch-update primitive: required so doc-wide ops land in one history entry. */
  setBlocks?: (blocks: BlockData[]) => void;
  selectedBlockIds?: Set<string>;
  /** Scroll container ref (unused here but kept for API parity with FloatingToolbar). */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional share handler for the big Compartilhar button. */
  onShare?: () => void;
  /** Current user avatar (for the right pill). */
  currentUser?: { name?: string; color?: string };
}

type MenuId = 'font' | 'size' | 'color' | 'align' | 'link' | 'overflow' | 'users' | null;

/**
 * Menus opened from buttons near the right edge of the toolbar (overflow ⋯,
 * users dropdown) should anchor to their trigger's RIGHT edge and extend
 * left — otherwise their body overflows the viewport on narrow screens.
 */
const RIGHT_ANCHORED_MENUS = new Set<MenuId>(['overflow', 'users']);

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** White rounded-full pill container with a soft shadow (matches Figma). */
const Pill: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-full shadow-[0_0_10px_0_rgba(0,0,0,0.1)] flex items-center ${className}`}
  >
    {children}
  </div>
);

/** Thin vertical separator used inside the main pill. */
const PillDivider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`w-px h-5 bg-gray-200 mx-1 shrink-0 ${className}`} />
);

/** Icon button used inside pills. Preserves selection by cancelling mousedown. */
const IconBtn: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, disabled, title, active, children, className = '' }) => (
  <button
    type="button"
    disabled={disabled}
    title={title}
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    className={`p-1.5 rounded-lg transition-colors ${
      disabled
        ? 'opacity-30 cursor-default'
        : active
        ? 'bg-gray-200 text-gray-900'
        : 'text-gray-600 hover:bg-gray-100'
    } ${className}`}
  >
    {children}
  </button>
);

/** Shared styles for the bordered chip buttons (font name, size). */
const chipClass = (active?: boolean) =>
  `flex items-center gap-1 px-2.5 h-6 rounded-full border border-gray-300 text-xs text-gray-900 bg-white transition-colors ${
    active ? 'bg-gray-100' : 'hover:bg-gray-50'
  }`;

// ---------------------------------------------------------------------------
// Sync status icon (replaces the old colored dot + "Salvo!" text)
// ---------------------------------------------------------------------------

/**
 * Fixed-size sync indicator: always occupies an 18x18 slot so the surrounding
 * layout never shifts. On `showSaved` (Ctrl+S) the outlined check morphs into
 * a filled green pill with a white check, then the effect unwinds when the
 * parent clears `showSaved` — an obvious "saved" pulse with zero layout shift.
 */
const SyncIcon: React.FC<{
  status?: 'disconnected' | 'connecting' | 'connected' | 'synced';
  showSaved?: boolean;
}> = ({ status, showSaved }) => {
  if (!status && !showSaved) return null;
  const label = showSaved
    ? 'Salvo!'
    : status === 'disconnected' ? 'Desconectado'
    : status === 'connecting' ? 'Conectando...'
    : status === 'connected' ? 'Conectado'
    : 'Sincronizado';

  let icon: React.ReactNode;
  if (showSaved) {
    // Filled green pill + white check — the "just saved" pulse.
    icon = (
      <div className="w-[18px] h-[18px] rounded-full bg-green-500 flex items-center justify-center scale-110 transition-transform duration-200 ease-out">
        <Check size={12} strokeWidth={3} className="text-white" />
      </div>
    );
  } else if (status === 'disconnected') {
    icon = <CloudOff size={18} className="text-red-500" />;
  } else if (status === 'connecting') {
    icon = <RefreshCw size={18} className="text-amber-500 animate-spin" />;
  } else if (status === 'synced') {
    icon = <CheckCircle2 size={18} className="text-green-500 transition-transform duration-200" />;
  } else {
    icon = <Cloud size={18} className="text-blue-500" />;
  }

  return (
    <div
      className="shrink-0 w-[18px] h-[18px] flex items-center justify-center"
      title={label}
      aria-label={label}
    >
      {icon}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const Toolbar: React.FC<ToolbarProps> = ({
  title = 'MiniNotion',
  canUndo, canRedo, onUndo, onRedo,
  viewMode, onToggleViewMode,
  documentFont, onDocumentFontChange,
  documentFontSize, onDocumentFontSizeChange,
  remoteUsers, syncStatus, showSaved,
  followingUserId, onFollowUser,
  zoom = 1, onZoomChange,
  hasTargetBlocks, allTargetsFullWidth, onToggleFullWidth,
  hasSections, onToggleSectionPanel,
  onOpenVersionHistory, onToggleSettings,
  blocks, updateBlock, setBlocks, selectedBlockIds,
  scrollRef,
  onShare,
  currentUser,
}) => {
  const { allFonts, customFonts } = useFonts();

  // Shared format commands. The 'top' role ensures we don't double-register
  // global listeners (keyboard shortcuts, link click navigation) that the
  // floating toolbar already owns.
  const cmd = useFloatingToolbar({
    role: 'top',
    documentFont,
    blocks,
    updateBlock,
    setBlocks,
    allFonts,
    scrollRef,
    setDocumentFont: onDocumentFontChange,
    setDocumentFontSize: onDocumentFontSizeChange,
    selectedBlockIds,
  });

  // --- Submenu state (local, independent of the floating toolbar) ---
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

  const toolbarRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const openMenuAt = useCallback((menu: Exclude<MenuId, null>) => {
    setOpenMenu(prev => (prev === menu ? null : menu));
  }, []);

  /**
   * Two-pass menu positioning:
   *
   * - Pass 1 (on openMenu change, before the menu mounts): use an estimated
   *   width (280px upper bound for our menus) to guess a safe initial
   *   position already clamped to the viewport, so the first paint is
   *   never off-screen.
   *
   * - Pass 2 (once the menu is mounted): re-run with the menu's real
   *   offsetWidth for pixel-perfect alignment.
   *
   * Menus in RIGHT_ANCHORED_MENUS (overflow, users) anchor to their
   * trigger's RIGHT edge and extend leftward — otherwise the body would
   * overflow the viewport on narrow screens.
   */
  const computePosition = useCallback((width: number) => {
    if (!openMenu || !toolbarRef.current) return null;
    const trigger = triggerRefs.current[openMenu];
    if (!trigger) return null;

    const containerRect = toolbarRef.current.getBoundingClientRect();
    const btnRect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;

    let absLeft = RIGHT_ANCHORED_MENUS.has(openMenu)
      ? btnRect.right - width
      : btnRect.left;

    // Clamp within the viewport with an 8px breathing room on each side.
    absLeft = Math.max(8, Math.min(absLeft, vw - width - 8));

    return {
      left: absLeft - containerRect.left,
      top: btnRect.bottom - containerRect.top + 6,
    };
  }, [openMenu]);

  // Pass 1: initial guess using estimated width (runs before menu is mounted).
  useLayoutEffect(() => {
    if (!openMenu) { setMenuPos(null); return; }
    setMenuPos(computePosition(280));
  }, [openMenu, computePosition]);

  // Pass 2: refine with the menu's real width once it has mounted.
  useLayoutEffect(() => {
    if (!openMenu || !menuRef.current) return;
    const width = menuRef.current.offsetWidth;
    if (!width) return;
    const pos = computePosition(width);
    if (!pos) return;
    setMenuPos(prev => {
      if (!prev) return pos;
      if (Math.abs(prev.left - pos.left) < 1 && Math.abs(prev.top - pos.top) < 1) return prev;
      return pos;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu, menuPos?.top]);

  // Close on outside click.
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (Object.values(triggerRefs.current).some(el => el?.contains(target))) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  // Close on Escape.
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openMenu]);

  // Focus link input when the link menu opens.
  useEffect(() => {
    if (openMenu === 'link') {
      setTimeout(() => linkInputRef.current?.focus(), 0);
    }
  }, [openMenu]);

  // --- Derived display values ---
  const displayFont = cmd.currentFont || documentFont;
  const displayFontSize = cmd.currentFontSize || documentFontSize;
  const displayFontName =
    allFonts.find(f => f.family === displayFont)?.name
    || allFonts.find(f => f.family === documentFont)?.name
    || 'Padrão';
  const displayColor = cmd.currentTextColor || '';

  // Active format helpers
  const isBold = cmd.activeFormats.has('bold');
  const isItalic = cmd.activeFormats.has('italic');
  const isUnderline = cmd.activeFormats.has('underline');
  const currentAlign: TextAlign = cmd.currentAlign || 'left';

  // Wrap apply callbacks so they restore selection first, then close the menu.
  const withRestore = (fn: () => void) => () => { cmd.restoreSelection(); fn(); };

  const handleFontSelect = useCallback((font: FontEntry) => {
    cmd.restoreSelection();
    cmd.applyFont(font);
    setOpenMenu(null);
  }, [cmd]);

  const handleSizeSelect = useCallback((size: number) => {
    cmd.restoreSelection();
    cmd.applyFontSize(size);
    setOpenMenu(null);
  }, [cmd]);

  const handleTextColor = useCallback((color: string) => {
    cmd.restoreSelection();
    cmd.applyTextColor(color);
    setOpenMenu(null);
  }, [cmd]);

  const handleBgColor = useCallback((color: string) => {
    cmd.restoreSelection();
    cmd.applyBgColor(color);
    setOpenMenu(null);
  }, [cmd]);

  const handleLinkApply = useCallback((url: string) => {
    cmd.restoreSelection();
    cmd.applyLink(url);
    setLinkUrl('');
    setOpenMenu(null);
  }, [cmd]);

  const handleAlignment = useCallback((align: TextAlign) => {
    cmd.restoreSelection();
    cmd.applyAlignment(align);
  }, [cmd]);

  const followedUser = remoteUsers?.find(u => u.id === followingUserId);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      ref={toolbarRef}
      data-editor-toolbar
      className="relative shrink-0 bg-transparent px-2 sm:px-4 md:px-6 pt-2 pb-2 md:pt-3 md:pb-3 flex items-center gap-2 md:gap-3 lg:gap-4"
    >
      {/* Back button (circle, currently decorative). */}
      <button
        type="button"
        title="Voltar"
        onMouseDown={e => e.preventDefault()}
        className="shrink-0 w-10 h-10 md:w-[51px] md:h-[51px] rounded-full bg-white shadow-[0_0_10px_0_rgba(0,0,0,0.1)] flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <ArrowLeft size={20} />
      </button>

      {/* Main pill — takes the remaining horizontal space.
          On mobile it shrinks to core formatting only; desktop shows everything.
          `overflow-x-auto` with hidden scrollbar is a safety net: if the
          viewport is narrower than expected the user can still scroll to
          reach every button. */}
      <Pill className="flex-1 min-w-0 h-10 md:h-[51px] px-2 md:px-4 gap-0.5 md:gap-1.5 overflow-x-auto md:overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" >
        {/* History */}
        <IconBtn onClick={onUndo} disabled={!canUndo} title="Desfazer (⌘Z)">
          <RotateCcw size={16} />
        </IconBtn>
        <IconBtn onClick={onRedo} disabled={!canRedo} title="Refazer (⌘⇧Z)">
          <RotateCw size={16} />
        </IconBtn>

        {/* Title — hidden on small screens to make room for formatting controls */}
        <PillDivider />
        <span
          className="hidden lg:inline truncate text-[15px] text-gray-700 min-w-0 flex-1 max-w-sm lg:max-w-md"
          title={title}
        >
          {title}
        </span>
        <PillDivider className="hidden lg:block" />

        {/* Font — hidden on small screens (still accessible via FloatingToolbar on selection) */}
        <button
          type="button"
          ref={el => { triggerRefs.current.font = el; }}
          title="Fonte"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openMenuAt('font')}
          className={`hidden md:flex ${chipClass(openMenu === 'font')}`}
        >
          <span
            className="max-w-[120px] truncate"
            style={{ fontFamily: displayFont || undefined }}
          >
            {displayFontName}
          </span>
          <ChevronDown size={10} />
        </button>

        {/* Size */}
        <button
          type="button"
          ref={el => { triggerRefs.current.size = el; }}
          title="Tamanho"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openMenuAt('size')}
          className={`hidden sm:flex ${chipClass(openMenu === 'size')} tabular-nums`}
        >
          <span>{displayFontSize}</span>
          <ChevronDown size={10} />
        </button>

        {/* Color */}
        <button
          type="button"
          ref={el => { triggerRefs.current.color = el; }}
          title="Cor do texto"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openMenuAt('color')}
          className={`flex items-center gap-1 px-1.5 h-7 rounded-lg transition-colors ${
            openMenu === 'color' ? 'bg-gray-100' : 'hover:bg-gray-100'
          }`}
        >
          <span
            className="w-4 h-4 rounded-full border border-gray-300"
            style={{ backgroundColor: displayColor || '#0f0f0f' }}
          />
          <ChevronDown size={10} className="text-gray-500" />
        </button>

        <PillDivider />

        {/* B / I / U */}
        <IconBtn onClick={withRestore(() => cmd.applyFormat('bold'))} active={isBold} title="Negrito (⌘B)">
          <Bold size={16} strokeWidth={2.5} />
        </IconBtn>
        <IconBtn onClick={withRestore(() => cmd.applyFormat('italic'))} active={isItalic} title="Itálico (⌘I)">
          <Italic size={16} />
        </IconBtn>
        <IconBtn onClick={withRestore(() => cmd.applyFormat('underline'))} active={isUnderline} title="Sublinhado (⌘U)">
          <Underline size={16} />
        </IconBtn>

        <PillDivider className="hidden md:block" />

        {/* Alignment — single dropdown trigger (mirrors the floating toolbar).
            Hidden on mobile; users can still align via the FloatingToolbar
            that appears on text selection. */}
        <button
          type="button"
          ref={el => { triggerRefs.current.align = el; }}
          title="Alinhamento"
          onMouseDown={e => e.preventDefault()}
          onClick={() => openMenuAt('align')}
          className={`hidden md:flex items-center gap-0.5 p-1.5 rounded-lg transition-colors ${
            openMenu === 'align' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {currentAlign === 'center' ? <AlignCenter size={16} /> :
           currentAlign === 'right' ? <AlignRight size={16} /> :
           currentAlign === 'justify' ? <AlignJustify size={16} /> :
           <AlignLeft size={16} />}
          <ChevronDown size={10} className="text-gray-500" />
        </button>

        <PillDivider className="hidden md:block" />

        {/* Link — hidden on mobile; accessible via FloatingToolbar on selection */}
        <button
          type="button"
          ref={el => { triggerRefs.current.link = el; }}
          title="Inserir link (⌘K)"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            cmd.restoreSelection();
            if (cmd.activeFormats.has('link') && cmd.currentLink) {
              setLinkUrl(cmd.currentLink.href);
            } else {
              setLinkUrl('');
            }
            openMenuAt('link');
          }}
          className={`hidden md:inline-flex p-1.5 rounded-lg transition-colors ${
            cmd.activeFormats.has('link')
              ? 'bg-gray-200 text-gray-900'
              : openMenu === 'link' ? 'bg-gray-100 text-gray-600' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <LinkIcon size={16} />
        </button>

        {/* Sync indicator — md+ only (mobile users don't need a persistent
            sync light, Ctrl+S flashes the cloud icon if it fires). */}
        {(syncStatus || showSaved) && (
          <>
            <PillDivider className="hidden md:block" />
            <div className="hidden md:flex">
              <SyncIcon status={syncStatus} showSaved={showSaved} />
            </div>
          </>
        )}

        {/* Zoom — lives inside the main pill, only in paginated mode, md+ only */}
        {viewMode === 'paginated' && onZoomChange && (
          <>
            <PillDivider className="hidden md:block" />
            <div
              className="hidden md:flex items-center gap-1 h-7 px-2 rounded-full border text-[11px] text-gray-600"
              style={{ borderColor: '#ffe4d5' }}
            >
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onZoomChange(Math.max(0.25, Math.round((zoom - 0.1) * 100) / 100))}
                disabled={zoom <= 0.25}
                className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                title="Diminuir zoom"
              >
                <Minus size={12} />
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onZoomChange(1)}
                className="min-w-[34px] text-center tabular-nums"
                title="Redefinir zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 100) / 100))}
                disabled={zoom >= 3}
                className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
                title="Aumentar zoom"
              >
                <Plus size={12} />
              </button>
            </div>
          </>
        )}
      </Pill>

      {/* Right pill */}
      <Pill className="shrink-0 h-10 md:h-[51px] px-1.5 md:px-2 gap-1 md:gap-1.5" >
        {/* User presence
            • If there are remote users: show a leading avatar stack + caret
              that opens the user list dropdown.
            • If alone in the doc: hide the avatar entirely — no point showing
              your own bubble when nobody else is around.
            The "Seguindo X" pill appears only while actively following. */}
        {remoteUsers && remoteUsers.length > 0 && (
          <button
            type="button"
            ref={el => { triggerRefs.current.users = el; }}
            onMouseDown={e => e.preventDefault()}
            onClick={() => openMenuAt('users')}
            className="flex items-center gap-1 pl-1 pr-1.5 rounded-full hover:bg-gray-50 transition-colors"
            title={`${remoteUsers.length} ${remoteUsers.length === 1 ? 'pessoa' : 'pessoas'} no documento`}
          >
            <div className="flex -space-x-1.5">
              {/* On mobile show only the first avatar, rest go into dropdown */}
              {remoteUsers.slice(0, 1).map(user => (
                <div
                  key={user.id}
                  className="w-6 h-6 md:w-7 md:h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {remoteUsers.slice(1, 3).map(user => (
                <div
                  key={user.id}
                  className="hidden md:flex w-7 h-7 rounded-full border-2 border-white items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {remoteUsers.length > 3 && (
                <div className="hidden md:flex w-7 h-7 rounded-full border-2 border-white bg-gray-400 items-center justify-center text-[10px] font-bold text-white">
                  +{remoteUsers.length - 3}
                </div>
              )}
            </div>
            <ChevronDown size={12} className="text-gray-500" />
          </button>
        )}

        {followedUser && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onFollowUser?.(null)}
            title="Parar de seguir"
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
            style={{ backgroundColor: followedUser.color }}
          >
            {followedUser.name}
            <X size={10} />
          </button>
        )}

        {/* Overflow menu (version history, settings, view mode, etc.) */}
        <button
          type="button"
          ref={el => { triggerRefs.current.overflow = el; }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => openMenuAt('overflow')}
          title="Mais opções"
          className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            openMenu === 'overflow' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <MoreHorizontal size={16} />
        </button>

        {/* Export (decorative for now) — hidden on very small screens */}
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          title="Exportar"
          className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-orange-500 hover:bg-orange-100 transition-colors shrink-0"
          style={{ backgroundColor: '#FFF1E6' }}
        >
          <Download size={16} />
        </button>

        {/* Share — icon-only on small screens, icon + label on md+ */}
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={onShare}
          className="flex items-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3 rounded-lg text-white text-sm font-semibold transition-colors shrink-0"
          style={{ backgroundColor: '#FA4115' }}
        >
          <Share2 size={14} />
          <span className="hidden md:inline">Compartilhar</span>
        </button>
      </Pill>

      {/* ------------------------------------------------------------------- */}
      {/* Menus (positioned absolute within the toolbar container)            */}
      {/* ------------------------------------------------------------------- */}

      {openMenu === 'font' && (
        <FontPicker
          menuRef={menuRef}
          menuPos={menuPos}
          allFonts={allFonts}
          customFonts={customFonts}
          currentFont={displayFont}
          onSelect={handleFontSelect}
        />
      )}

      {openMenu === 'size' && (
        <SizePicker
          menuRef={menuRef}
          menuPos={menuPos}
          currentSize={displayFontSize}
          onSelect={handleSizeSelect}
        />
      )}

      {openMenu === 'color' && (
        <ColorPicker
          menuRef={menuRef}
          menuPos={menuPos}
          currentTextColor={cmd.currentTextColor}
          currentBgColor={cmd.currentBgColor}
          onTextColor={handleTextColor}
          onBgColor={handleBgColor}
        />
      )}

      {openMenu === 'align' && (
        <AlignmentPicker
          menuRef={menuRef}
          menuPos={menuPos}
          currentAlign={currentAlign}
          onSelect={align => { handleAlignment(align); setOpenMenu(null); }}
        />
      )}

      {openMenu === 'users' && remoteUsers && (
        <UsersMenu
          menuRef={menuRef}
          menuPos={menuPos}
          remoteUsers={remoteUsers}
          followingUserId={followingUserId ?? null}
          currentUserName={currentUser?.name}
          currentUserColor={currentUser?.color}
          onFollowUser={onFollowUser}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {openMenu === 'link' && (
        <LinkInput
          menuRef={menuRef}
          menuPos={menuPos}
          inputRef={linkInputRef}
          linkUrl={linkUrl}
          onUrlChange={setLinkUrl}
          onApply={handleLinkApply}
          onClose={() => setOpenMenu(null)}
          hasLink={cmd.activeFormats.has('link') && !!cmd.currentLink}
          onRemoveLink={() => { cmd.removeLink(); setOpenMenu(null); }}
        />
      )}

      {openMenu === 'overflow' && menuPos && (
        <OverflowMenu
          menuRef={menuRef}
          menuPos={menuPos}
          viewMode={viewMode}
          onToggleViewMode={() => { onToggleViewMode(); setOpenMenu(null); }}
          hasTargetBlocks={hasTargetBlocks}
          allTargetsFullWidth={allTargetsFullWidth}
          onToggleFullWidth={onToggleFullWidth ? () => { onToggleFullWidth(); setOpenMenu(null); } : undefined}
          hasSections={hasSections}
          onToggleSectionPanel={onToggleSectionPanel ? () => { onToggleSectionPanel(); setOpenMenu(null); } : undefined}
          onOpenVersionHistory={onOpenVersionHistory ? () => { onOpenVersionHistory(); setOpenMenu(null); } : undefined}
          onToggleSettings={onToggleSettings ? () => { onToggleSettings(); setOpenMenu(null); } : undefined}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overflow menu — secondary / infrequent controls
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  hasTargetBlocks?: boolean;
  allTargetsFullWidth?: boolean;
  onToggleFullWidth?: () => void;
  hasSections?: boolean;
  onToggleSectionPanel?: () => void;
  onOpenVersionHistory?: () => void;
  onToggleSettings?: () => void;
}

const OverflowItem: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}> = ({ onClick, disabled, icon, label }) => (
  <button
    type="button"
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default"
  >
    <span className="text-gray-500">{icon}</span>
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// Users menu — lists everyone currently in the document (click to follow)
// ---------------------------------------------------------------------------

interface UsersMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPos: { left: number; top: number } | null;
  remoteUsers: PresenceUser[];
  followingUserId: string | null;
  currentUserName?: string;
  currentUserColor?: string;
  onFollowUser?: (id: string | null) => void;
  onClose: () => void;
}

const UsersMenu: React.FC<UsersMenuProps> = ({
  menuRef, menuPos, remoteUsers, followingUserId,
  currentUserName, currentUserColor, onFollowUser, onClose,
}) => (
  <div
    ref={menuRef}
    className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-xl py-2 w-64"
    style={{
      left: menuPos?.left ?? 0,
      top: menuPos?.top ?? 0,
      visibility: menuPos ? 'visible' : 'hidden',
    }}
    onMouseDown={e => e.stopPropagation()}
  >
    <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
      No documento
    </div>

    {/* Current user (always first, no interaction) */}
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: currentUserColor || '#3176ff' }}
      >
        {(currentUserName || 'V').charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 truncate">{currentUserName || 'Você'}</div>
        <div className="text-[10px] text-gray-400">Você</div>
      </div>
    </div>

    {/* Remote users (click to follow / unfollow) */}
    {remoteUsers.map(user => {
      const isFollowing = followingUserId === user.id;
      return (
        <button
          key={user.id}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onFollowUser?.(isFollowing ? null : user.id); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
            isFollowing ? 'bg-gray-50' : 'hover:bg-gray-50'
          }`}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800 truncate">{user.name}</div>
            <div className="text-[10px] text-gray-400">
              {isFollowing ? 'Seguindo — clique para parar' : 'Clique para seguir'}
            </div>
          </div>
        </button>
      );
    })}
  </div>
);

const OverflowMenu: React.FC<OverflowMenuProps> = ({
  menuRef, menuPos, viewMode, onToggleViewMode,
  hasTargetBlocks, allTargetsFullWidth, onToggleFullWidth,
  hasSections, onToggleSectionPanel,
  onOpenVersionHistory, onToggleSettings,
}) => {
  return (
    <div
      ref={menuRef}
      className="absolute z-51 bg-white shadow-xl border border-gray-200 rounded-xl py-1 w-56"
      style={{
        left: menuPos?.left ?? 0,
        top: menuPos?.top ?? 0,
        visibility: menuPos ? 'visible' : 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {onOpenVersionHistory && (
        <OverflowItem onClick={onOpenVersionHistory} icon={<Clock size={16} />} label="Histórico de versões" />
      )}
      {onToggleSettings && (
        <OverflowItem onClick={onToggleSettings} icon={<Settings size={16} />} label="Configurações do docs" />
      )}
      {hasSections && onToggleSectionPanel && (
        <OverflowItem onClick={onToggleSectionPanel} icon={<List size={16} />} label="Seções" />
      )}
      <div className="border-t border-gray-100 my-1" />
      <OverflowItem
        onClick={onToggleViewMode}
        icon={viewMode === 'continuous' ? <FileText size={16} /> : <Scroll size={16} />}
        label={viewMode === 'continuous' ? 'Modo paginado' : 'Modo contínuo'}
      />
      {onToggleFullWidth && (
        <OverflowItem
          onClick={onToggleFullWidth}
          disabled={!hasTargetBlocks}
          icon={<MoveHorizontal size={16} />}
          label={allTargetsFullWidth ? 'Adicionar margens' : 'Remover margens'}
        />
      )}
    </div>
  );
};
