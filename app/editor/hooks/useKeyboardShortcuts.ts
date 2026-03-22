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
  blocksRef.current = blocks;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const setBlocksRef = useRef(setBlocks);
  setBlocksRef.current = setBlocks;
  const setSelectedIdsRef = useRef(setSelectedIds);
  setSelectedIdsRef.current = setSelectedIds;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const handleCopyRef = useRef(handleCopy);
  handleCopyRef.current = handleCopy;
  const handlePasteRef = useRef(handlePaste);
  handlePasteRef.current = handlePaste;

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
        const active = document.activeElement as HTMLElement;
        if (active?.isContentEditable) active.blur();
        e.shiftKey ? redoRef.current() : undoRef.current();
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
