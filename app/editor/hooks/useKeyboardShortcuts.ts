import { useEffect } from 'react';
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
  blocks,
  setBlocks,
  selectedIds,
  setSelectedIds,
  undo,
  redo,
  handleCopy,
  handlePaste
}: UseKeyboardShortcutsProps) => {
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape — clear selection
      if (e.key === 'Escape' && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeElement = document.activeElement as HTMLElement;
        const activeTag = activeElement.tagName;
        const isEditing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeElement.isContentEditable;

        if (selectedIds.size > 0 && (!isEditing || selectedIds.size > 1)) {
          if (isEditing) activeElement.blur();
          e.preventDefault();
          let newBlocks = blocks.filter(b => !selectedIds.has(b.id));
          if (newBlocks.length === 0) {
            newBlocks = [{ id: generateId(), type: 'text', content: '' }];
          }
          setBlocks(newBlocks);
          setSelectedIds(new Set());
        }
      }

      // Select All (Notion-like: first selects text in block, then all blocks)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const activeElement = document.activeElement as HTMLElement;

        // If editing a non-empty block, first Ctrl+A selects text within the block
        if (activeElement?.isContentEditable) {
          const content = activeElement.textContent || '';
          if (content.trim() !== '') {
            const sel = window.getSelection();
            const selectedText = sel?.toString() || '';
            // If not all text is selected yet, let browser select all text in this block
            if (selectedText.length < content.length) {
              return;
            }
          }
        }

        // Empty block, no focus, or all text already selected → select all blocks
        e.preventDefault();
        if (activeElement instanceof HTMLElement) {
          activeElement.blur();
        }
        setSelectedIds(new Set(blocks.map(b => b.id)));
        return;
      }

      // Copiar
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault();
        handleCopy();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [blocks, selectedIds, undo, redo, setBlocks, setSelectedIds, handleCopy, handlePaste]);
};
