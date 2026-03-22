import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../hooks/useHistory';

describe('useHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('initializes with given state', () => {
    const { result } = renderHook(() => useHistory('initial'));
    const [state, , , , canUndo, canRedo] = result.current;
    expect(state).toBe('initial');
    expect(canUndo).toBe(false);
    expect(canRedo).toBe(false);
  });

  it('updates state when set is called', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(result.current[4]).toBe(true); // canUndo
  });

  it('undo restores previous state', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current[1]('b'));

    // Wait for debounce
    vi.advanceTimersByTime(600);
    act(() => result.current[1]('c'));

    act(() => result.current[2]()); // undo
    expect(result.current[0]).toBe('b');

    act(() => result.current[2]()); // undo again
    expect(result.current[0]).toBe('a');
  });

  it('redo restores undone state', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current[1]('b'));
    vi.advanceTimersByTime(600);
    act(() => result.current[1]('c'));

    act(() => result.current[2]()); // undo → b
    act(() => result.current[3]()); // redo → c
    expect(result.current[0]).toBe('c');
  });

  it('undo returns selectedIds from the entry being restored', () => {
    const { result } = renderHook(() => useHistory('a'));
    // set('b') saves selectedIds on the CURRENT entry (the 'a' entry)
    // Then pushes new entry for 'b'
    act(() => result.current[1]('b', ['id-1', 'id-2']));
    vi.advanceTimersByTime(600);
    // set('c') saves selectedIds on the CURRENT entry (the 'b' entry)
    act(() => result.current[1]('c', ['id-3']));

    // undo from 'c' goes to 'b' — returns 'b' entry's selectedIds
    // The 'b' entry had ['id-3'] saved on it by the set('c') call
    let restoredIds: string[] = [];
    act(() => { restoredIds = result.current[2](); }); // undo → b
    expect(restoredIds).toEqual(['id-3']);
  });

  it('debounces rapid edits into single history entry', () => {
    const { result } = renderHook(() => useHistory('a', 500));

    // Rapid edits within 500ms
    act(() => result.current[1]('b'));
    vi.advanceTimersByTime(100);
    act(() => result.current[1]('c'));
    vi.advanceTimersByTime(100);
    act(() => result.current[1]('d'));

    expect(result.current[0]).toBe('d');

    // Single undo should go back to 'a' (all rapid edits merged)
    act(() => result.current[2]()); // undo
    expect(result.current[0]).toBe('a');
  });

  it('creates new entry after debounce window expires', () => {
    const { result } = renderHook(() => useHistory('a', 500));

    act(() => result.current[1]('b'));
    vi.advanceTimersByTime(600); // exceed debounce
    act(() => result.current[1]('c'));

    act(() => result.current[2]()); // undo → b
    expect(result.current[0]).toBe('b');
    act(() => result.current[2]()); // undo → a
    expect(result.current[0]).toBe('a');
  });

  it('new edit after undo discards redo stack', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current[1]('b'));
    vi.advanceTimersByTime(600);
    act(() => result.current[1]('c'));

    act(() => result.current[2]()); // undo → b

    vi.advanceTimersByTime(600);
    act(() => result.current[1]('d')); // new edit from 'b'

    expect(result.current[5]).toBe(false); // canRedo = false (redo stack gone)
    expect(result.current[0]).toBe('d');
  });

  it('undo at beginning returns empty array', () => {
    const { result } = renderHook(() => useHistory('a'));
    let ids: string[] = ['something'];
    act(() => { ids = result.current[2](); });
    expect(ids).toEqual([]);
    expect(result.current[0]).toBe('a'); // unchanged
  });

  it('redo at end returns empty array', () => {
    const { result } = renderHook(() => useHistory('a'));
    let ids: string[] = ['something'];
    act(() => { ids = result.current[3](); });
    expect(ids).toEqual([]);
    expect(result.current[0]).toBe('a');
  });

  it('respects custom debounceMs', () => {
    const { result } = renderHook(() => useHistory('a', 100));

    act(() => result.current[1]('b'));
    vi.advanceTimersByTime(50); // within 100ms
    act(() => result.current[1]('c'));

    // Should merge
    act(() => result.current[2]()); // undo → a
    expect(result.current[0]).toBe('a');
  });
});
