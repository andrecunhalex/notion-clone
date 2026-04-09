'use client';

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, memo } from 'react';
import { Check, MoreVertical, Trash2, X } from 'lucide-react';
import type { CommentThread, CommentEntry } from '../types';
import type { UseCommentsReturn, PendingComment } from '../hooks/useComments';

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}min`;
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 1 && date.getDate() === now.getDate()) return `Hoje ${time}`;
  if (diffDays < 2) return `Ontem ${time}`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ---------------------------------------------------------------------------
// Simple mobile detection hook (matches Tailwind lg: 1024px)
// ---------------------------------------------------------------------------

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ---------------------------------------------------------------------------
// Convert viewport rect to scroll-container-absolute position
// ---------------------------------------------------------------------------

function toAbsolutePos(
  anchorRect: DOMRect,
  scrollEl: HTMLElement,
  pageDiv: Element | null,
  cardWidth: number,
): { top: number; left: number } {
  const scrollRect = scrollEl.getBoundingClientRect();
  const top = anchorRect.top - scrollRect.top + scrollEl.scrollTop;

  const pageRect = pageDiv?.getBoundingClientRect();
  const rightEdge = pageRect ? pageRect.right : anchorRect.right;
  let left = rightEdge - scrollRect.left + scrollEl.scrollLeft + 12;

  // If no room on the right, try the left side
  const maxLeft = scrollEl.scrollLeft + scrollEl.clientWidth - cardWidth - 8;
  if (left > maxLeft) {
    const leftEdge = pageRect ? pageRect.left : anchorRect.left;
    const leftSide = leftEdge - scrollRect.left + scrollEl.scrollLeft - cardWidth - 12;
    // Only go left if there's actually space there; otherwise clamp right
    left = leftSide >= scrollEl.scrollLeft ? leftSide : Math.max(8, maxLeft);
  }

  return { top, left };
}

// ---------------------------------------------------------------------------
// Find text inside a DOM element and return a Range around it
// ---------------------------------------------------------------------------

function findTextInElement(root: HTMLElement, searchText: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let accumulated = '';
  const textNodes: { node: Text; start: number }[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // Skip text inside existing comment spans to avoid double-wrapping
    if ((node.parentElement as HTMLElement)?.closest?.('span[data-comment-id]')) continue;
    if ((node.parentElement as HTMLElement)?.closest?.('span[data-pending-comment]')) continue;
    textNodes.push({ node, start: accumulated.length });
    accumulated += node.textContent || '';
  }

  const index = accumulated.indexOf(searchText);
  if (index === -1) return null;

  const endIndex = index + searchText.length;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const { node, start } of textNodes) {
    const nodeEnd = start + (node.textContent?.length || 0);
    if (!startNode && index >= start && index < nodeEnd) {
      startNode = node;
      startOffset = index - start;
    }
    if (endIndex > start && endIndex <= nodeEnd) {
      endNode = node;
      endOffset = endIndex - start;
      break;
    }
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

// ---------------------------------------------------------------------------
// Unwrap a span, moving its children to its parent
// ---------------------------------------------------------------------------

function unwrapSpan(span: Element) {
  const parent = span.parentNode;
  if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
}

// ---------------------------------------------------------------------------
// Insert a highlight span around a Range (handles cross-element ranges)
// ---------------------------------------------------------------------------

function insertHighlightSpan(range: Range, attr: string, value: string): boolean {
  try {
    const span = document.createElement('span');
    span.setAttribute(attr, value);
    range.surroundContents(span);
    return true;
  } catch {
    try {
      const span = document.createElement('span');
      span.setAttribute(attr, value);
      span.appendChild(range.extractContents());
      range.insertNode(span);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Comment Entry
// ---------------------------------------------------------------------------

const CommentEntryItem: React.FC<{
  entry: CommentEntry;
  isFirst: boolean;
  threadId: string;
  onDelete: (threadId: string, commentId: string) => void;
  currentUserId: string;
}> = memo(({ entry, isFirst, threadId, onDelete, currentUserId }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const isOwner = entry.authorId === currentUserId;

  return (
    <div className={`group relative ${isFirst ? '' : 'mt-3 pt-3 border-t border-gray-100'}`}>
      <div className="flex items-start gap-2">
        {entry.authorAvatar ? (
          <img src={entry.authorAvatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-medium shrink-0">
            {entry.authorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">{entry.authorName}</span>
            <span className="text-xs text-gray-400 shrink-0">{formatTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
        {isOwner && (
          <div className="relative" ref={menuRef}>
            <button
              className="p-0.5 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreVertical size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => { onDelete(threadId, entry.id); setMenuOpen(false); }}
                >
                  <Trash2 size={13} /> Excluir
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
CommentEntryItem.displayName = 'CommentEntryItem';

// ---------------------------------------------------------------------------
// Shared thread content (used by both desktop card and mobile sheet)
// ---------------------------------------------------------------------------

const ThreadContent: React.FC<{
  thread: CommentThread;
  onReply: (threadId: string, text: string) => void;
  onResolve: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onClose: () => void;
  currentUserId: string;
  autoFocus?: boolean;
}> = ({ thread, onReply, onResolve, onDelete, onDeleteComment, onClose, currentUserId, autoFocus }) => {
  const [replyText, setReplyText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleReply = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(thread.id, trimmed);
    setReplyText('');
  }, [replyText, thread.id, onReply]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Stop propagation so global editor shortcuts (Ctrl+A, etc.) don't fire
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
    if (e.key === 'Escape') onClose();
  }, [handleReply, onClose]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <button
          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-1.5 py-0.5 rounded"
          onClick={() => onResolve(thread.id)}
        >
          <Check size={14} /> Resolver
        </button>
        <div className="flex items-center gap-1">
          <div className="relative" ref={menuRef}>
            <button className="p-1 rounded hover:bg-gray-100" onClick={() => setMenuOpen(!menuOpen)}>
              <MoreVertical size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => { onDelete(thread.id); setMenuOpen(false); }}
                >
                  <Trash2 size={13} /> Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments */}
      {thread.comments.map((entry, i) => (
        <CommentEntryItem
          key={entry.id}
          entry={entry}
          isFirst={i === 0}
          threadId={thread.id}
          onDelete={onDeleteComment}
          currentUserId={currentUserId}
        />
      ))}

      {/* Reply input */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <textarea
          ref={inputRef}
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Responda..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-200"
          rows={2}
        />
        {replyText.trim() && (
          <div className="flex justify-end gap-1.5 mt-1.5">
            <button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded" onClick={() => setReplyText('')}>
              Cancelar
            </button>
            <button className="text-xs bg-yellow-500 text-white hover:bg-yellow-600 px-3 py-1 rounded font-medium" onClick={handleReply}>
              Responder
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const BUBBLE_WIDTH = 28;
const CARD_WIDTH = 300;

// ---------------------------------------------------------------------------
// Desktop: expanded card (absolute positioned in scroll container)
// ---------------------------------------------------------------------------

const DesktopThreadCard: React.FC<{
  thread: CommentThread;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onActivate: (id: string | null) => void;
  onReply: (threadId: string, text: string) => void;
  onResolve: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  currentUserId: string;
}> = memo(({ thread, scrollRef, onActivate, onReply, onResolve, onDelete, onDeleteComment, currentUserId }) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return null;
    const span = document.querySelector(`span[data-comment-id="${thread.id}"]`);
    if (!span) return null;
    const spanRect = span.getBoundingClientRect();
    const pageDiv = span.closest('[data-page-index]') || span.closest('.max-w-3xl');
    return toAbsolutePos(spanRect, scrollEl, pageDiv, CARD_WIDTH);
  }, [thread.id, scrollRef]);

  useLayoutEffect(() => { setPos(computePos()); }, [computePos]);

  useEffect(() => {
    const onResize = () => setPos(computePos());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computePos]);

  // Close on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (cardRef.current?.contains(target)) return;
      if (target.closest(`span[data-comment-id="${thread.id}"]`)) return;
      onActivate(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
  }, [thread.id, onActivate]);

  if (!pos) return null;

  return (
    <div
      ref={cardRef}
      className="absolute z-50 w-[300px] rounded-lg border border-gray-200 bg-white shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="p-3 max-h-[400px] overflow-y-auto">
        <ThreadContent
          thread={thread}
          onReply={onReply}
          onResolve={onResolve}
          onDelete={onDelete}
          onDeleteComment={onDeleteComment}
          onClose={() => onActivate(null)}
          currentUserId={currentUserId}
          autoFocus
        />
      </div>
    </div>
  );
});
DesktopThreadCard.displayName = 'DesktopThreadCard';

// ---------------------------------------------------------------------------
// Mobile: bottom sheet for active thread or new comment
// ---------------------------------------------------------------------------

const MobileCommentSheet: React.FC<{
  thread?: CommentThread;
  pending?: PendingComment;
  onClose: () => void;
  onReply: (threadId: string, text: string) => void;
  onResolve: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onSubmitNew: (blockId: string, selectedText: string, text: string) => string;
  currentUserId: string;
}> = ({ thread, pending, onClose, onReply, onResolve, onDelete, onDeleteComment, onSubmitNew, currentUserId }) => {
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pending) setTimeout(() => inputRef.current?.focus(), 100);
  }, [pending]);

  const handleSubmitNew = () => {
    if (!pending) return;
    const trimmed = newText.trim();
    if (!trimmed) return;
    onSubmitNew(pending.blockId, pending.selectedText, trimmed);
    setNewText('');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed left-0 right-0 bottom-0 z-50">
        <div className="bg-white rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col">
          {/* Handle + close */}
          <div className="shrink-0 pt-3 pb-2 px-4">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-end">
              <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="overflow-y-auto px-4 pb-6">
            {thread && (
              <ThreadContent
                thread={thread}
                onReply={onReply}
                onResolve={onResolve}
                onDelete={onDelete}
                onDeleteComment={onDeleteComment}
                onClose={onClose}
                currentUserId={currentUserId}
                autoFocus
              />
            )}
            {pending && !thread && (
              <>
                <textarea
                  ref={inputRef}
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitNew(); }
                    if (e.key === 'Escape') onClose();
                  }}
                  placeholder="Adicione um comentário..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-200"
                  rows={3}
                />
                <div className="flex justify-end gap-1.5 mt-1.5">
                  <button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded" onClick={onClose}>
                    Cancelar
                  </button>
                  <button
                    className="text-xs bg-yellow-500 text-white hover:bg-yellow-600 px-3 py-1 rounded font-medium disabled:opacity-40"
                    disabled={!newText.trim()}
                    onClick={handleSubmitNew}
                  >
                    Comentar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Desktop: new comment card (absolute positioned)
// ---------------------------------------------------------------------------

const DesktopNewComment: React.FC<{
  pending: PendingComment;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (blockId: string, selectedText: string, text: string) => string;
  onCancel: () => void;
}> = ({ pending, scrollRef, onSubmit, onCancel }) => {
  const [text, setText] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      const scrollEl = scrollRef.current;
      if (!scrollEl) { setPos(null); return; }

      // Try positioning from the original range
      let rect = pending.range.getBoundingClientRect();
      let anchorEl: Element | null = pending.range.startContainer.parentElement;

      // Fallback: if range rect is empty (stale range / off-screen), find the pending highlight or text in block
      if (rect.width === 0 && rect.height === 0) {
        const pendingSpan = document.querySelector('span[data-pending-comment]');
        if (pendingSpan) {
          rect = pendingSpan.getBoundingClientRect();
          anchorEl = pendingSpan;
        } else {
          const blockEl = document.getElementById(`editable-${pending.blockId}`)
            || document.querySelector(`[data-block-id="${pending.blockId}"]`);
          if (blockEl) {
            const found = findTextInElement(blockEl as HTMLElement, pending.selectedText);
            if (found) {
              rect = found.getBoundingClientRect();
              anchorEl = found.startContainer.parentElement;
            }
          }
        }
      }

      if (rect.width === 0 && rect.height === 0) { setPos(null); return; }
      const pageDiv = anchorEl?.closest('[data-page-index]') || anchorEl?.closest('.max-w-3xl');
      setPos(toAbsolutePos(rect, scrollEl, pageDiv || null, CARD_WIDTH));
    } catch { setPos(null); }
  }, [pending.range, pending.blockId, pending.selectedText, scrollRef]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      onCancel();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
  }, [onCancel]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(pending.blockId, pending.selectedText, trimmed);
    setText('');
  }, [text, pending, onSubmit]);

  if (!pos) return null;

  return (
    <div
      ref={cardRef}
      className="absolute z-50 w-[300px] rounded-lg border border-yellow-300 bg-white shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="p-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Adicione um comentário..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-200"
          rows={3}
        />
        <div className="flex justify-end gap-1.5 mt-1.5">
          <button className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="text-xs bg-yellow-500 text-white hover:bg-yellow-600 px-3 py-1 rounded font-medium disabled:opacity-40"
            disabled={!text.trim()}
            onClick={handleSubmit}
          >
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CommentsSidebarProps {
  comments: UseCommentsReturn;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const CommentsSidebar: React.FC<CommentsSidebarProps> = memo(({ comments, scrollRef }) => {
  const {
    threads, activeThreadId, setActiveThreadId, currentUserId,
    addThread, addReply, resolveThread,
    deleteThread, deleteComment, pendingComment, cancelPendingComment,
  } = comments;

  const isMobile = useIsMobile();
  const activeThreads = useMemo(() => threads.filter(t => !t.resolved), [threads]);
  const activeThread = activeThreadId ? threads.find(t => t.id === activeThreadId) : undefined;

  // -----------------------------------------------------------------------
  // Ephemeral decoration system — MutationObserver-based
  //
  // Comment highlights are NOT part of block content. They are applied as
  // ephemeral DOM spans and re-applied whenever the DOM changes (typing,
  // undo, collaborative sync, block reordering). This means:
  //  - undo/redo never brings back stale highlights
  //  - block moves are tracked automatically
  //  - first-load works as soon as content is in the DOM
  // -----------------------------------------------------------------------

  const [bubblePositions, setBubblePositions] = useState<Map<string, { top: number; left: number }>>(new Map());
  const observerRef = useRef<MutationObserver | null>(null);
  const activeThreadsRef = useRef(activeThreads);
  activeThreadsRef.current = activeThreads;
  const pendingRef = useRef(pendingComment);
  pendingRef.current = pendingComment;
  const activeIdRef = useRef(activeThreadId);
  activeIdRef.current = activeThreadId;

  const applyDecorations = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Pause observer while we mutate the DOM
    observerRef.current?.disconnect();

    const currentThreads = activeThreadsRef.current;
    const pending = pendingRef.current;
    const activeIds = new Set(currentThreads.map(t => t.id));

    // 1. Remove orphaned comment spans (resolved / deleted threads)
    scrollEl.querySelectorAll('span[data-comment-id]').forEach(span => {
      const id = span.getAttribute('data-comment-id');
      if (!id || !activeIds.has(id)) unwrapSpan(span);
    });

    // 2. Remove pending spans if no pending comment
    if (!pending) {
      scrollEl.querySelectorAll('span[data-pending-comment]').forEach(unwrapSpan);
    }

    // 3. Apply pending comment highlight
    if (pending && !scrollEl.querySelector('span[data-pending-comment]')) {
      try {
        const rect = pending.range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          insertHighlightSpan(pending.range, 'data-pending-comment', 'true');
        } else {
          const blockEl = document.getElementById(`editable-${pending.blockId}`)
            || scrollEl.querySelector(`[data-block-id="${pending.blockId}"]`);
          if (blockEl) {
            const found = findTextInElement(blockEl as HTMLElement, pending.selectedText);
            if (found) insertHighlightSpan(found, 'data-pending-comment', 'true');
          }
        }
      } catch { /* best-effort */ }
    }

    // 4. Apply missing comment highlights + compute bubble positions
    const newPositions = new Map<string, { top: number; left: number }>();
    const scrollRect = scrollEl.getBoundingClientRect();

    for (const thread of currentThreads) {
      let span = scrollEl.querySelector(`span[data-comment-id="${thread.id}"]`);

      if (!span) {
        const blockEl = document.getElementById(`editable-${thread.blockId}`)
          || scrollEl.querySelector(`[data-block-id="${thread.blockId}"]`);
        if (blockEl && (blockEl as HTMLElement).textContent?.trim()) {
          const range = findTextInElement(blockEl as HTMLElement, thread.selectedText);
          if (range) {
            insertHighlightSpan(range, 'data-comment-id', thread.id);
            span = scrollEl.querySelector(`span[data-comment-id="${thread.id}"]`);
          }
        }
      }

      if (span) {
        const spanRect = span.getBoundingClientRect();
        if (spanRect.width > 0 || spanRect.height > 0) {
          const pageDiv = span.closest('[data-page-index]') || span.closest('.max-w-3xl');
          newPositions.set(thread.id, toAbsolutePos(spanRect, scrollEl, pageDiv, BUBBLE_WIDTH));
        }

        // Manage comment-active class
        span.classList.toggle('comment-active', thread.id === activeIdRef.current);
      }
    }

    setBubblePositions(newPositions);

    // Resume observer
    observerRef.current?.observe(scrollEl, { childList: true, subtree: true, characterData: true });
  }, [scrollRef]);

  // Apply decorations synchronously after render (before paint)
  useLayoutEffect(() => {
    applyDecorations();
  }, [activeThreads, pendingComment, activeThreadId, applyDecorations]);

  // MutationObserver: re-apply after external DOM changes (typing, undo, sync)
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let rafId: number | null = null;
    const scheduleApply = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { rafId = null; applyDecorations(); });
    };

    const observer = new MutationObserver(scheduleApply);
    observerRef.current = observer;
    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true });

    window.addEventListener('resize', scheduleApply);
    return () => {
      observer.disconnect();
      observerRef.current = null;
      window.removeEventListener('resize', scheduleApply);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scrollRef, applyDecorations]);

  // Click on comment highlights → toggle active thread
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const commentSpan = target.closest('span[data-comment-id]');
      if (commentSpan) {
        const id = commentSpan.getAttribute('data-comment-id');
        if (id) setActiveThreadId(activeIdRef.current === id ? null : id);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [setActiveThreadId]);

  return (
    <>
      {/* Bubbles — inline from computed positions */}
      {activeThreads.map(thread => {
        if (thread.id === activeThreadId) return null;
        const pos = bubblePositions.get(thread.id);
        if (!pos) return null;
        return (
          <div
            key={thread.id}
            className="absolute z-40 cursor-pointer"
            style={{ top: pos.top, left: pos.left }}
            onClick={() => setActiveThreadId(thread.id)}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="w-7 h-7 rounded-full bg-yellow-400 shadow-md flex items-center justify-center text-white text-xs font-bold hover:bg-yellow-500 transition-colors">
              {thread.comments.length}
            </div>
          </div>
        );
      })}

      {/* Desktop: absolute positioned cards */}
      {!isMobile && (
        <>
          {pendingComment && (
            <DesktopNewComment
              pending={pendingComment}
              scrollRef={scrollRef}
              onSubmit={addThread}
              onCancel={cancelPendingComment}
            />
          )}
          {activeThread && !activeThread.resolved && (
            <DesktopThreadCard
              key={activeThread.id}
              thread={activeThread}
              scrollRef={scrollRef}
              onActivate={setActiveThreadId}
              onReply={addReply}
              onResolve={resolveThread}
              onDelete={deleteThread}
              onDeleteComment={deleteComment}
              currentUserId={currentUserId}
            />
          )}
        </>
      )}

      {/* Mobile: bottom sheet */}
      {isMobile && (activeThread || pendingComment) && (
        <MobileCommentSheet
          thread={activeThread && !activeThread.resolved ? activeThread : undefined}
          pending={pendingComment || undefined}
          onClose={() => { setActiveThreadId(null); cancelPendingComment(); }}
          onReply={addReply}
          onResolve={resolveThread}
          onDelete={deleteThread}
          onDeleteComment={deleteComment}
          onSubmitNew={addThread}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
}, (prev, next) => {
  const a = prev.comments;
  const b = next.comments;
  return (
    a.threads === b.threads &&
    a.activeThreadId === b.activeThreadId &&
    a.pendingComment === b.pendingComment &&
    prev.scrollRef === next.scrollRef
  );
});
CommentsSidebar.displayName = 'CommentsSidebar';
