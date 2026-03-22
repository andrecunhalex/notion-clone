'use client';

import React, { useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { GripVertical } from 'lucide-react';
import { BlockData, BlockType, SlashMenuState, DropTarget } from '../types';
import { isListType, getBulletChar, getListNumber, isContentEmpty } from '../utils';
import { TableBlock } from './TableBlock';
import { ImageBlock } from './ImageBlock';

interface BlockProps {
  block: BlockData;
  index: number;
  isSelected: boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (afterId: string) => void;
  addBlockBefore: (beforeId: string) => void;
  addBlockWithContent: (afterId: string, content: string) => void;
  addListBlock: (afterId: string, type: BlockType, indent: number) => void;
  removeBlock: (id: string) => void;
  mergeWithPrevious: (id: string) => void;
  setSlashMenu: Dispatch<SetStateAction<SlashMenuState>>;
  blockRef: (el: HTMLDivElement | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent) => void;
  dropTarget: DropTarget | null;
  onHeightChange: (id: string, height: number) => void;
  onClearSelection: () => void;
  blocks: BlockData[];
  globalIndex: number;
}

const BLOCK_STYLES: Record<string, string> = {
  h1: 'font-bold my-0 p-0 text-gray-900',
  h2: 'font-semibold my-0 p-0 text-gray-800',
  h3: 'font-semibold my-0 p-0 text-gray-800',
  text: 'my-0 text-gray-700',
  bullet_list: 'my-0 text-gray-700',
  numbered_list: 'my-0 text-gray-700',
  divider: '',
  table: '',
  image: '',
};

const BLOCK_INLINE_STYLES: Record<string, React.CSSProperties> = {
  h1: { fontSize: '1.875em', lineHeight: 1.3 },
  h2: { fontSize: '1.5em', lineHeight: 1.3 },
  h3: { fontSize: '1.25em', lineHeight: 1.3 },
  text: { fontSize: '16px', lineHeight: 1.5 },
  bullet_list: { fontSize: '16px', lineHeight: 1.5 },
  numbered_list: { fontSize: '16px', lineHeight: 1.5 },
};

// Handle wrapper height matches each block's first line height for vertical centering
const HANDLE_LINE: Record<string, string> = {
  h1: 'h-[39px]',
  h2: 'h-[31px]',
  h3: 'h-[26px]',
  text: 'h-[24px]',
  bullet_list: 'h-[24px]',
  numbered_list: 'h-[24px]',
  divider: 'h-4',
  table: 'h-6',
  image: 'h-6',
};

export const Block: React.FC<BlockProps> = ({
  block,
  isSelected,
  updateBlock,
  addBlock,
  addBlockBefore,
  addBlockWithContent,
  addListBlock,
  removeBlock,
  mergeWithPrevious,
  setSlashMenu,
  blockRef,
  onDragStart,
  onDragOver,
  onDrop,
  dropTarget,
  onHeightChange,
  onClearSelection,
  blocks,
  globalIndex
}) => {
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (internalRef.current) {
      blockRef(internalRef.current);

      const ro = new ResizeObserver(() => {
        if (internalRef.current) {
          onHeightChange(block.id, internalRef.current.offsetHeight);
        }
      });
      ro.observe(internalRef.current);
      return () => ro.disconnect();
    }
  }, [block.id, onHeightChange, blockRef]);

  // Sync is-empty class with content
  useEffect(() => {
    if (block.type === 'table' || block.type === 'divider' || block.type === 'image') return;
    const el = document.getElementById(`editable-${block.id}`);
    if (el) {
      el.classList.toggle('is-empty', isContentEmpty(block.content));
    }
  }, [block.content, block.id, block.type]);

  useEffect(() => {
    if (block.type === 'table' || block.type === 'divider' || block.type === 'image') return;
    const el = document.getElementById(`editable-${block.id}`);
    if (el && el.innerHTML !== block.content) {
      const isFocused = document.activeElement === el;
      el.innerHTML = block.content;
      if (isFocused && block.content) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [block.content, block.id, block.type]);

  const isList = isListType(block.type);
  const indent = block.indent ?? 0;

  // --- Helpers for cross-block navigation ---
  const findEditable = (
    startEl: HTMLElement | null,
    direction: 'next' | 'prev'
  ): HTMLElement | null => {
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
      // Move to sibling, crossing page boundaries
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
  };

  const focusEditable = (target: HTMLElement, toEnd: boolean) => {
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
  };

  const isCursorOnFirstLine = (el: HTMLElement): boolean => {
    if (isContentEmpty(el.innerHTML)) return true;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return true;
    const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
    if (cursorRect.height === 0) return true;
    // Compare cursor top with the top of the first line
    const elRect = el.getBoundingClientRect();
    return cursorRect.top - elRect.top < 4;
  };

  const isCursorOnLastLine = (el: HTMLElement): boolean => {
    if (isContentEmpty(el.innerHTML)) return true;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return true;
    const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
    if (cursorRect.height === 0) return true;
    const elRect = el.getBoundingClientRect();
    return elRect.bottom - cursorRect.bottom < 4;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

    // Tab inserts a tab stop for non-list blocks
    if (e.key === 'Tab' && !isList) {
      e.preventDefault();
      if (e.shiftKey) return; // no-op for shift+tab on text
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
          updateBlock(block.id, { content: el.innerHTML });
          addBlockWithContent(block.id, afterContent);
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

    // Arrow navigation: only intercept at block boundaries, let browser handle the rest
    if (e.key === 'ArrowUp') {
      const el = document.getElementById(`editable-${block.id}`);
      if (!el || !isCursorOnFirstLine(el)) return;
      const container = el.closest('[data-block-id]');
      if (!container) return;
      // Get the previous sibling, crossing page boundaries if needed
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
      } else if (globalIndex === blocks.length - 1 && !isContentEmpty(block.content)) {
        e.preventDefault();
        addBlock(block.id);
      }
    }
  };

  const renderListMarker = () => {
    if (!isList) return null;
    const paddingLeft = indent * 24;
    if (block.type === 'bullet_list') {
      return (
        <span
          className="select-none text-gray-400 shrink-0 inline-flex items-center justify-center"
          style={{ width: 24 + paddingLeft, paddingLeft }}
        >
          {getBulletChar(indent)}
        </span>
      );
    }
    // numbered_list
    const num = getListNumber(block, blocks, globalIndex);
    return (
      <span
        className="select-none text-gray-400 shrink-0 inline-flex items-center justify-end pr-1"
        style={{ minWidth: 24 + paddingLeft, paddingLeft }}
      >
        {num}.
      </span>
    );
  };

  const isTable = block.type === 'table';
  const isDivider = block.type === 'divider';
  const isImage = block.type === 'image';

  return (
    <div
      ref={internalRef}
      data-block-id={block.id}
      className="group relative flex items-start -ml-12 pr-2 py-[1px] my-[1px]"
      onDragOver={e => onDragOver(e, block.id)}
      onDrop={e => { e.stopPropagation(); onDrop(e); }}
    >
      {dropTarget && dropTarget.id === block.id && (
        <div
          className="absolute left-0 right-0 h-1 bg-blue-500 pointer-events-none z-10"
          style={{
            top: dropTarget.position === 'top' ? '-2px' : 'auto',
            bottom: dropTarget.position === 'bottom' ? '-2px' : 'auto'
          }}
        />
      )}

      <div className={`w-12 shrink-0 flex items-center justify-center ${HANDLE_LINE[block.type] || 'h-6'}`}>
        <div
          className="drag-handle p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-opacity"
          draggable
          onDragStart={e => onDragStart(e, block.id)}
          onMouseDown={e => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>
      </div>

      <div className={`flex-1 min-w-0 notion-block-content py-0.5 px-1 rounded-sm transition-colors ${
        isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'
      }`}>
        {isDivider ? (
          <div className="py-2">
            <hr className="border-t border-gray-300" />
          </div>
        ) : isImage ? (
          <ImageBlock
            block={block}
            updateBlock={updateBlock}
            removeBlock={removeBlock}
          />
        ) : isTable ? (
          <TableBlock
            block={block}
            updateBlock={updateBlock}
            onNavigateOut={(direction) => {
              const container = internalRef.current;
              if (!container) return;
              if (direction === 'down') {
                const target = findEditable(container.nextElementSibling as HTMLElement, 'next');
                if (target) focusEditable(target, false);
                else if (globalIndex === blocks.length - 1) addBlock(block.id);
              } else {
                const target = findEditable(container.previousElementSibling as HTMLElement, 'prev');
                if (target) focusEditable(target, true);
              }
            }}
          />
        ) : (
          <div className={`flex items-start ${isList ? '' : ''}`}>
            {renderListMarker()}
            <div
              id={`editable-${block.id}`}
              contentEditable
              suppressContentEditableWarning
              className={`outline-none cursor-text flex-1 min-w-0 editable-block ${BLOCK_STYLES[block.type]}`}
              style={{ ...(BLOCK_INLINE_STYLES[block.type] || {}), ...(block.align ? { textAlign: block.align } : {}) }}
              data-placeholder={isList ? 'Lista...' : "Digite '/' para comandos..."}
              onKeyDown={handleKeyDown}
              onInput={e => {
                const el = e.currentTarget;
                el.classList.toggle('is-empty', isContentEmpty(el.innerHTML));
                updateBlock(block.id, { content: el.innerHTML });
              }}
              onFocus={onClearSelection}
            />
          </div>
        )}
      </div>
    </div>
  );
};
