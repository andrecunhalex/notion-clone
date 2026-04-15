'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { EditorDataSource, DocumentMeta } from '../EditorProvider';
import { BlockData } from '../types';
import { CollaborationConfig, RemoteUser, SyncStatus } from './types';
import { YjsDocSync } from './yjs-sync';
import { SupabaseProvider } from './supabase-provider';

// ---------------------------------------------------------------------------
// Helpers for character-offset cursor tracking
// ---------------------------------------------------------------------------

function getCharOffset(editableEl: Element, node: Node | null, offset: number): number {
  if (!node) return 0;
  try {
    const range = document.createRange();
    range.setStart(editableEl, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function restoreCursorAtOffset(el: Element, targetOffset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeLen = node.textContent?.length || 0;
    if (charCount + nodeLen >= targetOffset) {
      const range = document.createRange();
      range.setStart(node, Math.min(targetOffset - charCount, nodeLen));
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    charCount += nodeLen;
  }
  // Fallback: end of content
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

interface CursorMeta { blockId: string; charOffset: number }

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseCollaborativeEditorOptions {
  config: CollaborationConfig;
  initialBlocks?: BlockData[];
}

interface UseCollaborativeEditorReturn {
  dataSource: EditorDataSource;
  remoteUsers: RemoteUser[];
  syncStatus: SyncStatus;
  saveNow: () => Promise<void>;
}

export function useCollaborativeEditor({
  config,
  initialBlocks = [{ id: 'initial', type: 'text', content: '' }],
}: UseCollaborativeEditorOptions): UseCollaborativeEditorReturn {
  const [blocks, setBlocksState] = useState<BlockData[]>(initialBlocks);
  const [meta, setMetaState] = useState<DocumentMeta>({});
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');

  const docRef = useRef<Y.Doc | null>(null);
  const syncRef = useRef<YjsDocSync | null>(null);
  const providerRef = useRef<SupabaseProvider | null>(null);
  const idbRef = useRef<IndexeddbPersistence | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const yMetaRef = useRef<Y.Map<unknown> | null>(null);

  // Initialize Yjs doc + providers
  useEffect(() => {
    const doc = new Y.Doc();
    const sync = new YjsDocSync(doc);
    const yMeta = doc.getMap<unknown>('meta');

    docRef.current = doc;
    syncRef.current = sync;
    yMetaRef.current = yMeta;

    // Observe meta changes from remote
    const metaObserver = () => {
      const obj: DocumentMeta = {};
      yMeta.forEach((value, key) => { obj[key] = value; });
      setMetaState(obj);
    };
    yMeta.observe(metaObserver);

    const idb = new IndexeddbPersistence(`doc:${config.documentId}`, doc);
    idbRef.current = idb;

    idb.on('synced', () => {
      const cached = sync.getBlocks();
      if (cached.length > 0) {
        setBlocksState(cached);
      }
      // Load meta from IndexedDB
      metaObserver();
    });

    const provider = new SupabaseProvider(doc, config);
    providerRef.current = provider;

    provider.onStatusChange((status) => {
      setSyncStatus(status);
      if (status === 'synced') {
        // Only initialize with empty block if doc is still empty after Supabase sync
        const current = sync.getBlocks();
        if (current.length === 0) {
          sync.initIfEmpty(initialBlocks);
        }
        setBlocksState(sync.getBlocks());
        metaObserver();
      }
    });

    provider.onRemoteUsersChange(setRemoteUsers);

    const unobserve = sync.onRemoteChange((newBlocks) => {
      setBlocksState(newBlocks);
    });

    return () => {
      yMeta.unobserve(metaObserver);
      unobserve();
      provider.destroy();
      idb.destroy();
      doc.destroy();
      docRef.current = null;
      syncRef.current = null;
      providerRef.current = null;
      idbRef.current = null;
      yMetaRef.current = null;
    };
  }, [config.documentId, config.supabaseUrl, config.supabaseAnonKey, config.user.id]);

  // ---------------------------------------------------------------------------
  // Automatic cursor/selection tracking via selectionchange
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const onSelectionChange = () => {
      clearTimeout(timer);
      // Light debounce — provider handles heavier dedup + 300ms debounce
      timer = setTimeout(() => {
        const provider = providerRef.current;
        if (!provider) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          provider.trackCursor(null);
          return;
        }

        const anchorEl = sel.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? sel.anchorNode as Element
          : sel.anchorNode?.parentElement;

        // Use data-block-id wrapper as anchor to avoid picking up
        // a nested contentEditable that shares the same id prefix
        const blockWrapper = anchorEl?.closest('[data-block-id]');
        if (!blockWrapper) {
          provider.trackCursor(null);
          return;
        }

        const blockId = blockWrapper.getAttribute('data-block-id')!;
        // Find the editable element: standard block or design block zone
        const standardEditable = blockWrapper.querySelector(`#editable-${blockId}`);
        const designEditable = anchorEl?.closest('[data-editable]');
        const editable = (standardEditable || designEditable) as Element | null;
        if (!editable) {
          provider.trackCursor(null);
          return;
        }

        const anchorOffset = getCharOffset(editable, sel.anchorNode, sel.anchorOffset);
        const focusOffset = sel.isCollapsed
          ? anchorOffset
          : getCharOffset(editable, sel.focusNode, sel.focusOffset);

        // For design blocks, include which editable zone the cursor is in
        const editableKey = designEditable?.getAttribute('data-editable') || undefined;

        provider.trackCursor({ blockId, anchorOffset, focusOffset, editableKey });
      }, 50);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Data source
  // ---------------------------------------------------------------------------

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setBlocksState(newBlocks);
    syncRef.current?.setBlocks(newBlocks);
  }, []);

  const setMeta = useCallback((updates: Partial<DocumentMeta>) => {
    const yMeta = yMetaRef.current;
    if (!yMeta) return;
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) yMeta.delete(key);
        else yMeta.set(key, value);
      }
    }, 'local');
    // Optimistic local update
    setMetaState(prev => ({ ...prev, ...updates }));
  }, []);

  const trackSelectedIds = useCallback((ids: string[]) => {
    selectedIdsRef.current = ids;
  }, []);

  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!docRef.current) return;
    const yBlocks = docRef.current.getArray('blocks');
    const yMeta = docRef.current.getMap('meta');
    const um = new Y.UndoManager([yBlocks, yMeta], {
      trackedOrigins: new Set(['local']),
    });
    undoManagerRef.current = um;

    const refreshFlags = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };

    // Save cursor position on each undo stack entry for precise restoration
    um.on('stack-item-added', (event: { stackItem: { meta: Map<string, unknown> } }) => {
      const sel = window.getSelection();
      refreshFlags();
      if (!sel || sel.rangeCount === 0) return;
      const anchorEl = sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? sel.anchorNode as Element
        : sel.anchorNode?.parentElement;
      const blockWrapper = anchorEl?.closest('[data-block-id]');
      if (!blockWrapper) return;
      const blockId = blockWrapper.getAttribute('data-block-id')!;
      const editable = blockWrapper.querySelector(`#editable-${blockId}`) as Element | null;
      if (!editable) return;
      const charOffset = getCharOffset(editable, sel.anchorNode, sel.anchorOffset);
      event.stackItem.meta.set('cursor', { blockId, charOffset } as CursorMeta);
    });
    um.on('stack-item-popped', refreshFlags);
    um.on('stack-cleared', refreshFlags);

    return () => um.destroy();
  }, [config.documentId]);

  const refreshMeta = useCallback(() => {
    const yMeta = yMetaRef.current;
    if (yMeta) {
      const obj: DocumentMeta = {};
      yMeta.forEach((value, key) => { obj[key] = value; });
      setMetaState(obj);
    }
  }, []);

  const undo = useCallback((): string[] => {
    const um = undoManagerRef.current;
    // Read cursor metadata from the stack item we're about to undo
    let cursor: CursorMeta | null = null;
    if (um && um.undoStack.length > 0) {
      cursor = um.undoStack[um.undoStack.length - 1].meta.get('cursor') as CursorMeta ?? null;
    }
    // Suppress observer so we don't get a double setBlocksState
    syncRef.current?.suppressRemote(() => { um?.undo(); });
    const newBlocks = syncRef.current?.getBlocks() || [];
    setBlocksState(newBlocks);
    refreshMeta();
    // Restore cursor position
    if (cursor) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`editable-${cursor!.blockId}`);
        if (el) {
          el.focus({ preventScroll: true });
          restoreCursorAtOffset(el, cursor!.charOffset);
        }
      });
    }
    return selectedIdsRef.current;
  }, [refreshMeta]);

  const redo = useCallback((): string[] => {
    const um = undoManagerRef.current;
    let cursor: CursorMeta | null = null;
    if (um && um.redoStack.length > 0) {
      cursor = um.redoStack[um.redoStack.length - 1].meta.get('cursor') as CursorMeta ?? null;
    }
    syncRef.current?.suppressRemote(() => { um?.redo(); });
    const newBlocks = syncRef.current?.getBlocks() || [];
    setBlocksState(newBlocks);
    refreshMeta();
    if (cursor) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`editable-${cursor!.blockId}`);
        if (el) {
          el.focus({ preventScroll: true });
          restoreCursorAtOffset(el, cursor!.charOffset);
        }
      });
    }
    return selectedIdsRef.current;
  }, [refreshMeta]);

  const saveNow = useCallback(async () => {
    await providerRef.current?.saveNow();
  }, []);

  const dataSource: EditorDataSource = useMemo(() => ({
    blocks,
    meta,
    setBlocks,
    setMeta,
    undo,
    redo,
    canUndo,
    canRedo,
    trackSelectedIds,
  }), [blocks, meta, setBlocks, setMeta, undo, redo, canUndo, canRedo, trackSelectedIds]);

  return { dataSource, remoteUsers, syncStatus, saveNow };
}
