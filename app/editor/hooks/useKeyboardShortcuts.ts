import { useEffect, useRef } from 'react';
import { BlockData } from '../types';
import { generateId } from '../utils';

interface UseKeyboardShortcutsProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  undo: () => void;
  redo: () => void;
  handleCopy: () => void;
  handlePaste: (e: ClipboardEvent) => void;
}

export const useKeyboardShortcuts = ({
  blocks, setBlocks, selectedIds, setSelectedIds,
  undo, redo, handleCopy, handlePaste,
}: UseKeyboardShortcutsProps) => {
  // Use refs to avoid re-attaching listeners on every state change
  const blocksRef = useRef(blocks);
  const selectedIdsRef = useRef(selectedIds);
  const setBlocksRef = useRef(setBlocks);
  const setSelectedIdsRef = useRef(setSelectedIds);
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const handleCopyRef = useRef(handleCopy);
  const handlePasteRef = useRef(handlePaste);
  useEffect(() => {
    blocksRef.current = blocks;
    selectedIdsRef.current = selectedIds;
    setBlocksRef.current = setBlocks;
    setSelectedIdsRef.current = setSelectedIds;
    undoRef.current = undo;
    redoRef.current = redo;
    handleCopyRef.current = handleCopy;
    handlePasteRef.current = handlePaste;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const sIds = selectedIdsRef.current;
      const b = blocksRef.current;

      // Escape — clear selection
      if (e.key === 'Escape' && sIds.size > 0) {
        e.preventDefault();
        setSelectedIdsRef.current(new Set());
        return;
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        // Remember which block had focus so we can restore it after React re-renders
        const active = document.activeElement as HTMLElement;
        const blockWrapper = active?.closest?.('[data-block-id]');
        const focusedBlockId = blockWrapper?.getAttribute('data-block-id') || null;

        if (e.shiftKey) redoRef.current(); else undoRef.current();

        // Re-focus the block after React re-render (if it still exists)
        if (focusedBlockId) {
          requestAnimationFrame(() => {
            const el = document.getElementById(`editable-${focusedBlockId}`);
            if (el && document.activeElement !== el) {
              el.focus({ preventScroll: true });
            }
          });
        }
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeElement = document.activeElement as HTMLElement;
        const activeTag = activeElement.tagName;
        const isEditing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement.isContentEditable;

        if (sIds.size > 0 && (!isEditing || sIds.size > 1)) {
          if (isEditing) activeElement.blur();
          e.preventDefault();
          let newBlocks = b.filter(bl => !sIds.has(bl.id));
          if (newBlocks.length === 0) {
            newBlocks = [{ id: generateId(), type: 'text', content: '' }];
          }
          setBlocksRef.current(newBlocks);
          setSelectedIdsRef.current(new Set());
        }
      }

      // Select All
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const activeElement = document.activeElement as HTMLElement;
        const tagName = activeElement?.tagName?.toLowerCase();

        // Don't intercept when focus is on textarea or input — let native select-all work
        if (tagName === 'textarea' || tagName === 'input') return;

        if (activeElement?.isContentEditable) {
          const content = activeElement.textContent || '';
          if (content.trim() !== '') {
            const sel = window.getSelection();
            const selectedText = sel?.toString() || '';
            if (selectedText.length < content.length) return;
          }
        }

        e.preventDefault();
        if (activeElement instanceof HTMLElement) activeElement.blur();
        setSelectedIdsRef.current(new Set(b.map(bl => bl.id)));
        return;
      }

      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && sIds.size > 0) {
        e.preventDefault();
        handleCopyRef.current();
      }
    };

    const onPaste = (e: ClipboardEvent) => handlePasteRef.current(e);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', onPaste);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, []); // Empty deps — uses refs
};
