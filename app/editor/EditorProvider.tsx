'use client';

import React, { createContext, useContext, useCallback, useRef, useMemo } from 'react';
import { BlockData } from './types';
import { useHistory } from './hooks/useHistory';

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
}

// ---------------------------------------------------------------------------
// Local data source (default — useState + useHistory)
// ---------------------------------------------------------------------------

export function useLocalDataSource(
  initialBlocks: BlockData[],
  debounceMs?: number,
): EditorDataSource {
  const [blocks, setBlocksRaw, undoRaw, redoRaw, canUndo, canRedo] = useHistory<BlockData[]>(initialBlocks, debounceMs);

  const selectedIdsRef = useRef<string[]>([]);

  const trackSelectedIds = useCallback((ids: string[]) => {
    selectedIdsRef.current = ids;
  }, []);

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setBlocksRaw(newBlocks, selectedIdsRef.current);
  }, [setBlocksRaw]);

  return useMemo(() => ({
    blocks, setBlocks, undo: undoRaw, redo: redoRaw, canUndo, canRedo, trackSelectedIds,
  }), [blocks, setBlocks, undoRaw, redoRaw, canUndo, canRedo, trackSelectedIds]);
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
