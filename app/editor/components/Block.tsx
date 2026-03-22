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
        // Check if cursor is at the start of the block
        const sel = window.getSelection();
        const el = document.getElementById(`editable-${block.id}`);
        let atStart = false;
        if (sel && el && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(el, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const textBefore = preRange.toString();
          atStart = textBefore.length === 0;
        }
        if (atStart && !isContentEmpty(block.content)) {
          // Insert empty block BEFORE current block (Notion behavior)
          addBlockBefore(block.id);
        } else {
          // Split: text after cursor goes to new block
          if (el && sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            // Extract everything after cursor
            const afterRange = document.createRange();
            afterRange.setStart(range.endContainer, range.endOffset);
            afterRange.setEndAfter(el.lastChild || el);
            const fragment = afterRange.extractContents();
            const temp = document.createElement('div');
            temp.appendChild(fragment);
            const afterContent = temp.innerHTML;
            // Update current block with content before cursor
            updateBlock(block.id, { content: el.innerHTML });
            // Add new block with content after cursor
            addBlockWithContent(block.id, afterContent);
          } else {
            addBlock(block.id);
          }
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
        // Check if cursor is at the very start
        const sel = window.getSelection();
        const el = document.getElementById(`editable-${block.id}`);
        if (sel && el && sel.rangeCount > 0 && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.setStart(el, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const textBefore = preRange.toString();
          if (textBefore.length === 0) {
            e.preventDefault();
            // Merge with previous block
            mergeWithPrevious(block.id);
          }
        }
      }
    }

    if (e.key === 'ArrowUp') {
      const currentEl = document.getElementById(`editable-${block.id}`);
      if (!currentEl) return;

      // Only navigate to previous block if cursor is on the first line
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
        const elRect = currentEl.getBoundingClientRect();
        // If cursor top is not near the element top, let the browser handle it (move within block)
        if (cursorRect.top - elRect.top > 4) return;
      }

      e.preventDefault();
      const blockContainer = currentEl.closest('.group');
      let candidate = blockContainer?.previousSibling as HTMLElement | null;
      if (!candidate) {
        const page = blockContainer?.parentElement;
        const prevPage = page?.previousElementSibling as HTMLElement | null;
        if (prevPage) candidate = prevPage.lastElementChild as HTMLElement | null;
      }
      while (candidate) {
        const editables = candidate.querySelectorAll('[contenteditable]');
        if (editables.length > 0) {
          const target = editables[editables.length - 1] as HTMLElement;
          target.focus({ preventScroll: true });
          // Place cursor at the end of the last line
          const range = document.createRange();
          const s = window.getSelection();
          range.selectNodeContents(target);
          range.collapse(false);
          s?.removeAllRanges();
          s?.addRange(range);
          break;
        }
        const prev = candidate.previousSibling as HTMLElement | null;
        if (prev) {
          candidate = prev;
        } else {
          const page = candidate.parentElement;
          const prevPage = page?.previousElementSibling as HTMLElement | null;
          candidate = prevPage ? prevPage.lastElementChild as HTMLElement | null : null;
        }
      }
    }

    if (e.key === 'ArrowDown') {
      const currentEl = document.getElementById(`editable-${block.id}`);
      if (!currentEl) return;

      // Only navigate to next block if cursor is on the last line
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
        const elRect = currentEl.getBoundingClientRect();
        // If cursor bottom is not near the element bottom, let the browser handle it
        if (elRect.bottom - cursorRect.bottom > 4) return;
      }

      e.preventDefault();
      const blockContainer = currentEl.closest('.group');
      let candidate = blockContainer?.nextSibling as HTMLElement | null;
      if (!candidate) {
        const page = blockContainer?.parentElement;
        const nextPage = page?.nextElementSibling as HTMLElement | null;
        if (nextPage) candidate = nextPage.firstElementChild as HTMLElement | null;
      }
      while (candidate) {
        const editable = candidate.querySelector('[contenteditable]') as HTMLElement | null;
        if (editable) {
          editable.focus({ preventScroll: true });
          // Place cursor at the start of the first line
          const range = document.createRange();
          const s = window.getSelection();
          range.selectNodeContents(editable);
          range.collapse(true);
          s?.removeAllRanges();
          s?.addRange(range);
          break;
        }
        const next = candidate.nextSibling as HTMLElement | null;
        if (next) {
          candidate = next;
        } else {
          const page = candidate.parentElement;
          const nextPage = page?.nextElementSibling as HTMLElement | null;
          candidate = nextPage ? nextPage.firstElementChild as HTMLElement | null : null;
        }
      }
      if (!candidate && globalIndex === blocks.length - 1) {
        if (!isContentEmpty(block.content)) {
          addBlock(block.id);
        }
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
              const blockContainer = internalRef.current;
              if (direction === 'down') {
                let candidate = blockContainer?.nextSibling as HTMLElement | null;
                if (!candidate) {
                  const page = blockContainer?.parentElement;
                  const nextPage = page?.nextElementSibling as HTMLElement | null;
                  if (nextPage) candidate = nextPage.firstElementChild as HTMLElement | null;
                }
                while (candidate) {
                  const editable = candidate.querySelector('[contenteditable]') as HTMLElement | null;
                  if (editable) { editable.focus({ preventScroll: true }); break; }
                  const next = candidate.nextSibling as HTMLElement | null;
                  if (next) { candidate = next; } else {
                    const page = candidate.parentElement;
                    const nextPage = page?.nextElementSibling as HTMLElement | null;
                    candidate = nextPage ? nextPage.firstElementChild as HTMLElement | null : null;
                  }
                }
                if (!candidate && globalIndex === blocks.length - 1) {
                  addBlock(block.id);
                }
              } else {
                let candidate = blockContainer?.previousSibling as HTMLElement | null;
                if (!candidate) {
                  const page = blockContainer?.parentElement;
                  const prevPage = page?.previousElementSibling as HTMLElement | null;
                  if (prevPage) candidate = prevPage.lastElementChild as HTMLElement | null;
                }
                while (candidate) {
                  const editables = candidate.querySelectorAll('[contenteditable]');
                  if (editables.length > 0) { (editables[editables.length - 1] as HTMLElement).focus({ preventScroll: true }); break; }
                  const prev = candidate.previousSibling as HTMLElement | null;
                  if (prev) { candidate = prev; } else {
                    const page = candidate.parentElement;
                    const prevPage = page?.previousElementSibling as HTMLElement | null;
                    candidate = prevPage ? prevPage.lastElementChild as HTMLElement | null : null;
                  }
                }
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
              style={BLOCK_INLINE_STYLES[block.type] || {}}
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
