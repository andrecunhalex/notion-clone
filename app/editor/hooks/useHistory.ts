import { useState, useCallback } from 'react';

type UseHistoryReturn<T> = [
  T,                    // state atual
  (newState: T) => void, // set
  () => void,           // undo
  () => void,           // redo
  boolean,              // canUndo
  boolean               // canRedo
];

export const useHistory = <T>(initialState: T): UseHistoryReturn<T> => {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<T[]>([initialState]);
  const [pointer, setPointer] = useState(0);

  const set = useCallback((newState: T) => {
    setHistory(prev => {
      const nextHistory = [...prev.slice(0, pointer + 1), newState];
      setPointer(nextHistory.length - 1);
      return nextHistory;
    });
    setState(newState);
  }, [pointer]);

  const undo = useCallback(() => {
    if (pointer > 0) {
      setPointer(p => p - 1);
      setState(history[pointer - 1]);
    }
  }, [pointer, history]);

  const redo = useCallback(() => {
    if (pointer < history.length - 1) {
      setPointer(p => p + 1);
      setState(history[pointer + 1]);
    }
  }, [pointer, history]);

  return [state, set, undo, redo, pointer > 0, pointer < history.length - 1];
};
