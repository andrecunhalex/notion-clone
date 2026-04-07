'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CommentThread, CommentEntry, CommentUser } from '../types';
import { generateId } from '../utils';
import { getSupabaseClient } from '../collaboration/supabase-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentsCollabConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  documentId: string;
}

interface UseCommentsProps {
  enabled: boolean;
  user?: CommentUser;
  collabConfig?: CommentsCollabConfig;
  onChange?: (threads: CommentThread[]) => void;
}

export interface UseCommentsReturn {
  threads: CommentThread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  addThread: (blockId: string, selectedText: string, text: string) => string;
  addReply: (threadId: string, text: string) => void;
  resolveThread: (threadId: string) => void;
  reopenThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  deleteComment: (threadId: string, commentId: string) => void;
  enabled: boolean;
  currentUserId: string;
  pendingComment: PendingComment | null;
  startComment: (blockId: string, selectedText: string, range: Range) => void;
  cancelPendingComment: () => void;
}

export interface PendingComment {
  blockId: string;
  selectedText: string;
  range: Range;
}

// ---------------------------------------------------------------------------
// Supabase row ↔ CommentThread mapper
// ---------------------------------------------------------------------------

function rowToThread(row: Record<string, unknown>): CommentThread {
  return {
    id: row.id as string,
    blockId: row.block_id as string,
    selectedText: (row.selected_text as string) || '',
    comments: (row.comments as CommentEntry[]) || [],
    resolved: row.resolved as boolean,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useComments = ({ enabled, user, collabConfig, onChange }: UseCommentsProps): UseCommentsReturn => {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // --- Supabase helpers ---

  const getClient = useCallback(() => {
    if (!collabConfig) return null;
    return getSupabaseClient(collabConfig.supabaseUrl, collabConfig.supabaseAnonKey);
  }, [collabConfig]);

  const docId = collabConfig?.documentId;

  // --- Load comments from Supabase on mount ---

  useEffect(() => {
    if (!enabled || !collabConfig) return;
    const supabase = getSupabaseClient(collabConfig.supabaseUrl, collabConfig.supabaseAnonKey);
    supabase
      .from('document_comments')
      .select('*')
      .eq('document_id', collabConfig.documentId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[comments] Failed to load:', error);
          return;
        }
        if (!mountedRef.current) return;
        const loaded = (data || []).map(rowToThread);
        setThreads(loaded);
        onChangeRef.current?.(loaded);
      });
  }, [enabled, collabConfig]);

  // --- User helper ---

  const getUser = useCallback((): { id: string; name: string; avatar?: string } => {
    if (user) return user;
    return { id: 'anonymous', name: 'Anônimo' };
  }, [user]);

  const createEntry = useCallback((text: string): CommentEntry => {
    const u = getUser();
    return {
      id: generateId(),
      authorId: u.id,
      authorName: u.name,
      authorAvatar: u.avatar,
      text,
      createdAt: new Date().toISOString(),
    };
  }, [getUser]);

  // --- Persist helper: upsert a thread to Supabase ---

  const persistThread = useCallback((thread: CommentThread) => {
    const supabase = getClient();
    if (!supabase || !docId) return;
    supabase
      .from('document_comments')
      .upsert({
        id: thread.id,
        document_id: docId,
        block_id: thread.blockId,
        selected_text: thread.selectedText,
        comments: thread.comments,
        resolved: thread.resolved,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.warn('[comments] Failed to persist thread:', error);
      });
  }, [getClient, docId]);

  const removeFromDb = useCallback((threadId: string) => {
    const supabase = getClient();
    if (!supabase || !docId) return;
    supabase
      .from('document_comments')
      .delete()
      .eq('id', threadId)
      .then(({ error }) => {
        if (error) console.warn('[comments] Failed to delete thread:', error);
      });
  }, [getClient, docId]);

  // --- Actions ---

  const addThread = useCallback((blockId: string, selectedText: string, text: string): string => {
    const threadId = generateId();
    const entry = createEntry(text);
    const thread: CommentThread = {
      id: threadId,
      blockId,
      selectedText,
      comments: [entry],
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    setThreads(prev => {
      const next = [...prev, thread];
      onChangeRef.current?.(next);
      return next;
    });
    setActiveThreadId(threadId);
    setPendingComment(null);
    persistThread(thread);
    return threadId;
  }, [createEntry, persistThread]);

  const addReply = useCallback((threadId: string, text: string) => {
    const entry = createEntry(text);
    setThreads(prev => {
      const next = prev.map(t =>
        t.id === threadId ? { ...t, comments: [...t.comments, entry] } : t
      );
      // Persist the updated thread
      const updated = next.find(t => t.id === threadId);
      if (updated) persistThread(updated);
      onChangeRef.current?.(next);
      return next;
    });
  }, [createEntry, persistThread]);

  const removeHighlight = useCallback((threadId: string) => {
    const spans = document.querySelectorAll(`span[data-comment-id="${threadId}"]`);
    spans.forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        const editable = (parent as HTMLElement).closest?.('[contenteditable]') as HTMLElement | null;
        if (editable) editable.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }, []);

  const resolveThread = useCallback((threadId: string) => {
    removeHighlight(threadId);
    setThreads(prev => {
      const next = prev.map(t =>
        t.id === threadId ? { ...t, resolved: true } : t
      );
      const updated = next.find(t => t.id === threadId);
      if (updated) persistThread(updated);
      onChangeRef.current?.(next);
      return next;
    });
    if (activeThreadIdRef.current === threadId) setActiveThreadId(null);
  }, [persistThread, removeHighlight]);

  const reopenThread = useCallback((threadId: string) => {
    setThreads(prev => {
      const next = prev.map(t =>
        t.id === threadId ? { ...t, resolved: false } : t
      );
      const updated = next.find(t => t.id === threadId);
      if (updated) persistThread(updated);
      onChangeRef.current?.(next);
      return next;
    });
  }, [persistThread]);

  const deleteThread = useCallback((threadId: string) => {
    removeHighlight(threadId);
    setThreads(prev => {
      const next = prev.filter(t => t.id !== threadId);
      onChangeRef.current?.(next);
      return next;
    });
    removeFromDb(threadId);
    if (activeThreadIdRef.current === threadId) setActiveThreadId(null);
  }, [removeFromDb, removeHighlight]);

  const deleteComment = useCallback((threadId: string, commentId: string) => {
    setThreads(prev => {
      const next = prev.map(t => {
        if (t.id !== threadId) return t;
        const filtered = t.comments.filter(c => c.id !== commentId);
        if (filtered.length === 0) {
          removeFromDb(threadId);
          return null as unknown as CommentThread;
        }
        const updated = { ...t, comments: filtered };
        persistThread(updated);
        return updated;
      }).filter(Boolean);
      onChangeRef.current?.(next);
      return next;
    });
  }, [persistThread, removeFromDb]);

  const startComment = useCallback((blockId: string, selectedText: string, range: Range) => {
    setPendingComment({ blockId, selectedText, range });
  }, []);

  const cancelPendingComment = useCallback(() => {
    setPendingComment(null);
  }, []);

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    addThread,
    addReply,
    resolveThread,
    reopenThread,
    deleteThread,
    deleteComment,
    enabled,
    currentUserId: getUser().id,
    pendingComment,
    startComment,
    cancelPendingComment,
  };
};
