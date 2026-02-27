import { useEffect, useCallback, useState } from 'react';
import { BlockData, ViewMode } from '../types';
import { generateId, PAGE_CONTENT_HEIGHT } from '../utils';

interface UsePaginationProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  viewMode: ViewMode;
}

export const usePagination = ({ blocks, setBlocks, viewMode }: UsePaginationProps) => {
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});

  const handleHeightChange = useCallback((id: string, height: number) => {
    setBlockHeights(prev => {
      if (Math.abs((prev[id] || 0) - height) < 2) return prev;
      return { ...prev, [id]: height };
    });
  }, []);

  // Quebra automática de página (Overflow Split)
  useEffect(() => {
    if (viewMode !== 'paginated') return;

    let currentH = 0;
    let splitAction: { id: string; splitPoint: number } | null = null;

    // Simula paginação para encontrar overflow
    for (const block of blocks) {
      const h = blockHeights[block.id] || 24;

      // Bloco maior que página inteira - tenta quebrar se for texto
      if (h >= PAGE_CONTENT_HEIGHT && block.type === 'text') {
        splitAction = { id: block.id, splitPoint: PAGE_CONTENT_HEIGHT - 50 };
        break;
      }

      if (currentH + h > PAGE_CONTENT_HEIGHT) {
        const availableH = PAGE_CONTENT_HEIGHT - currentH;

        // Quebra se for texto, houver espaço (>50px) e o bloco for maior que o espaço
        if (block.type === 'text' && availableH > 50 && h > availableH) {
          splitAction = { id: block.id, splitPoint: availableH };
          break;
        }
        // Nova página
        currentH = h;
      } else {
        currentH += h;
      }
    }

    if (splitAction) {
      const { id, splitPoint } = splitAction;
      const el = document.getElementById(`editable-${id}`);
      if (!el) return;
      const content = el.innerText;

      // Medição binária (tenta achar quantos caracteres cabem)
      const clone = document.createElement('div');
      clone.style.cssText = window.getComputedStyle(el).cssText;
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.width = el.clientWidth + 'px';
      document.body.appendChild(clone);

      let low = 0,
        high = content.length;
      let bestIndex = -1;

      // Binary search para encontrar o maior índice que cabe na altura disponível
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        clone.innerText = content.substring(0, mid);
        if (clone.getBoundingClientRect().height <= splitPoint) {
          bestIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      document.body.removeChild(clone);

      // Só aplica se o corte for útil (não nas bordas extremas)
      if (bestIndex > 5 && bestIndex < content.length - 5) {
        const part1 = content.substring(0, bestIndex);
        const part2 = content.substring(bestIndex);
        const index = blocks.findIndex(b => b.id === id);
        if (index === -1) return;

        const newBlock1 = { ...blocks[index], content: part1 };
        const newBlock2 = { ...blocks[index], id: generateId(), content: part2 };

        const newBlocks = [...blocks];
        newBlocks.splice(index, 1, newBlock1, newBlock2);
        setBlocks(newBlocks);

        // Joga o foco para o novo bloco na próxima página
        requestAnimationFrame(() => {
          const nextEl = document.getElementById(`editable-${newBlock2.id}`);
          if (nextEl) nextEl.focus();
        });
      }
    }
  }, [blockHeights, blocks, viewMode, setBlocks]);

  return { blockHeights, handleHeightChange };
};
