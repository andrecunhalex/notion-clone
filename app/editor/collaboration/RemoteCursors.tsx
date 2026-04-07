'use client';

import React, { memo, useEffect, useState, useRef, useCallback } from 'react';
import { RemoteUser } from './types';

// ---------------------------------------------------------------------------
// Helpers: resolve character offset → DOM position
// ---------------------------------------------------------------------------

function resolveOffset(editableEl: Element, charOffset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(editableEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== editableEl) {
        if (parent.hasAttribute('contenteditable')) return NodeFilter.FILTER_REJECT;
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let remaining = charOffset;
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const len = textNode.textContent?.length || 0;
    if (remaining <= len) {
      return { node: textNode, offset: remaining };
    }
    remaining -= len;
  }
  const lastChild = editableEl.lastChild || editableEl;
  return { node: lastChild, offset: lastChild.nodeType === Node.TEXT_NODE ? (lastChild.textContent?.length || 0) : 0 };
}

function getRectsForRange(editableEl: Element, start: number, end: number): DOMRect[] {
  const startPos = resolveOffset(editableEl, Math.min(start, end));
  const endPos = resolveOffset(editableEl, Math.max(start, end));
  if (!startPos || !endPos) return [];

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    return Array.from(range.getClientRects());
  } catch {
    return [];
  }
}

function getCursorRect(editableEl: Element, offset: number): DOMRect | null {
  const pos = resolveOffset(editableEl, offset);
  if (!pos) return null;

  try {
    const range = document.createRange();
    range.setStart(pos.node, pos.offset);
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length > 0) return rects[0];
    return editableEl.getBoundingClientRect();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Convert viewport DOMRect to scroll-container-absolute position
// ---------------------------------------------------------------------------

interface AbsRect { left: number; top: number; width: number; height: number }

function toAbsolute(rect: DOMRect, scrollEl: HTMLElement): AbsRect {
  const sr = scrollEl.getBoundingClientRect();
  return {
    left: rect.left - sr.left + scrollEl.scrollLeft,
    top: rect.top - sr.top + scrollEl.scrollTop,
    width: rect.width,
    height: rect.height,
  };
}

// ---------------------------------------------------------------------------
// RemoteCursorsOverlay
// ---------------------------------------------------------------------------

interface RemoteCursorsOverlayProps {
  remoteUsers: RemoteUser[];
  /** Scroll container — cursors use absolute positioning inside it */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const RemoteCursorsOverlay: React.FC<RemoteCursorsOverlayProps> = memo(({ remoteUsers, scrollRef }) => {
  if (remoteUsers.length === 0) return null;

  return (
    <>
      {remoteUsers.map(user => (
        <RemoteUserCursor key={user.id} user={user} scrollRef={scrollRef} />
      ))}
    </>
  );
});

RemoteCursorsOverlay.displayName = 'RemoteCursorsOverlay';

// ---------------------------------------------------------------------------
// Single remote user cursor + selection (absolute positioned overlay)
// ---------------------------------------------------------------------------

interface CursorVisuals {
  cursorPos: AbsRect | null;
  selectionRects: AbsRect[];
}

const EMPTY_VISUALS: CursorVisuals = { cursorPos: null, selectionRects: [] };

const RemoteUserCursor: React.FC<{
  user: RemoteUser;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}> = memo(({ user, scrollRef }) => {
  const [visuals, setVisuals] = useState<CursorVisuals>(EMPTY_VISUALS);
  const prevCursorRef = useRef<string | null>(null);

  const computeVisuals = useCallback(() => {
    const cursor = user.cursor;
    const scrollEl = scrollRef?.current;
    if (!cursor || !scrollEl) {
      setVisuals(EMPTY_VISUALS);
      return;
    }

    const wrapper = document.querySelector(`[data-block-id="${cursor.blockId}"]`);
    const editableEl = (
      wrapper?.querySelector(`#editable-${cursor.blockId}`) ||
      (cursor.editableKey
        ? wrapper?.querySelector(`[data-editable="${cursor.editableKey}"]`)
        : wrapper?.querySelector('[data-editable]'))
    ) as HTMLElement | null;
    if (!editableEl) {
      setVisuals(EMPTY_VISUALS);
      return;
    }

    const isCollapsed = cursor.anchorOffset === cursor.focusOffset;

    if (isCollapsed) {
      const rect = getCursorRect(editableEl, cursor.anchorOffset);
      setVisuals({
        cursorPos: rect ? toAbsolute(rect, scrollEl) : null,
        selectionRects: [],
      });
    } else {
      const selRects = getRectsForRange(editableEl, cursor.anchorOffset, cursor.focusOffset);
      const focusRect = getCursorRect(editableEl, cursor.focusOffset);
      setVisuals({
        cursorPos: focusRect ? toAbsolute(focusRect, scrollEl) : null,
        selectionRects: selRects.map(r => toAbsolute(r, scrollEl)),
      });
    }
  }, [user.cursor, scrollRef]);

  // Recompute when cursor position changes
  useEffect(() => {
    const cursorKey = JSON.stringify(user.cursor);
    if (cursorKey === prevCursorRef.current) return;
    prevCursorRef.current = cursorKey;
    computeVisuals();
  }, [user.cursor, computeVisuals]);

  // Recompute on resize only (absolute positioning handles scroll)
  useEffect(() => {
    if (!user.cursor) return;
    const onResize = () => computeVisuals();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [user.cursor, computeVisuals]);

  if (!visuals.cursorPos && visuals.selectionRects.length === 0) return null;

  return (
    <>
      {/* Selection highlight rectangles */}
      {visuals.selectionRects.map((r, i) => (
        <div
          key={`sel-${i}`}
          className="absolute pointer-events-none z-30"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            backgroundColor: user.color,
            opacity: 0.2,
            borderRadius: 2,
          }}
        />
      ))}

      {/* Cursor line + name label */}
      {visuals.cursorPos && (
        <div
          className="absolute pointer-events-none z-40"
          style={{
            left: visuals.cursorPos.left - 1,
            top: visuals.cursorPos.top,
            width: 2,
            height: visuals.cursorPos.height,
            backgroundColor: user.color,
          }}
        >
          <div
            className="absolute bottom-full left-0 mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap select-none"
            style={{ backgroundColor: user.color, color: 'white' }}
          >
            {user.name}
          </div>
        </div>
      )}
    </>
  );
});

RemoteUserCursor.displayName = 'RemoteUserCursor';

// ---------------------------------------------------------------------------
// Sync status indicator
// ---------------------------------------------------------------------------

interface SyncStatusBadgeProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'synced';
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  disconnected: { color: '#ef4444', label: 'Desconectado' },
  connecting: { color: '#f59e0b', label: 'Conectando...' },
  connected: { color: '#3b82f6', label: 'Conectado' },
  synced: { color: '#10b981', label: 'Sincronizado' },
};

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = memo(({ status }) => {
  const { color, label } = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
});

SyncStatusBadge.displayName = 'SyncStatusBadge';
