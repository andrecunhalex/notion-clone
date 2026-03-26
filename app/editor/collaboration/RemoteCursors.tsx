'use client';

import React, { memo, useEffect, useState, useRef, useCallback } from 'react';
import { RemoteUser, CursorPosition } from './types';

// ---------------------------------------------------------------------------
// Helpers: resolve character offset → DOM position
// ---------------------------------------------------------------------------

function resolveOffset(editableEl: Element, charOffset: number): { node: Node; offset: number } | null {
  // Skip text nodes inside nested contentEditable elements (corrupted content)
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
  // Fallback: end of content
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
    // Fallback for empty elements
    return editableEl.getBoundingClientRect();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// RemoteCursorsOverlay — renders all remote users' cursors + selections
// ---------------------------------------------------------------------------

interface RemoteCursorsOverlayProps {
  remoteUsers: RemoteUser[];
}

export const RemoteCursorsOverlay: React.FC<RemoteCursorsOverlayProps> = memo(({ remoteUsers }) => {
  if (remoteUsers.length === 0) return null;

  return (
    <>
      {remoteUsers.map(user => (
        <RemoteUserCursor key={user.id} user={user} />
      ))}
    </>
  );
});

RemoteCursorsOverlay.displayName = 'RemoteCursorsOverlay';

// ---------------------------------------------------------------------------
// Single remote user's cursor + selection
// ---------------------------------------------------------------------------

interface CursorVisuals {
  cursorRect: DOMRect | null;
  selectionRects: DOMRect[];
}

const RemoteUserCursor: React.FC<{ user: RemoteUser }> = memo(({ user }) => {
  const [visuals, setVisuals] = useState<CursorVisuals>({ cursorRect: null, selectionRects: [] });
  const rafRef = useRef(0);
  const prevCursorRef = useRef<CursorPosition | null>(null);

  const computeVisuals = useCallback(() => {
    const cursor = user.cursor;
    if (!cursor) {
      setVisuals({ cursorRect: null, selectionRects: [] });
      return;
    }

    // Use data-block-id wrapper to find the correct editable element,
    // avoiding nested contentEditable duplicates inside corrupted content
    const wrapper = document.querySelector(`[data-block-id="${cursor.blockId}"]`);
    const editableEl = wrapper?.querySelector(`#editable-${cursor.blockId}`) as HTMLElement | null;
    if (!editableEl) {
      setVisuals({ cursorRect: null, selectionRects: [] });
      return;
    }

    const isCollapsed = cursor.anchorOffset === cursor.focusOffset;

    if (isCollapsed) {
      // Just a cursor line
      const rect = getCursorRect(editableEl, cursor.anchorOffset);
      setVisuals({ cursorRect: rect, selectionRects: [] });
    } else {
      // Selection highlight + cursor at focus
      const selRects = getRectsForRange(editableEl, cursor.anchorOffset, cursor.focusOffset);
      const focusRect = getCursorRect(editableEl, cursor.focusOffset);
      setVisuals({ cursorRect: focusRect, selectionRects: selRects });
    }
  }, [user.cursor]);

  // Recompute when cursor changes
  useEffect(() => {
    const cursorChanged =
      JSON.stringify(user.cursor) !== JSON.stringify(prevCursorRef.current);
    prevCursorRef.current = user.cursor;

    if (cursorChanged) {
      computeVisuals();
    }
  }, [user.cursor, computeVisuals]);

  // Recompute on scroll (positions are fixed, need to track viewport)
  useEffect(() => {
    if (!user.cursor) return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(computeVisuals);
    };

    window.addEventListener('scroll', onScroll, true);
    // Also recompute on resize
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [user.cursor, computeVisuals]);

  if (!visuals.cursorRect && visuals.selectionRects.length === 0) return null;

  return (
    <>
      {/* Selection highlight rectangles */}
      {visuals.selectionRects.map((rect, i) => (
        <div
          key={`sel-${i}`}
          className="fixed pointer-events-none z-30"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: user.color,
            opacity: 0.2,
            borderRadius: 2,
          }}
        />
      ))}

      {/* Cursor line + name label */}
      {visuals.cursorRect && (
        <div
          className="fixed pointer-events-none z-40"
          style={{
            left: visuals.cursorRect.left - 1,
            top: visuals.cursorRect.top,
            width: 2,
            height: visuals.cursorRect.height,
            backgroundColor: user.color,
          }}
        >
          {/* Name label */}
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
