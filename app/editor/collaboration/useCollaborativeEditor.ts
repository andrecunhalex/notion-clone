'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { EditorDataSource, DocumentMeta } from '../EditorProvider';
import { BlockData } from '../types';
import { CollaborationConfig, RemoteUser, SyncStatus, CursorPosition } from './types';
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
      } else {
        sync.initIfEmpty(initialBlocks);
        setBlocksState(sync.getBlocks());
      }
      // Load meta from IndexedDB
      metaObserver();
    });

    const provider = new SupabaseProvider(doc, config);
    providerRef.current = provider;

    provider.onStatusChange((status) => {
      setSyncStatus(status);
      if (status === 'synced') {
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
        const editable = anchorEl?.closest('[id^="editable-"]');

        if (!editable) {
          provider.trackCursor(null);
          return;
        }

        const blockId = editable.id.replace('editable-', '');
        const anchorOffset = getCharOffset(editable, sel.anchorNode, sel.anchorOffset);
        const focusOffset = sel.isCollapsed
          ? anchorOffset
          : getCharOffset(editable, sel.focusNode, sel.focusOffset);

        provider.trackCursor({ blockId, anchorOffset, focusOffset });
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

  useEffect(() => {
    if (!docRef.current) return;
    const yBlocks = docRef.current.getArray('blocks');
    const yMeta = docRef.current.getMap('meta');
    const um = new Y.UndoManager([yBlocks, yMeta], {
      trackedOrigins: new Set(['local']),
    });
    undoManagerRef.current = um;
    return () => um.destroy();
  }, [config.documentId]);

  const undo = useCallback((): string[] => {
    undoManagerRef.current?.undo();
    const newBlocks = syncRef.current?.getBlocks() || [];
    setBlocksState(newBlocks);
    // Also refresh meta
    const yMeta = yMetaRef.current;
    if (yMeta) {
      const obj: DocumentMeta = {};
      yMeta.forEach((value, key) => { obj[key] = value; });
      setMetaState(obj);
    }
    return selectedIdsRef.current;
  }, []);

  const redo = useCallback((): string[] => {
    undoManagerRef.current?.redo();
    const newBlocks = syncRef.current?.getBlocks() || [];
    setBlocksState(newBlocks);
    const yMeta = yMetaRef.current;
    if (yMeta) {
      const obj: DocumentMeta = {};
      yMeta.forEach((value, key) => { obj[key] = value; });
      setMetaState(obj);
    }
    return selectedIdsRef.current;
  }, []);

  const canUndo = undoManagerRef.current ? undoManagerRef.current.undoStack.length > 0 : false;
  const canRedo = undoManagerRef.current ? undoManagerRef.current.redoStack.length > 0 : false;

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
