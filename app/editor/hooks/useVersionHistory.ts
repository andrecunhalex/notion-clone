'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { BlockData, DocumentVersion, VersionHistoryCollabConfig } from '../types';
import { getSupabaseClient } from '../collaboration/supabase-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseVersionHistoryOptions {
  enabled: boolean;
  collabConfig?: VersionHistoryCollabConfig;
  currentBlocks: BlockData[];
  currentMeta: Record<string, unknown>;
  /** Sync status — snapshot is only captured after 'synced' to avoid false edits */
  syncStatus?: string;
}

export interface UseVersionHistoryReturn {
  /** Whether the feature is available (enabled + has config) */
  available: boolean;
  /** Overlay state */
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Version data */
  versions: DocumentVersion[];
  loading: boolean;
  selectedVersion: DocumentVersion | null;
  selectVersion: (v: DocumentVersion | null) => void;
  /** Diff toggle */
  highlightChanges: boolean;
  toggleHighlightChanges: () => void;
  /** Returns the blocks to restore (caller does setBlocks) */
  restore: () => BlockData[] | null;
  /** Map of block ID → diff type ('modified' | 'deleted') */
  blockDiffs: Map<string, BlockDiffType>;
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

export type BlockDiffType = 'modified' | 'deleted' | 'added';

function computeBlockDiffs(
  versionBlocks: BlockData[],
  currentBlocks: BlockData[],
): Map<string, BlockDiffType> {
  const diffs = new Map<string, BlockDiffType>();
  const currentMap = new Map(currentBlocks.map(b => [b.id, b]));
  const versionIds = new Set(versionBlocks.map(b => b.id));

  for (const vBlock of versionBlocks) {
    const cur = currentMap.get(vBlock.id);
    if (!cur) {
      diffs.set(vBlock.id, 'deleted');
    } else if (
      cur.content !== vBlock.content ||
      cur.type !== vBlock.type ||
      JSON.stringify(cur.tableData) !== JSON.stringify(vBlock.tableData) ||
      JSON.stringify(cur.imageData) !== JSON.stringify(vBlock.imageData) ||
      JSON.stringify(cur.designBlockData) !== JSON.stringify(vBlock.designBlockData)
    ) {
      diffs.set(vBlock.id, 'modified');
    }
  }

  // Detect blocks added in current version (not in old version)
  for (const cBlock of currentBlocks) {
    if (!versionIds.has(cBlock.id)) {
      diffs.set(cBlock.id, 'added');
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVersionHistory({
  enabled,
  collabConfig,
  currentBlocks,
  currentMeta,
  syncStatus,
}: UseVersionHistoryOptions): UseVersionHistoryReturn {
  const available = enabled && !!collabConfig;

  // --- Overlay state ---
  const [isOpen, setIsOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [highlightChanges, setHighlightChanges] = useState(true);

  // --- Session snapshot (saved on first edit) ---
  const snapshotRef = useRef<BlockData[] | null>(null);
  const snapshotMetaRef = useRef<Record<string, unknown>>({});
  const versionSavedRef = useRef(false);
  // Tracks the blocks reference captured right after sync completes
  const syncedBlocksRef = useRef<BlockData[] | null>(null);

  // Capture snapshot once sync is complete
  // This ensures we don't confuse Supabase/IndexedDB data loading with user edits
  useEffect(() => {
    if (!available || syncStatus !== 'synced') return;
    // Only capture once per session
    if (snapshotRef.current) return;

    snapshotRef.current = structuredClone(currentBlocks);
    snapshotMetaRef.current = structuredClone(currentMeta);
    syncedBlocksRef.current = currentBlocks; // store reference for edit detection
  }, [available, syncStatus, currentBlocks, currentMeta]);

  // Detect first edit after sync and save pre-edit snapshot to Supabase
  useEffect(() => {
    if (!available || !collabConfig || versionSavedRef.current) return;
    // Wait until snapshot was captured (sync completed)
    if (!snapshotRef.current || !syncedBlocksRef.current) return;
    // Same reference = no edit happened yet (just sync updates)
    if (currentBlocks === syncedBlocksRef.current) return;

    versionSavedRef.current = true;
    const snapshot = snapshotRef.current;
    const meta = snapshotMetaRef.current;

    // Save pre-edit state as version (fire and forget)
    const supabase = getSupabaseClient(collabConfig.supabaseUrl, collabConfig.supabaseAnonKey);
    supabase
      .from('document_versions')
      .insert({
        document_id: collabConfig.documentId,
        blocks: snapshot,
        meta,
        user_id: collabConfig.user.id,
        user_name: collabConfig.user.name,
        user_color: collabConfig.user.color,
      })
      .then(({ error }) => {
        if (error) console.warn('[version-history] Failed to save version:', error);
      });
  }, [available, collabConfig, currentBlocks]);

  // Guard against setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // --- Fetch versions ---
  const fetchVersions = useCallback(async () => {
    if (!collabConfig) return;
    setLoading(true);
    try {
      const supabase = getSupabaseClient(collabConfig.supabaseUrl, collabConfig.supabaseAnonKey);
      const { data, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', collabConfig.documentId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (!mountedRef.current) return;

      const fetched: DocumentVersion[] = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        document_id: row.document_id as string,
        blocks: row.blocks as BlockData[],
        meta: (row.meta || {}) as Record<string, unknown>,
        user_id: row.user_id as string,
        user_name: row.user_name as string,
        user_color: row.user_color as string,
        created_at: row.created_at as string,
      }));

      setVersions(fetched);
    } catch (err) {
      console.warn('[version-history] Failed to fetch versions:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [collabConfig]);

  // --- Open / Close ---
  const open = useCallback(() => {
    setIsOpen(true);
    setSelectedVersion(null);
    fetchVersions();
  }, [fetchVersions]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedVersion(null);
  }, []);

  // --- Restore ---
  const restore = useCallback((): BlockData[] | null => {
    if (!selectedVersion) return null;
    return selectedVersion.blocks;
  }, [selectedVersion]);

  // --- Diff ---
  const blockDiffs = useMemo(() => {
    if (!selectedVersion || !highlightChanges) return new Map<string, BlockDiffType>();
    return computeBlockDiffs(selectedVersion.blocks, currentBlocks);
  }, [selectedVersion, highlightChanges, currentBlocks]);

  // --- No-op return when unavailable ---
  const noop = useCallback(() => {}, []);
  const noopRestore = useCallback(() => null, []);

  if (!available) {
    return {
      available: false,
      isOpen: false,
      open: noop,
      close: noop,
      versions: [],
      loading: false,
      selectedVersion: null,
      selectVersion: noop,
      highlightChanges: false,
      toggleHighlightChanges: noop,
      restore: noopRestore,
      blockDiffs: new Map(),
    };
  }

  return {
    available: true,
    isOpen,
    open,
    close,
    versions,
    loading,
    selectedVersion,
    selectVersion: setSelectedVersion,
    highlightChanges,
    toggleHighlightChanges: () => setHighlightChanges(prev => !prev),
    restore,
    blockDiffs,
  };
}
