import { useState, useCallback, useRef } from 'react';

interface HistoryEntry<T> {
  state: T;
  selectedIds: string[];
}

type UseHistoryReturn<T> = [
  T,                                              // state atual
  (newState: T, currentSelectedIds?: string[]) => void, // set (saves current selection before advancing)
  () => string[],                                 // undo (returns restored selectedIds)
  () => string[],                                 // redo (returns restored selectedIds)
  boolean,                                        // canUndo
  boolean                                         // canRedo
];

// Debounce window: rapid edits within this interval update the same history entry
const DEBOUNCE_MS = 500;

export const useHistory = <T>(initialState: T): UseHistoryReturn<T> => {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<HistoryEntry<T>[]>([
    { state: initialState, selectedIds: [] }
  ]);
  const [pointer, setPointer] = useState(0);

  // Use refs to avoid stale closures in rapid successive calls
  const pointerRef = useRef(0);
  const historyRef = useRef<HistoryEntry<T>[]>([{ state: initialState, selectedIds: [] }]);
  pointerRef.current = pointer;
  historyRef.current = history;

  // Debounce: track last edit time to merge rapid changes
  const lastEditTime = useRef(0);
  const isDebouncing = useRef(false);

  const set = useCallback((newState: T, currentSelectedIds: string[] = []) => {
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditTime.current;
    lastEditTime.current = now;

    // If within debounce window, update the current entry in-place instead of pushing new
    if (isDebouncing.current && timeSinceLastEdit < DEBOUNCE_MS) {
      setHistory(prev => {
        const p = pointerRef.current;
        const updated = [...prev];
        if (updated[p]) {
          updated[p] = { state: newState, selectedIds: currentSelectedIds };
        }
        // Keep historyRef in sync for undo/redo between renders
        historyRef.current = updated;
        return updated;
      });
      setState(newState);
      return;
    }

    // New edit: push a new history entry
    isDebouncing.current = true;
    setHistory(prev => {
      const p = pointerRef.current;
      const updated = prev.slice(0, p + 1);
      // Save the current selectedIds on the current entry
      if (updated[p]) {
        updated[p] = { ...updated[p], selectedIds: currentSelectedIds };
      }
      // Push new entry
      updated.push({ state: newState, selectedIds: [] });
      const newPointer = updated.length - 1;
      pointerRef.current = newPointer;
      setPointer(newPointer);
      // Keep historyRef in sync for undo/redo between renders
      historyRef.current = updated;
      return updated;
    });
    setState(newState);
  }, []);

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
