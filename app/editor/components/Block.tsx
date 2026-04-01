'use client';

import React, { useRef, useEffect, useCallback, useMemo, Dispatch, SetStateAction, memo } from 'react';
import { GripVertical } from 'lucide-react';
import { BlockData, BlockType, SlashMenuState, DropTarget } from '../types';
import { isListType, getBulletChar, isContentEmpty } from '../utils';
import { TableBlock } from './TableBlock';
import { ImageBlock } from './ImageBlock';
import { DesignBlock } from './designBlocks';
import { useBlockKeyboard, findEditable, focusEditable } from '../hooks/useBlockKeyboard';

interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BlockProps {
  block: BlockData;
  index: number;
  isSelected: boolean;
  listNumber: number;
  isLastBlock: boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (afterId: string) => void;
  addBlockBefore: (beforeId: string) => void;
  addBlockWithContent: (afterId: string, content: string, sourceContent?: string) => void;
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
  onBlockFocus?: (blockId: string | null) => void;
  uploadImage?: (file: File) => Promise<string | null>;
  autoNumber?: string;
  edgePadding: EdgePadding;
  isFirstOnPage?: boolean;
  isLastOnPage?: boolean;
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
  design_block: '',
};

const BLOCK_INLINE_STYLES: Record<string, React.CSSProperties> = {
  h1: { fontSize: '1.875em', lineHeight: 1.3 },
  h2: { fontSize: '1.5em', lineHeight: 1.3 },
  h3: { fontSize: '1.25em', lineHeight: 1.3 },
  text: { fontSize: '16px', lineHeight: 1.5 },
  bullet_list: { fontSize: '16px', lineHeight: 1.5 },
  numbered_list: { fontSize: '16px', lineHeight: 1.5 },
};

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
  design_block: 'h-6',
};

const BlockInner: React.FC<BlockProps> = ({
  block,
  isSelected,
  listNumber,
  isLastBlock,
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
  onBlockFocus,
  uploadImage,
  autoNumber,
  edgePadding,
  isFirstOnPage,
  isLastOnPage,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  // Track whether the user is actively editing this block's contentEditable
  const isLocalEditRef = useRef(false);

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
    if (block.type === 'table' || block.type === 'divider' || block.type === 'image' || block.type === 'design_block') return;
    const el = document.getElementById(`editable-${block.id}`);
    if (el) {
      el.classList.toggle('is-empty', isContentEmpty(block.content));
    }
  }, [block.content, block.id, block.type]);

  // Sync innerHTML from external changes only (undo/redo, paste, collaborative edits)
  // Skip when user is actively typing in this block (isLocalEditRef)
  useEffect(() => {
    if (block.type === 'table' || block.type === 'divider' || block.type === 'image' || block.type === 'design_block') return;
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      return;
    }
    const el = document.getElementById(`editable-${block.id}`);
    if (!el) return;

    // Sanitize nested contentEditable elements that corrupt cursor tracking
    let content = block.content;
    if (content.includes('contenteditable')) {
      const temp = document.createElement('div');
      temp.innerHTML = content;
      temp.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
      temp.querySelectorAll('[id^="editable-"]').forEach(n => n.removeAttribute('id'));
      temp.querySelectorAll('[data-block-id]').forEach(n => n.removeAttribute('data-block-id'));
      temp.querySelectorAll('.drag-handle').forEach(n => n.remove());
      content = temp.innerHTML;
      // Persist sanitized content back to state
      if (content !== block.content) {
        isLocalEditRef.current = true;
        updateBlock(block.id, { content });
      }
    }

    if (el.innerHTML !== content) {
      const isFocused = document.activeElement === el;
      el.innerHTML = content;
      if (isFocused && content) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [block.content, block.id, block.type, updateBlock]);

  const handleKeyDown = useBlockKeyboard({
    block, isLastBlock, updateBlock, addBlock, addBlockBefore,
    addBlockWithContent, addListBlock, removeBlock, mergeWithPrevious, setSlashMenu,
  });

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Guard: ignore input events that bubbled from a nested contentEditable
    if (e.target !== e.currentTarget) return;
    isLocalEditRef.current = true;
    el.classList.toggle('is-empty', isContentEmpty(el.innerHTML));
    updateBlock(block.id, { content: el.innerHTML });
  }, [block.id, updateBlock]);

  const handleFocus = useCallback(() => {
    onClearSelection();
    onBlockFocus?.(block.id);
  }, [onClearSelection, onBlockFocus, block.id]);

  const isList = isListType(block.type);
  const indent = block.indent ?? 0;

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
    return (
      <span
        className="select-none text-gray-400 shrink-0 inline-flex items-center justify-end pr-1"
        style={{ minWidth: 24 + paddingLeft, paddingLeft }}
      >
        {listNumber}.
      </span>
    );
  };

  const isTable = block.type === 'table';
  const isDivider = block.type === 'divider';
  const isImage = block.type === 'image';
  const isDesignBlock = block.type === 'design_block';
  const isFullWidth = !!block.fullWidth;
  const isNonTextBlock = isTable || isDivider || isImage || isDesignBlock;

  const contentStyle = BLOCK_INLINE_STYLES[block.type];
  const alignStyle = block.align ? { ...contentStyle, textAlign: block.align as React.CSSProperties['textAlign'] } : contentStyle;

  const fullWidthStyle = useMemo(() => isFullWidth ? {
    marginLeft: -edgePadding.left,
    marginRight: -edgePadding.right,
    ...(isFirstOnPage ? { marginTop: -edgePadding.top } : {}),
    ...(isLastOnPage ? { marginBottom: -edgePadding.bottom } : {}),
  } : undefined, [isFullWidth, edgePadding, isFirstOnPage, isLastOnPage]);

  // Set active block on click — only for non-text blocks (text blocks handle this via onFocus)
  const handleBlockClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[contenteditable]')) {
      onBlockFocus?.(block.id);
    }
  }, [onBlockFocus, block.id]);

  return (
    <div
      ref={internalRef}
      data-block-id={block.id}
      className={`group relative flex items-start ${isFullWidth ? '' : '-ml-12 pr-2 py-px my-px'}`}
      style={fullWidthStyle}
      onClick={handleBlockClick}
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

      {isFullWidth ? (
        <div className={`absolute left-2 top-0 w-12 shrink-0 flex items-center justify-center ${HANDLE_LINE[block.type] || 'h-6'} z-10`}>
          <div
            className="drag-handle p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-opacity"
            draggable
            onDragStart={e => onDragStart(e, block.id)}
            onMouseDown={e => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </div>
        </div>
      ) : (
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
      )}

      <div className={`flex-1 min-w-0 notion-block-content ${isFullWidth ? '' : 'py-0.5 px-1'} rounded-sm transition-colors ${
        isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'
      }`}>
        {isDesignBlock ? (
          <DesignBlock
            block={block}
            updateBlock={updateBlock}
            uploadImage={uploadImage}
            autoNumber={autoNumber}
          />
        ) : isDivider ? (
          <div className="py-2">
            <hr className="border-t border-gray-300" />
          </div>
        ) : isImage ? (
          <ImageBlock
            block={block}
            updateBlock={updateBlock}
            removeBlock={removeBlock}
            uploadImage={uploadImage}
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
                else if (isLastBlock) addBlock(block.id);
              } else {
                const target = findEditable(container.previousElementSibling as HTMLElement, 'prev');
                if (target) focusEditable(target, true);
              }
            }}
          />
        ) : (
          <div className="flex items-start">
            {renderListMarker()}
            <div
              id={`editable-${block.id}`}
              contentEditable
              suppressContentEditableWarning
              className={`outline-none cursor-text flex-1 min-w-0 editable-block ${BLOCK_STYLES[block.type]}`}
              style={alignStyle}
              data-placeholder={isList ? 'Lista...' : "Digite '/' para comandos..."}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onFocus={handleFocus}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Memoize Block — only re-render when its own data changes
export const Block = memo(BlockInner, (prev, next) => {
  return (
    prev.block === next.block &&
    prev.isSelected === next.isSelected &&
    prev.listNumber === next.listNumber &&
    prev.isLastBlock === next.isLastBlock &&
    prev.autoNumber === next.autoNumber &&
    prev.edgePadding === next.edgePadding &&
    prev.isFirstOnPage === next.isFirstOnPage &&
    prev.isLastOnPage === next.isLastOnPage &&
    prev.dropTarget?.id === next.dropTarget?.id &&
    prev.dropTarget?.position === next.dropTarget?.position
  );
});
