'use client';

/**
 * useFloatingToolbar — UI state + positioning for the contextual bubble that
 * appears above a text selection.
 *
 * This hook is **purely a UI layer**. It receives a shared `commands` object
 * from `useFormatCommands` (hoisted to `NotionEditor`) and owns only:
 *
 *   • `visible` / `position` / `toolbarRef` — where the bubble renders
 *   • submenu open state (colorOpen, fontOpen, ...) + menu refs + menu positions
 *   • `linkUrl` / `refSearch` — form state for the inline link and ref inputs
 *   • click-outside and re-positioning effects
 *   • the `toolbar:toggle-link` listener that opens its link submenu in
 *     response to ⌘K (dispatched by `useFormatCommands`)
 *
 * All formatting logic — detection, apply, keyboard shortcuts, link
 * navigation — lives in `useFormatCommands` and is passed through
 * unchanged.
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { FormatCommands } from './useFormatCommands';

interface UseFloatingToolbarProps {
  commands: FormatCommands;
  /** Scroll container ref — positions become absolute-in-container when provided. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const useFloatingToolbar = ({ commands, scrollRef }: UseFloatingToolbarProps) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  // Submenu open states
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [refSearch, setRefSearch] = useState('');

  // Submenu refs + positions
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const weightMenuRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);
  const refMenuRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [fontMenuPos, setFontMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [weightMenuPos, setWeightMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [sizeMenuPos, setSizeMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [alignMenuPos, setAlignMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [linkMenuPos, setLinkMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [refMenuPos, setRefMenuPos] = useState<{ left: number; top: number } | null>(null);

  // Tracks whether an input-bearing submenu (size, link, ref) is open. When
  // true, selection changes must NOT hide the toolbar — the user is typing
  // in one of those inputs and losing the bubble would cancel their edit.
  const inputSubmenuOpenRef = useRef(false);
  useEffect(() => {
    inputSubmenuOpenRef.current = linkOpen || refOpen || sizeOpen;
  }, [linkOpen, refOpen, sizeOpen]);

  // -------------------------------------------------------------------------
  // Viewport ↔ scroll-container coordinate conversion
  // -------------------------------------------------------------------------

  const toAbsolute = useCallback((left: number, top: number): { left: number; top: number } => {
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return { left, top };
    const sr = scrollEl.getBoundingClientRect();
    return { left: left - sr.left + scrollEl.scrollLeft, top: top - sr.top + scrollEl.scrollTop };
  }, [scrollRef]);

  // -------------------------------------------------------------------------
  // Visibility driven by the live selection
  // -------------------------------------------------------------------------

  const updatePosition = useCallback(() => {
    if (inputSubmenuOpenRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setVisible(false); return; }
    if (!commands.cursorInEditable()) { setVisible(false); return; }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setVisible(false); return; }

    setVisible(true);
  }, [commands]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updatePosition, 50);
    };
    const onMouseUp = () => setTimeout(updatePosition, 10);

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [updatePosition]);

  // Position the bar after visibility flips or format state changes.
  useLayoutEffect(() => {
    if (!visible || !toolbarRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
    let top = rect.top - toolbarRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    if (left < 4) left = 4;
    if (left + toolbarRect.width > vw - 4) left = vw - toolbarRect.width - 4;
    if (top + toolbarRect.height > vh - 4) top = vh - toolbarRect.height - 4;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition(toAbsolute(left, top)); // measure-then-position: legitimate layout effect
  }, [visible, commands.activeFormats, toAbsolute]);

  // -------------------------------------------------------------------------
  // Close submenus on click outside / hide
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolbarRef.current?.contains(target)) return;
      if (colorMenuRef.current?.contains(target)) return;
      if (fontMenuRef.current?.contains(target)) return;
      if (weightMenuRef.current?.contains(target)) return;
      if (sizeMenuRef.current?.contains(target)) return;
      if (alignMenuRef.current?.contains(target)) return;
      if (linkMenuRef.current?.contains(target)) return;
      if (refMenuRef.current?.contains(target)) return;
      setLinkOpen(false); setRefOpen(false); setColorOpen(false);
      setFontOpen(false); setWeightOpen(false); setSizeOpen(false); setAlignOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [visible]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!visible) {
      setColorOpen(false); setFontOpen(false); setWeightOpen(false); setSizeOpen(false);
      setAlignOpen(false); setLinkOpen(false); setRefOpen(false);
    }
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // -------------------------------------------------------------------------
  // Submenu positioning
  // -------------------------------------------------------------------------

  const positionSubmenu = useCallback((
    menuRef: React.RefObject<HTMLDivElement | null>,
    setPos: (pos: { left: number; top: number } | null) => void,
    alignRight?: boolean,
  ) => {
    if (!menuRef.current || !toolbarRef.current) { setPos(null); return; }
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = alignRight ? toolbarRect.right - menuRect.width : toolbarRect.left;
    let top = toolbarRect.bottom + 4;
    if (top + menuRect.height > vh - 4) top = toolbarRect.top - menuRect.height - 4;
    if (left + menuRect.width > vw - 4) left = vw - menuRect.width - 4;
    if (left < 4) left = 4;
    setPos(toAbsolute(left, top));
  }, [toAbsolute]);

  // Measure-then-position for each submenu — a legitimate useLayoutEffect
  // pattern: we read the just-mounted menu's rect and write its coordinates
  // back in the same layout commit. The rule below is silenced because the
  // alternative (double-render via state + getSnapshotBeforeUpdate) is
  // strictly worse here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (colorOpen) positionSubmenu(colorMenuRef, setColorMenuPos);
    else setColorMenuPos(null);

    if (fontOpen) positionSubmenu(fontMenuRef, setFontMenuPos);
    else setFontMenuPos(null);

    if (weightOpen) positionSubmenu(weightMenuRef, setWeightMenuPos);
    else setWeightMenuPos(null);

    if (sizeOpen) positionSubmenu(sizeMenuRef, setSizeMenuPos);
    else setSizeMenuPos(null);

    if (alignOpen) positionSubmenu(alignMenuRef, setAlignMenuPos, true);
    else setAlignMenuPos(null);

    if (linkOpen) {
      positionSubmenu(linkMenuRef, setLinkMenuPos);
      setTimeout(() => linkInputRef.current?.focus(), 0);
    } else setLinkMenuPos(null);

    if (refOpen) {
      positionSubmenu(refMenuRef, setRefMenuPos);
      setTimeout(() => refInputRef.current?.focus(), 0);
    } else setRefMenuPos(null);
  }, [colorOpen, fontOpen, weightOpen, sizeOpen, alignOpen, linkOpen, refOpen, position, positionSubmenu]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // -------------------------------------------------------------------------
  // Close-all helper + ⌘K toggle-link event listener
  // -------------------------------------------------------------------------

  const closeSubmenusExcept = useCallback((keep?: string) => {
    if (keep !== 'color') setColorOpen(false);
    if (keep !== 'font') setFontOpen(false);
    if (keep !== 'weight') setWeightOpen(false);
    if (keep !== 'size') setSizeOpen(false);
    if (keep !== 'align') setAlignOpen(false);
    if (keep !== 'link') setLinkOpen(false);
    if (keep !== 'ref') setRefOpen(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      commands.saveSelection();
      setLinkUrl(detail?.href || '');
      setLinkOpen(prev => !prev);
      closeSubmenusExcept('link');
    };
    document.addEventListener('toolbar:toggle-link', handler);
    return () => document.removeEventListener('toolbar:toggle-link', handler);
  }, [commands, closeSubmenusExcept]);

  return {
    visible, position, toolbarRef,
    // submenu open states
    colorOpen, setColorOpen, fontOpen, setFontOpen,
    weightOpen, setWeightOpen, sizeOpen, setSizeOpen, alignOpen, setAlignOpen,
    linkOpen, setLinkOpen, refOpen, setRefOpen,
    linkUrl, setLinkUrl, refSearch, setRefSearch,
    // submenu refs + positions
    colorMenuRef, fontMenuRef, weightMenuRef, sizeMenuRef, alignMenuRef,
    linkMenuRef, refMenuRef, linkInputRef, refInputRef,
    colorMenuPos, fontMenuPos, weightMenuPos, sizeMenuPos, alignMenuPos,
    linkMenuPos, refMenuPos,
    closeSubmenusExcept,
  };
};
