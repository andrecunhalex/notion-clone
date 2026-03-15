'use client';

import React, { useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { GripVertical } from 'lucide-react';
import { BlockData, BlockType, SlashMenuState, DropTarget } from '../types';
import { isListType, getBulletChar, getListNumber } from '../utils';
import { TableBlock } from './TableBlock';

interface BlockProps {
  block: BlockData;
  index: number;
  isSelected: boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (afterId: string) => void;
  addListBlock: (afterId: string, type: BlockType, indent: number) => void;
  removeBlock: (id: string) => void;
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
  h1: 'text-4xl font-bold my-0 p-0 text-gray-900 leading-none',
  h2: 'text-2xl font-semibold my-0 p-0 text-gray-800 leading-none',
  h3: 'text-xl font-semibold my-0 p-0 text-gray-800 leading-none',
  text: 'text-base my-1 text-gray-700 leading-relaxed',
  bullet_list: 'text-base my-0 text-gray-700 leading-relaxed',
  numbered_list: 'text-base my-0 text-gray-700 leading-relaxed',
  divider: '',
  table: '',
};

// Handle wrapper height matches each block's first line height for vertical centering
const HANDLE_LINE: Record<string, string> = {
  h1: 'h-9',             // 36px = text-4xl with leading-none
  h2: 'h-6',             // 24px = text-2xl with leading-none
  h3: 'h-5',             // 20px = text-xl with leading-none
  text: 'h-[26px] mt-1', // 26px = text-base * leading-relaxed, mt-1 matches text's my-1
  bullet_list: 'h-[26px]',
  numbered_list: 'h-[26px]',
  divider: 'h-4',
  table: 'h-6',
};

export const Block: React.FC<BlockProps> = ({
  block,
  isSelected,
  updateBlock,
  addBlock,
  addListBlock,
  removeBlock,
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

  useEffect(() => {
    if (block.type === 'table' || block.type === 'divider') return;
    const el = document.getElementById(`editable-${block.id}`);
    if (el && el.innerText !== block.content) {
      const isFocused = document.activeElement === el;
      el.innerText = block.content;
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
        if (block.content.trim() === '') {
          // Empty list item → convert to text
          updateBlock(block.id, { type: 'text', indent: undefined });
        } else {
          addListBlock(block.id, block.type, indent);
        }
      } else {
        addBlock(block.id);
      }
    }

    if (e.key === 'Backspace' && (!block.content || block.content.trim() === '')) {
      e.preventDefault();
      if (isList) {
        updateBlock(block.id, { type: 'text', indent: undefined });
      } else {
        removeBlock(block.id);
      }
    }

    if (e.key === 'ArrowUp') {
      const currentEl = document.getElementById(`editable-${block.id}`);
      const blockContainer = currentEl?.closest('.group');
      // Walk backwards through siblings, crossing page boundaries, skipping dividers
      let candidate = blockContainer?.previousSibling as HTMLElement | null;
      if (!candidate) {
        // Cross page boundary: go to previous page's last block
        const page = blockContainer?.parentElement;
        const prevPage = page?.previousElementSibling as HTMLElement | null;
        if (prevPage) candidate = prevPage.lastElementChild as HTMLElement | null;
      }
      while (candidate) {
        const editables = candidate.querySelectorAll('[contenteditable]');
        if (editables.length > 0) {
          // Focus last editable (bottom-right for tables)
          (editables[editables.length - 1] as HTMLElement).focus();
          break;
        }
        // Skip this block (divider), try next one up
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
      const blockContainer = currentEl?.closest('.group');
      // Walk forwards through siblings, crossing page boundaries, skipping dividers
      let candidate = blockContainer?.nextSibling as HTMLElement | null;
      if (!candidate) {
        // Cross page boundary: go to next page's first block
        const page = blockContainer?.parentElement;
        const nextPage = page?.nextElementSibling as HTMLElement | null;
        if (nextPage) candidate = nextPage.firstElementChild as HTMLElement | null;
      }
      while (candidate) {
        const editable = candidate.querySelector('[contenteditable]') as HTMLElement | null;
        if (editable) {
          editable.focus();
          break;
        }
        // Skip this block (divider), try next one down
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
        // Last block — if empty just stay, otherwise create a new one
        e.preventDefault();
        if (block.content.trim() !== '') {
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

  return (
    <div
      ref={internalRef}
      data-block-id={block.id}
      className="group relative flex items-start -ml-12 pr-2 py-0.5 my-0.5"
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
                  if (editable) { editable.focus(); break; }
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
                  if (editables.length > 0) { (editables[editables.length - 1] as HTMLElement).focus(); break; }
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
              className={`outline-none empty:before:text-gray-300 cursor-text flex-1 min-w-0 ${BLOCK_STYLES[block.type]} focus:empty:before:content-[attr(data-placeholder)]`}
              data-placeholder={isList ? 'Lista...' : "Digite '/' para comandos..."}
              onKeyDown={handleKeyDown}
              onInput={e => updateBlock(block.id, { content: e.currentTarget.innerText })}
              onFocus={onClearSelection}
            />
          </div>
        )}
      </div>
    </div>
  );
};
