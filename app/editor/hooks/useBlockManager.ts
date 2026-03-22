import { useCallback } from 'react';
import { BlockData, BlockType } from '../types';
import { generateId, focusBlock } from '../utils';

interface UseBlockManagerProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
}

export const useBlockManager = ({ blocks, setBlocks }: UseBlockManagerProps) => {
  
  const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
    const newBlocks = blocks.map(b => b.id === id ? { ...b, ...updates } : b);
    setBlocks(newBlocks);
  }, [blocks, setBlocks]);

  const addBlock = useCallback((afterId: string) => {
    const index = blocks.findIndex(b => b.id === afterId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content: '' };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    focusBlock(newBlock.id);
  }, [blocks, setBlocks]);

  const addBlockBefore = useCallback((beforeId: string) => {
    const index = blocks.findIndex(b => b.id === beforeId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content: '' };
    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, newBlock);
    setBlocks(newBlocks);
    // Keep focus on the original block at the start
    focusBlock(beforeId, 'start');
  }, [blocks, setBlocks]);

  const addBlockWithContent = useCallback((afterId: string, content: string) => {
    const index = blocks.findIndex(b => b.id === afterId);
    const newBlock: BlockData = { id: generateId(), type: 'text', content };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    focusBlock(newBlock.id, 'start');
  }, [blocks, setBlocks]);

  const mergeWithPrevious = useCallback((id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index <= 0) return;
    const prevBlock = blocks[index - 1];
    // Can only merge with text-like blocks
    if (prevBlock.type === 'divider' || prevBlock.type === 'table' || prevBlock.type === 'image') return;
    const currentBlock = blocks[index];
    const prevContent = prevBlock.content || '';
    const currentContent = currentBlock.content || '';
    // Remember cursor position: it should be at the end of the previous block's content
    const mergedContent = prevContent + currentContent;
    const newBlocks = blocks.filter(b => b.id !== id);
    const prevIdx = newBlocks.findIndex(b => b.id === prevBlock.id);
    newBlocks[prevIdx] = { ...prevBlock, content: mergedContent };
    setBlocks(newBlocks);
    // Focus previous block and place cursor at the join point
    setTimeout(() => {
      const el = document.getElementById(`editable-${prevBlock.id}`);
      if (el) {
        el.innerHTML = mergedContent;
        el.focus({ preventScroll: true });
        // Place cursor at the end of the old previous content
        if (prevContent) {
          const range = document.createRange();
          const sel = window.getSelection();
          // Walk through text nodes to find the right position
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = prevContent;
          const prevTextLength = tempDiv.textContent?.length || 0;
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
  }, [blocks, setBlocks]);

  const removeBlock = useCallback((id: string) => {
    if (blocks.length === 1) return;
    const index = blocks.findIndex(b => b.id === id);
    const newBlocks = blocks.filter(b => b.id !== id);
    setBlocks(newBlocks);

    // Foca no bloco anterior, ou no próximo se for o primeiro
    if (index > 0) {
      focusBlock(newBlocks[index - 1].id);
    } else if (newBlocks.length > 0) {
      focusBlock(newBlocks[0].id);
    }
  }, [blocks, setBlocks]);

  const deleteSelectedBlocks = useCallback((selectedIds: Set<string>) => {
    if (selectedIds.size === 0) return;
    
    let newBlocks = blocks.filter(b => !selectedIds.has(b.id));
    if (newBlocks.length === 0) {
      newBlocks = [{ id: generateId(), type: 'text', content: '' }];
    }
    setBlocks(newBlocks);
  }, [blocks, setBlocks]);

  const addListBlock = useCallback((afterId: string, type: BlockType, indent: number = 0) => {
    const index = blocks.findIndex(b => b.id === afterId);
    const newBlock: BlockData = { id: generateId(), type, content: '', indent };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    focusBlock(newBlock.id);
  }, [blocks, setBlocks]);

  const moveBlocks = useCallback((
    idsToMove: string[],
    targetId: string,
    position: 'top' | 'bottom'
  ) => {
    const itemsToMove = blocks.filter(b => idsToMove.includes(b.id));
    let remainingBlocks = blocks.filter(b => !idsToMove.includes(b.id));
    let targetIndex = remainingBlocks.findIndex(b => b.id === targetId);

    if (targetIndex === -1) return;
    if (position === 'bottom') targetIndex += 1;

    remainingBlocks.splice(targetIndex, 0, ...itemsToMove);
    setBlocks(remainingBlocks);
  }, [blocks, setBlocks]);

  return {
    updateBlock,
    addBlock,
    addBlockBefore,
    addBlockWithContent,
    addListBlock,
    removeBlock,
    mergeWithPrevious,
    deleteSelectedBlocks,
    moveBlocks
  };
};
