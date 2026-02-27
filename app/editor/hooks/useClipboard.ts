import { useEffect, useCallback } from 'react';
import { BlockData } from '../types';
import { generateId, copyToClipboard } from '../utils';

interface UseClipboardProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  selectedIds: Set<string>;
}

export const useClipboard = ({ blocks, setBlocks, selectedIds }: UseClipboardProps) => {
  
  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return;
    
    const selectedBlocks = blocks.filter(b => selectedIds.has(b.id));
    const jsonString = JSON.stringify(selectedBlocks);
    copyToClipboard(jsonString);
  }, [blocks, selectedIds]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;
    const text = clipboardData.getData('text');

    let processedBlocks: BlockData[] | null = null;

    // 1. Tenta interpretar como blocos JSON (copiado internamente)
    try {
      const pastedData = JSON.parse(text);
      if (Array.isArray(pastedData) && pastedData.length > 0 && pastedData[0].content !== undefined) {
        processedBlocks = pastedData.map((b: BlockData) => ({ ...b, id: generateId() }));
      }
    } catch {
      // Não é JSON válido
    }

    // 2. Fallback: Interpreta como Texto Plano (quebra por parágrafos)
    if (!processedBlocks) {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length > 0) {
        processedBlocks = lines.map(line => ({
          id: generateId(),
          type: 'text' as const,
          content: line
        }));
      }
    }

    if (processedBlocks) {
      e.preventDefault();
      const newBlocks = processedBlocks;

      let insertIndex = blocks.length;
      let shouldReplace = false;

      // Cenário 1: Tem blocos selecionados (via drag/rubber band)
      if (selectedIds.size > 0) {
        let maxIndex = -1;
        blocks.forEach((b, i) => {
          if (selectedIds.has(b.id)) maxIndex = i;
        });
        if (maxIndex !== -1) {
          insertIndex = maxIndex + 1;
        }
      }
      // Cenário 2: Está com foco em um bloco (editando texto)
      else if (document.activeElement && document.activeElement.id.startsWith('editable-')) {
        const activeId = document.activeElement.id.replace('editable-', '');
        const activeIndex = blocks.findIndex(b => b.id === activeId);

        if (activeIndex !== -1) {
          const activeBlock = blocks[activeIndex];
          // Se o bloco atual for texto e estiver vazio, substituímos ele!
          if (activeBlock.type === 'text' && activeBlock.content.trim() === '') {
            shouldReplace = true;
            insertIndex = activeIndex;
          } else {
            // Senão, cola embaixo
            insertIndex = activeIndex + 1;
          }
        }
      }

      // Cria nova lista
      const finalBlocks = [...blocks];

      if (shouldReplace) {
        finalBlocks.splice(insertIndex, 1, ...newBlocks);
      } else {
        finalBlocks.splice(insertIndex, 0, ...newBlocks);
      }

      setBlocks(finalBlocks);
    }
  }, [blocks, setBlocks, selectedIds]);

  return { handleCopy, handlePaste };
};
