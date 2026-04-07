'use client';

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, memo } from 'react';
import { Check, MoreVertical, Trash2 } from 'lucide-react';
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
// Convert viewport rect to scroll-container-relative absolute position
// ---------------------------------------------------------------------------

function toAbsolutePos(
  anchorRect: DOMRect,
  scrollEl: HTMLElement,
  pageDiv: Element | null,
  cardWidth: number,
): { top: number; left: number } {
  const scrollRect = scrollEl.getBoundingClientRect();
  const top = anchorRect.top - scrollRect.top + scrollEl.scrollTop;

  // Place to the right of the page edge
  const pageRect = pageDiv?.getBoundingClientRect();
  const rightEdge = pageRect ? pageRect.right : anchorRect.right;
  let left = rightEdge - scrollRect.left + scrollEl.scrollLeft + 12;

  // If no room on the right, place on the left
  const maxLeft = scrollEl.scrollLeft + scrollEl.clientWidth - cardWidth - 8;
  if (left > maxLeft) {
    const leftEdge = pageRect ? pageRect.left : anchorRect.left;
    left = leftEdge - scrollRect.left + scrollEl.scrollLeft - cardWidth - 12;
  }

  return { top, left };
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
          <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap wrap-break-word">{entry.text}</p>
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
              <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-30">
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
// Floating Thread Card — absolutely positioned inside scroll container
// ---------------------------------------------------------------------------

const BUBBLE_WIDTH = 28;
const CARD_WIDTH = 300;

const FloatingThreadCard: React.FC<{
  thread: CommentThread;
  isActive: boolean;
  onActivate: (id: string | null) => void;
  onReply: (threadId: string, text: string) => void;
  onResolve: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  currentUserId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}> = memo(({ thread, isActive, onActivate, onReply, onResolve, onDelete, onDeleteComment, currentUserId, scrollRef }) => {
  const [replyText, setReplyText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Compute absolute position
  const computePos = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return null;
    const span = document.querySelector(`span[data-comment-id="${thread.id}"]`);
    if (!span) return null;
    const spanRect = span.getBoundingClientRect();
    const pageDiv = span.closest('[data-page-index]') || span.closest('.max-w-3xl');
    return toAbsolutePos(spanRect, scrollEl, pageDiv, isActive ? CARD_WIDTH : BUBBLE_WIDTH);
  }, [thread.id, isActive, scrollRef]);

  // Calculate position on mount and when isActive changes
  useLayoutEffect(() => {
    setPos(computePos());
  }, [computePos]);

  useEffect(() => {
    const onResize = () => setPos(computePos());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computePos]);

  // Focus input when becoming active
  useEffect(() => {
    if (isActive && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isActive]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  // Close card on outside click
  useEffect(() => {
    if (!isActive) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (cardRef.current?.contains(target)) return;
      if (target.closest(`span[data-comment-id="${thread.id}"]`)) return;
      onActivate(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
  }, [isActive, thread.id, onActivate]);

  const handleReply = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(thread.id, trimmed);
    setReplyText('');
  }, [replyText, thread.id, onReply]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
    if (e.key === 'Escape') onActivate(null);
  }, [handleReply, onActivate]);

  if (!pos) return null;

  // Collapsed bubble
  if (!isActive) {
    return (
      <div

        className="absolute z-40 cursor-pointer"
        style={{ top: pos.top, left: pos.left }}
        onClick={() => onActivate(thread.id)}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="w-7 h-7 rounded-full bg-yellow-400 shadow-md flex items-center justify-center text-white text-xs font-bold hover:bg-yellow-500 transition-colors">
          {thread.comments.length}
        </div>
      </div>
    );
  }

  // Expanded card
  return (
    <div
      ref={cardRef}
      data-comment-card
      className="absolute z-50 w-75 rounded-lg border border-gray-200 bg-white shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="p-3 max-h-100 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <button
            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-1.5 py-0.5 rounded"
            onClick={() => onResolve(thread.id)}
          >
            <Check size={14} /> Resolver
          </button>
          <div className="relative" ref={menuRef}>
            <button className="p-1 rounded hover:bg-gray-100" onClick={() => setMenuOpen(!menuOpen)}>
              <MoreVertical size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-35">
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
      </div>
    </div>
  );
});
FloatingThreadCard.displayName = 'FloatingThreadCard';

// ---------------------------------------------------------------------------
// New Comment Input (absolutely positioned inside scroll container)
// ---------------------------------------------------------------------------

const FloatingNewComment: React.FC<{
  pending: PendingComment;
  onSubmit: (blockId: string, selectedText: string, text: string) => string;
  onCancel: () => void;
  onThreadCreated: (threadId: string, range: Range) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}> = ({ pending, onSubmit, onCancel, onThreadCreated, scrollRef }) => {
  const [text, setText] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      const scrollEl = scrollRef.current;
      if (!scrollEl) { setPos(null); return; }
      const rect = pending.range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { setPos(null); return; }
      const el = pending.range.startContainer.parentElement;
      const pageDiv = el?.closest('[data-page-index]') || el?.closest('.max-w-3xl');
      setPos(toAbsolutePos(rect, scrollEl, pageDiv || null, CARD_WIDTH));
    } catch {
      setPos(null);
    }
  }, [pending.range, scrollRef]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on outside click
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
    const threadId = onSubmit(pending.blockId, pending.selectedText, trimmed);
    onThreadCreated(threadId, pending.range);
    setText('');
  }, [text, pending, onSubmit, onThreadCreated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') onCancel();
  }, [handleSubmit, onCancel]);

  if (!pos) return null;

  return (
    <div
      ref={cardRef}
      data-comment-card
      className="absolute z-50 w-75 rounded-lg border border-yellow-300 bg-white shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="p-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
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

  const activeThreads = useMemo(() => threads.filter(t => !t.resolved), [threads]);

  const handleThreadCreated = useCallback((threadId: string, range: Range) => {
    try {
      const span = document.createElement('span');
      span.setAttribute('data-comment-id', threadId);
      range.surroundContents(span);
      const editable = span.closest('[contenteditable]');
      if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {
      // Range invalidated
    }
  }, []);

  // Click on comment highlights → toggle active thread
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const commentSpan = target.closest('span[data-comment-id]');
      if (commentSpan) {
        const id = commentSpan.getAttribute('data-comment-id');
        if (id) setActiveThreadId(activeThreadIdRef.current === id ? null : id);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [setActiveThreadId]);

  // Manage comment-active CSS class
  useEffect(() => {
    document.querySelectorAll('span.comment-active').forEach(el => el.classList.remove('comment-active'));
    if (activeThreadId) {
      document.querySelectorAll(`span[data-comment-id="${activeThreadId}"]`).forEach(el => el.classList.add('comment-active'));
    }
    return () => {
      document.querySelectorAll('span.comment-active').forEach(el => el.classList.remove('comment-active'));
    };
  }, [activeThreadId]);

  return (
    <>
      {pendingComment && (
        <FloatingNewComment
          pending={pendingComment}
          onSubmit={addThread}
          onCancel={cancelPendingComment}
          onThreadCreated={handleThreadCreated}
          scrollRef={scrollRef}
        />
      )}

      {activeThreads.map(thread => (
        <FloatingThreadCard
          key={thread.id}
          thread={thread}
          isActive={activeThreadId === thread.id}
          onActivate={setActiveThreadId}
          onReply={addReply}
          onResolve={resolveThread}
          onDelete={deleteThread}
          onDeleteComment={deleteComment}
          currentUserId={currentUserId}
          scrollRef={scrollRef}
        />
      ))}
    </>
  );
});
CommentsSidebar.displayName = 'CommentsSidebar';
