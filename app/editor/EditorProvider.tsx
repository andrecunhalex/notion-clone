'use client';

import React, { createContext, useContext, useCallback, useRef } from 'react';
import { BlockData, BlockType } from './types';
import { generateId, focusBlock } from './utils';
import { useHistory } from './hooks/useHistory';

// ---------------------------------------------------------------------------
// Interface do data source — implementações diferentes para local vs sync
// ---------------------------------------------------------------------------

export interface EditorDataSource {
  /** Current blocks state */
  blocks: BlockData[];
  /** Replace the entire blocks array (for local mode) */
  setBlocks: (blocks: BlockData[]) => void;
  /** Undo last change — returns restored selectedIds */
  undo: () => string[];
  /** Redo last undone change — returns restored selectedIds */
  redo: () => string[];
  canUndo: boolean;
  canRedo: boolean;
}

// ---------------------------------------------------------------------------
// Local data source (default — useState + useHistory)
// ---------------------------------------------------------------------------

export function useLocalDataSource(initialBlocks: BlockData[]): EditorDataSource {
  const [blocks, setBlocksRaw, undoRaw, redoRaw, canUndo, canRedo] = useHistory<BlockData[]>(initialBlocks);

  const selectedIdsRef = useRef<string[]>([]);

  const setBlocks = useCallback((newBlocks: BlockData[]) => {
    setBlocksRaw(newBlocks, selectedIdsRef.current);
  }, [setBlocksRaw]);

  // Expose a way to update selectedIds for history tracking
  (setBlocks as any).__setSelectedIds = (ids: string[]) => {
    selectedIdsRef.current = ids;
  };

  return { blocks, setBlocks, undo: undoRaw, redo: redoRaw, canUndo, canRedo };
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
  return (
    <EditorContext.Provider value={{ dataSource }}>
      {children}
    </EditorContext.Provider>
  );
};
