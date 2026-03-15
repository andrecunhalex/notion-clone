import { useEffect, useCallback, useState } from 'react';
import { BlockData, ViewMode } from '../types';
import { generateId, PAGE_CONTENT_HEIGHT, isListType } from '../utils';

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

      const canSplit = block.type === 'text' || isListType(block.type);

      // Bloco maior que página inteira - tenta quebrar se for texto/lista (não tabela)
      if (h >= PAGE_CONTENT_HEIGHT && canSplit) {
        splitAction = { id: block.id, splitPoint: PAGE_CONTENT_HEIGHT - 50 };
        break;
      }

      if (currentH + h > PAGE_CONTENT_HEIGHT) {
        const availableH = PAGE_CONTENT_HEIGHT - currentH;

        // Quebra se for texto/lista, houver espaço (>50px) e o bloco for maior que o espaço
        if (canSplit && availableH > 50 && h > availableH) {
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

      const htmlContent = el.innerHTML;

      // Create measurement clone preserving HTML formatting
      const measure = document.createElement('div');
      measure.style.cssText = window.getComputedStyle(el).cssText;
      measure.style.position = 'absolute';
      measure.style.visibility = 'hidden';
      measure.style.width = el.clientWidth + 'px';
      measure.innerHTML = htmlContent;
      document.body.appendChild(measure);

      // Collect all text nodes for character-level splitting
      const textNodes: Text[] = [];
      const tw = document.createTreeWalker(measure, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) textNodes.push(tw.currentNode as Text);

      const savedTexts = textNodes.map(n => n.textContent || '');
      const totalLen = savedTexts.reduce((sum, t) => sum + t.length, 0);

      // Truncate visible text at a global character index (preserving HTML tags)
      const truncateAt = (idx: number) => {
        let remaining = idx;
        for (let i = 0; i < textNodes.length; i++) {
          const len = savedTexts[i].length;
          if (remaining < len) {
            textNodes[i].textContent = savedTexts[i].substring(0, remaining);
            for (let j = i + 1; j < textNodes.length; j++) textNodes[j].textContent = '';
            return;
          }
          textNodes[i].textContent = savedTexts[i];
          remaining -= len;
        }
      };

      const restoreAll = () => {
        for (let i = 0; i < textNodes.length; i++) textNodes[i].textContent = savedTexts[i];
      };

      // Binary search for the largest character count that fits
      let low = 0, high = totalLen, bestIndex = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        truncateAt(mid);
        if (measure.getBoundingClientRect().height <= splitPoint) {
          bestIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      restoreAll();
      document.body.removeChild(measure);

      // Só aplica se o corte for útil (não nas bordas extremas)
      if (bestIndex > 5 && bestIndex < totalLen - 5) {
        // Use Range API to split HTML properly (auto-closes/opens tags at boundaries)
        const extract = document.createElement('div');
        extract.innerHTML = htmlContent;

        const textNodes2: Text[] = [];
        const tw2 = document.createTreeWalker(extract, NodeFilter.SHOW_TEXT);
        while (tw2.nextNode()) textNodes2.push(tw2.currentNode as Text);

        // Map global char index to a specific text node + offset
        let remaining = bestIndex;
        let splitNode: Text = textNodes2[0];
        let splitOffset = 0;
        for (let i = 0; i < textNodes2.length; i++) {
          const len = (textNodes2[i].textContent || '').length;
          if (remaining <= len) {
            splitNode = textNodes2[i];
            splitOffset = remaining;
            break;
          }
          remaining -= len;
        }

        // Part 1: from start to split point
        const range1 = document.createRange();
        range1.setStartBefore(extract.firstChild!);
        range1.setEnd(splitNode, splitOffset);
        const div1 = document.createElement('div');
        div1.appendChild(range1.cloneContents());
        const part1 = div1.innerHTML;

        // Part 2: from split point to end
        const range2 = document.createRange();
        range2.setStart(splitNode, splitOffset);
        range2.setEndAfter(extract.lastChild!);
        const div2 = document.createElement('div');
        div2.appendChild(range2.cloneContents());
        const part2 = div2.innerHTML;

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
