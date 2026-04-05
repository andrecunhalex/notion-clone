'use client';

import React, { createContext, useContext, useCallback, useRef, useMemo, useState } from 'react';
import { BlockData } from './types';
import { useHistory } from './hooks/useHistory';

// ---------------------------------------------------------------------------
// Document metadata (font, etc.) — synced alongside blocks
// ---------------------------------------------------------------------------

export interface DocumentMeta {
  documentFont?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Interface do data source — implementações diferentes para local vs sync
// ---------------------------------------------------------------------------

export interface EditorDataSource {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  undo: () => string[];
  redo: () => string[];
  canUndo: boolean;
  canRedo: boolean;
  trackSelectedIds?: (ids: string[]) => void;
  /** Document-level metadata (font, etc.) — synced in collab mode */
  meta: DocumentMeta;
  setMeta: (updates: Partial<DocumentMeta>) => void;
}

// ---------------------------------------------------------------------------
// Local data source (default — useState + useHistory)
// ---------------------------------------------------------------------------

interface LocalState {
  blocks: BlockData[];
  meta: DocumentMeta;
}

export function useLocalDataSource(
  initialBlocks: BlockData[],
  debounceMs?: number,
  initialMeta?: DocumentMeta,
): EditorDataSource {
  const initialState: LocalState = { blocks: initialBlocks, meta: initialMeta || {} };
  const [state, setStateRaw, undoRaw, redoRaw, canUndo, canRedo] = useHistory<LocalState>(initialState, debounceMs);

  const selectedIdsRef = useRef<string[]>([]);

  const trackSelectedIds = useCallback((ids: string[]) => {
    selectedIdsRef.current = ids;
  }, []);

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setStateRaw(prev => ({ ...prev, blocks: newBlocks }), selectedIdsRef.current);
  }, [setStateRaw]);

  const setMeta = useCallback((updates: Partial<DocumentMeta>) => {
    setStateRaw(prev => ({ ...prev, meta: { ...prev.meta, ...updates } }), selectedIdsRef.current);
  }, [setStateRaw]);

  return useMemo(() => ({
    blocks: state.blocks,
    meta: state.meta,
    setBlocks,
    setMeta,
    undo: undoRaw,
    redo: redoRaw,
    canUndo,
    canRedo,
    trackSelectedIds,
  }), [state.blocks, state.meta, setBlocks, setMeta, undoRaw, redoRaw, canUndo, canRedo, trackSelectedIds]);
}

// ---------------------------------------------------------------------------
// Editor Context
// ---------------------------------------------------------------------------

interface EditorContextValue {
  dataSource: EditorDataSource;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorContext must be used within EditorProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface EditorProviderProps {
  dataSource: EditorDataSource;
  children: React.ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ dataSource, children }) => {
  const value = useMemo(() => ({ dataSource }), [dataSource]);
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
};
