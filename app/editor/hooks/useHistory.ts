import { useState, useCallback } from 'react';

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

export const useHistory = <T>(initialState: T): UseHistoryReturn<T> => {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<HistoryEntry<T>[]>([
    { state: initialState, selectedIds: [] }
  ]);
  const [pointer, setPointer] = useState(0);

  const set = useCallback((newState: T, currentSelectedIds: string[] = []) => {
    setHistory(prev => {
      const updated = prev.slice(0, pointer + 1);
      // Save the current selectedIds on the current entry (selection active at this state)
      updated[pointer] = { ...updated[pointer], selectedIds: currentSelectedIds };
      // Push new entry
      updated.push({ state: newState, selectedIds: [] });
      setPointer(updated.length - 1);
      return updated;
    });
    setState(newState);
  }, [pointer]);

  const undo = useCallback((): string[] => {
    if (pointer > 0) {
      const entry = history[pointer - 1];
      setPointer(p => p - 1);
      setState(entry.state);
      return entry.selectedIds;
    }
    return [];
  }, [pointer, history]);

  const redo = useCallback((): string[] => {
    if (pointer < history.length - 1) {
      const entry = history[pointer + 1];
      setPointer(p => p + 1);
      setState(entry.state);
      return entry.selectedIds;
    }
    return [];
  }, [pointer, history]);

  return [state, set, undo, redo, pointer > 0, pointer < history.length - 1];
};
