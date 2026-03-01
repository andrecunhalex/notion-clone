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
    addListBlock,
    removeBlock,
    deleteSelectedBlocks,
    moveBlocks
  };
};
