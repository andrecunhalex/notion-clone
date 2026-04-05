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
  available: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  versions: DocumentVersion[];
  loading: boolean;
  selectedVersion: DocumentVersion | null;
  selectVersion: (v: DocumentVersion | null) => void;
  restore: () => BlockData[] | null;
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

  // --- Session snapshot (saved on first edit) ---
  const snapshotRef = useRef<BlockData[] | null>(null);
  const snapshotMetaRef = useRef<Record<string, unknown>>({});
  const versionSavedRef = useRef(false);
  // Fingerprint to detect real structural changes (not just reference changes)
  const syncedFingerprintRef = useRef<string | null>(null);

  /** Cheap fingerprint: block count + first/last IDs + content hash of first block */
  function fingerprint(blocks: BlockData[]): string {
    if (blocks.length === 0) return '0';
    return `${blocks.length}:${blocks[0].id}:${blocks[blocks.length - 1].id}:${blocks[0].content.length}`;
  }

  // Capture snapshot once sync is complete
  useEffect(() => {
    if (!available || syncStatus !== 'synced') return;
    if (snapshotRef.current) return; // Only once per session

    snapshotRef.current = structuredClone(currentBlocks);
    snapshotMetaRef.current = structuredClone(currentMeta);
    syncedFingerprintRef.current = fingerprint(currentBlocks);
  }, [available, syncStatus, currentBlocks, currentMeta]);

  // Detect first edit after sync and save pre-edit snapshot to Supabase
  useEffect(() => {
    if (!available || !collabConfig || versionSavedRef.current) return;
    if (!snapshotRef.current || !syncedFingerprintRef.current) return;
    // Compare fingerprint — only save if structure actually changed
    if (fingerprint(currentBlocks) === syncedFingerprintRef.current) return;

    versionSavedRef.current = true;
    const snapshot = snapshotRef.current;
    const meta = snapshotMetaRef.current;

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
      restore: noopRestore,
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
    restore,
  };
}
