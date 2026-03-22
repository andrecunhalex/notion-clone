import { useCallback, useRef } from 'react';
import { BlockData, BlockType } from '../types';
import { generateId, focusBlock } from '../utils';

interface UseBlockManagerProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
}

export const useBlockManager = ({ blocks, setBlocks }: UseBlockManagerProps) => {
  // Use refs to avoid stale closures — callbacks stay stable
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const setBlocksRef = useRef(setBlocks);
  setBlocksRef.current = setBlocks;

  const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
    const newBlocks = blocksRef.current.map(b => b.id === id ? { ...b, ...updates } : b);
    setBlocksRef.current(newBlocks);
  }, []);

  const addBlock = useCallback((afterId: string) => {
    const b = blocksRef.current;
    const index = b.findIndex(bl => bl.id === afterId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content: '' };
    const newBlocks = [...b];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocksRef.current(newBlocks);
    focusBlock(newBlock.id);
  }, []);

  const addBlockBefore = useCallback((beforeId: string) => {
    const b = blocksRef.current;
    const index = b.findIndex(bl => bl.id === beforeId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content: '' };
    const newBlocks = [...b];
    newBlocks.splice(index, 0, newBlock);
    setBlocksRef.current(newBlocks);
    focusBlock(beforeId, 'start');
  }, []);

  const addBlockWithContent = useCallback((afterId: string, content: string) => {
    const b = blocksRef.current;
    const index = b.findIndex(bl => bl.id === afterId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content };
    const newBlocks = [...b];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocksRef.current(newBlocks);
    focusBlock(newBlock.id, 'start');
  }, []);

  // Helper: place cursor at a specific text offset inside an editable element
  const placeCursorAtOffset = useCallback((el: HTMLElement, prevContent: string) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = prevContent;
    const prevTextLength = tempDiv.textContent?.length || 0;
    const range = document.createRange();
    const sel = window.getSelection();
    let charCount = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let placed = false;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const nodeLen = node.textContent?.length || 0;
      if (charCount + nodeLen >= prevTextLength) {
        range.setStart(node, prevTextLength - charCount);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        placed = true;
        break;
      }
      charCount += nodeLen;
    }
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const mergeWithPrevious = useCallback((id: string) => {
    const b = blocksRef.current;
    const index = b.findIndex(bl => bl.id === id);
    if (index <= 0) return;
    const prevBlock = b[index - 1];

    // If previous block is a divider, swap: move current block above the divider
    if (prevBlock.type === 'divider') {
      const newBlocks = [...b];
      newBlocks[index] = prevBlock;
      newBlocks[index - 1] = b[index];
      setBlocksRef.current(newBlocks);

      if (index - 2 >= 0) {
        const aboveBlock = newBlocks[index - 2];
        if (aboveBlock.type !== 'divider' && aboveBlock.type !== 'table' && aboveBlock.type !== 'image') {
          const currentBlock = newBlocks[index - 1];
          const mergedContent = (aboveBlock.content || '') + (currentBlock.content || '');
          const mergedBlocks = [...newBlocks];
          mergedBlocks[index - 2] = { ...aboveBlock, content: mergedContent };
          mergedBlocks.splice(index - 1, 1);
          setBlocksRef.current(mergedBlocks);
          setTimeout(() => {
            const el = document.getElementById(`editable-${aboveBlock.id}`);
            if (el) {
              el.innerHTML = mergedContent;
              el.focus({ preventScroll: true });
              placeCursorAtOffset(el, aboveBlock.content || '');
            }
          }, 0);
          return;
        }
      }
      focusBlock(id, 'start');
      return;
    }

    if (prevBlock.type === 'table' || prevBlock.type === 'image') return;

    const currentBlock = b[index];
    const prevContent = prevBlock.content || '';
    const currentContent = currentBlock.content || '';
    const mergedContent = prevContent + currentContent;
    const newBlocks = b.filter(bl => bl.id !== id);
    const prevIdx = newBlocks.findIndex(bl => bl.id === prevBlock.id);
    newBlocks[prevIdx] = { ...prevBlock, content: mergedContent };
    setBlocksRef.current(newBlocks);

    setTimeout(() => {
      const el = document.getElementById(`editable-${prevBlock.id}`);
      if (el) {
        el.innerHTML = mergedContent;
        el.focus({ preventScroll: true });
        if (prevContent) {
          placeCursorAtOffset(el, prevContent);
        } else {
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(el, 0);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    }, 0);
  }, [placeCursorAtOffset]);

  const removeBlock = useCallback((id: string) => {
    const b = blocksRef.current;
    if (b.length === 1) return;
    const index = b.findIndex(bl => bl.id === id);
    const newBlocks = b.filter(bl => bl.id !== id);
    setBlocksRef.current(newBlocks);

    if (index > 0) focusBlock(newBlocks[index - 1].id);
    else if (newBlocks.length > 0) focusBlock(newBlocks[0].id);
  }, []);

  const deleteSelectedBlocks = useCallback((selectedIds: Set<string>) => {
    if (selectedIds.size === 0) return;
    let newBlocks = blocksRef.current.filter(b => !selectedIds.has(b.id));
    if (newBlocks.length === 0) {
      newBlocks = [{ id: generateId(), type: 'text', content: '' }];
    }
    setBlocksRef.current(newBlocks);
  }, []);

  const addListBlock = useCallback((afterId: string, type: BlockType, indent: number = 0) => {
    const b = blocksRef.current;
    const index = b.findIndex(bl => bl.id === afterId);
    const newBlock: BlockData = { id: generateId(), type, content: '', indent };
    const newBlocks = [...b];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocksRef.current(newBlocks);
    focusBlock(newBlock.id);
  }, []);

  const moveBlocks = useCallback((idsToMove: string[], targetId: string, position: 'top' | 'bottom') => {
    const b = blocksRef.current;
    const itemsToMove = b.filter(bl => idsToMove.includes(bl.id));
    const remainingBlocks = b.filter(bl => !idsToMove.includes(bl.id));
    let targetIndex = remainingBlocks.findIndex(bl => bl.id === targetId);

    if (targetIndex === -1) return;
    if (position === 'bottom') targetIndex += 1;

    remainingBlocks.splice(targetIndex, 0, ...itemsToMove);
    setBlocksRef.current(remainingBlocks);
  }, []);

  return {
    updateBlock, addBlock, addBlockBefore, addBlockWithContent,
    addListBlock, removeBlock, mergeWithPrevious, deleteSelectedBlocks, moveBlocks,
  };
};
