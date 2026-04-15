import { useState, useCallback, useEffect, useRef } from 'react';

interface HistoryEntry<T> {
  state: T;
  selectedIds: string[];
}

type SetArg<T> = T | ((prev: T) => T);

type UseHistoryReturn<T> = [
  T,                                              // state atual
  (newState: SetArg<T>, currentSelectedIds?: string[]) => void, // set (value or updater)
  () => string[],                                 // undo (returns restored selectedIds)
  () => string[],                                 // redo (returns restored selectedIds)
  boolean,                                        // canUndo
  boolean                                         // canRedo
];

const DEFAULT_DEBOUNCE_MS = 500;
const MAX_ENTRIES = 100;

export const useHistory = <T>(initialState: T, debounceMs: number = DEFAULT_DEBOUNCE_MS): UseHistoryReturn<T> => {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<HistoryEntry<T>[]>([
    { state: initialState, selectedIds: [] }
  ]);
  const [pointer, setPointer] = useState(0);

  // Use refs to avoid stale closures in rapid successive calls
  const pointerRef = useRef(0);
  const historyRef = useRef<HistoryEntry<T>[]>([{ state: initialState, selectedIds: [] }]);
  useEffect(() => { pointerRef.current = pointer; });
  useEffect(() => { historyRef.current = history; });

  // Debounce: track last edit time to merge rapid changes
  const lastEditTime = useRef(0);
  const isDebouncing = useRef(false);

  // Track block structure fingerprint to break debounce on structural changes
  const lastBlockFingerprintRef = useRef('');

  // Ref to read current state synchronously for updater functions
  const stateRef = useRef(initialState);
  useEffect(() => { stateRef.current = state; });

  const set = useCallback((newStateOrFn: SetArg<T>, currentSelectedIds: string[] = []) => {
    const newState = typeof newStateOrFn === 'function'
      ? (newStateOrFn as (prev: T) => T)(stateRef.current)
      : newStateOrFn;

    const now = Date.now();
    const timeSinceLastEdit = now - lastEditTime.current;
    lastEditTime.current = now;

    // Detect structural changes (add/remove/reorder blocks) to break debounce
    // Use length + first/last ID as a cheap fingerprint instead of joining all IDs
    let structureChanged = false;
    if (newState && typeof newState === 'object' && 'blocks' in (newState as Record<string, unknown>)) {
      const blocks = (newState as unknown as { blocks: { id: string }[] }).blocks;
      const fingerprint = `${blocks.length}:${blocks[0]?.id || ''}:${blocks[blocks.length - 1]?.id || ''}`;
      if (fingerprint !== lastBlockFingerprintRef.current) {
        structureChanged = lastBlockFingerprintRef.current !== '';
        lastBlockFingerprintRef.current = fingerprint;
      }
    }

    // If within debounce window AND no structural change, merge into current entry
    if (isDebouncing.current && timeSinceLastEdit < debounceMs && !structureChanged) {
      setHistory(prev => {
        const p = pointerRef.current;
        const updated = [...prev];
        if (updated[p]) {
          updated[p] = { state: newState, selectedIds: currentSelectedIds };
        }
        historyRef.current = updated;
        return updated;
      });
      stateRef.current = newState;
      setState(newState);
      return;
    }

    // New edit: push a new history entry
    isDebouncing.current = true;
    setHistory(prev => {
      const p = pointerRef.current;
      const updated = prev.slice(0, p + 1);
      if (updated[p]) {
        updated[p] = { ...updated[p], selectedIds: currentSelectedIds };
      }
      updated.push({ state: newState, selectedIds: [] });

      // Trim oldest entries if exceeding limit
      if (updated.length > MAX_ENTRIES) {
        const excess = updated.length - MAX_ENTRIES;
        updated.splice(0, excess);
      }

      const newPointer = updated.length - 1;
      pointerRef.current = newPointer;
      setPointer(newPointer);
      historyRef.current = updated;
      return updated;
    });
    stateRef.current = newState;
    setState(newState);
  }, [debounceMs]);

  const undo = useCallback((): string[] => {
    // Stop debouncing so next edit starts a fresh entry
    isDebouncing.current = false;
    lastEditTime.current = 0;

    const p = pointerRef.current;
    const h = historyRef.current;
    if (p > 0 && h[p - 1]) {
      const entry = h[p - 1];
      pointerRef.current = p - 1;
      setPointer(p - 1);
      setState(entry.state);
      return entry.selectedIds;
    }
    return [];
  }, []);

  const redo = useCallback((): string[] => {
    // Stop debouncing so next edit starts a fresh entry
    isDebouncing.current = false;
    lastEditTime.current = 0;

    const p = pointerRef.current;
    const h = historyRef.current;
    if (p < h.length - 1 && h[p + 1]) {
      const entry = h[p + 1];
      pointerRef.current = p + 1;
      setPointer(p + 1);
      setState(entry.state);
      return entry.selectedIds;
    }
    return [];
  }, []);

  return [state, set, undo, redo, pointer > 0, pointer < history.length - 1];
};
