import { useCallback } from 'react';
import { BlockData, BlockType, SlashMenuState } from '../types';
import { isListType, isContentEmpty } from '../utils';
import { Dispatch, SetStateAction } from 'react';

interface UseBlockKeyboardProps {
  block: BlockData;
  isLastBlock: boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (afterId: string) => void;
  addBlockBefore: (beforeId: string) => void;
  addBlockWithContent: (afterId: string, content: string, sourceContent?: string) => void;
  addListBlock: (afterId: string, type: BlockType, indent: number) => void;
  removeBlock: (id: string) => void;
  mergeWithPrevious: (id: string) => void;
  setSlashMenu: Dispatch<SetStateAction<SlashMenuState>>;
}

// --- Helpers for cross-block navigation ---

export function findEditable(
  startEl: HTMLElement | null,
  direction: 'next' | 'prev'
): HTMLElement | null {
  let el = startEl;
  while (el) {
    const selector = '[contenteditable]';
    const found = direction === 'prev'
      ? (el.querySelectorAll(selector) as NodeListOf<HTMLElement>)
      : el.querySelector(selector) as HTMLElement | null;
    if (direction === 'prev') {
      const list = found as NodeListOf<HTMLElement>;
      if (list.length > 0) return list[list.length - 1];
    } else {
      if (found) return found as HTMLElement;
    }
    const sibling = direction === 'next'
      ? el.nextElementSibling
      : el.previousElementSibling;
    if (sibling) {
      el = sibling as HTMLElement;
    } else {
      const page = el.parentElement;
      const adjacentPage = direction === 'next'
        ? page?.nextElementSibling
        : page?.previousElementSibling;
      el = adjacentPage
        ? (direction === 'next'
          ? adjacentPage.firstElementChild
          : adjacentPage.lastElementChild) as HTMLElement | null
        : null;
    }
  }
  return null;
}

export function focusEditable(target: HTMLElement, toEnd: boolean) {
  target.focus({ preventScroll: true });
  const range = document.createRange();
  const sel = window.getSelection();
  if (sel) {
    if (target.childNodes.length > 0) {
      range.selectNodeContents(target);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(toEnd ? false : true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function isCursorOnFirstLine(el: HTMLElement): boolean {
  if (isContentEmpty(el.innerHTML)) return true;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
  if (cursorRect.height === 0) return true;
  const elRect = el.getBoundingClientRect();
  return cursorRect.top - elRect.top < 4;
}

function isCursorOnLastLine(el: HTMLElement): boolean {
  if (isContentEmpty(el.innerHTML)) return true;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
  if (cursorRect.height === 0) return true;
  const elRect = el.getBoundingClientRect();
  return elRect.bottom - cursorRect.bottom < 4;
}

export const useBlockKeyboard = ({
  block,
  isLastBlock,
  updateBlock,
  addBlock,
  addBlockBefore,
  addBlockWithContent,
  addListBlock,
  removeBlock,
  mergeWithPrevious,
  setSlashMenu,
}: UseBlockKeyboardProps) => {
  const isList = isListType(block.type);
  const indent = block.indent ?? 0;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Tab indent/dedent for lists
    if (e.key === 'Tab' && isList) {
      e.preventDefault();
      if (e.shiftKey) {
        if (indent > 0) updateBlock(block.id, { indent: indent - 1 });
      } else {
        if (indent < 3) updateBlock(block.id, { indent: indent + 1 });
      }
      return;
    }

    if (e.key === 'Tab' && !isList) {
      e.preventDefault();
      if (e.shiftKey) return;
      document.execCommand('insertHTML', false, '\u00A0\u00A0\u00A0\u00A0');
      return;
    }

    if (e.key === '/') {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          setSlashMenu({
            isOpen: true,
            x: rect.left,
            y: rect.bottom + 10,
            blockId: block.id
          });
        }
      }, 0);
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isList) {
        if (isContentEmpty(block.content)) {
          updateBlock(block.id, { type: 'text', indent: undefined });
        } else {
          addListBlock(block.id, block.type, indent);
        }
      } else {
        const sel = window.getSelection();
        const el = document.getElementById(`editable-${block.id}`);
        let atStart = false;
        if (sel && el && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(el, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          atStart = preRange.toString().length === 0;
        }
        if (atStart && !isContentEmpty(block.content)) {
          addBlockBefore(block.id);
        } else if (el && sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const afterRange = document.createRange();
          afterRange.setStart(range.endContainer, range.endOffset);
          afterRange.setEndAfter(el.lastChild || el);
          const fragment = afterRange.extractContents();
          const temp = document.createElement('div');
          temp.appendChild(fragment);
          const afterContent = temp.innerHTML;
          // Single atomic update: update source block content + insert new block
          addBlockWithContent(block.id, afterContent, el.innerHTML);
        } else {
          addBlock(block.id);
        }
      }
    }

    if (e.key === 'Backspace') {
      if (isContentEmpty(block.content)) {
        e.preventDefault();
        if (isList) {
          updateBlock(block.id, { type: 'text', indent: undefined });
        } else {
          removeBlock(block.id);
        }
      } else {
        const sel = window.getSelection();
        const el = document.getElementById(`editable-${block.id}`);
        if (sel && el && sel.rangeCount > 0 && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(el, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          if (preRange.toString().length === 0) {
            e.preventDefault();
            mergeWithPrevious(block.id);
          }
        }
      }
    }

    if (e.key === 'ArrowUp') {
      const el = document.getElementById(`editable-${block.id}`);
      if (!el || !isCursorOnFirstLine(el)) return;
      const container = el.closest('[data-block-id]');
      if (!container) return;
      let startEl = container.previousElementSibling as HTMLElement | null;
      if (!startEl) {
        const page = container.parentElement;
        const prevPage = page?.previousElementSibling as HTMLElement | null;
        startEl = prevPage?.lastElementChild as HTMLElement | null;
      }
      const target = findEditable(startEl, 'prev');
      if (target) {
        e.preventDefault();
        focusEditable(target, true);
      }
    }

    if (e.key === 'ArrowDown') {
      const el = document.getElementById(`editable-${block.id}`);
      if (!el || !isCursorOnLastLine(el)) return;
      const container = el.closest('[data-block-id]');
      if (!container) return;
      let startEl = container.nextElementSibling as HTMLElement | null;
      if (!startEl) {
        const page = container.parentElement;
        const nextPage = page?.nextElementSibling as HTMLElement | null;
        startEl = nextPage?.firstElementChild as HTMLElement | null;
      }
      const target = findEditable(startEl, 'next');
      if (target) {
        e.preventDefault();
        focusEditable(target, false);
      } else if (isLastBlock && !isContentEmpty(block.content)) {
        e.preventDefault();
        addBlock(block.id);
      }
    }
  }, [block.id, block.type, block.content, block.indent, isList, indent, isLastBlock,
      updateBlock, addBlock, addBlockBefore, addBlockWithContent, addListBlock,
      removeBlock, mergeWithPrevious, setSlashMenu]);

  return handleKeyDown;
};
