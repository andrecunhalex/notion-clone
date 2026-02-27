'use client';

import React, { useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { GripVertical } from 'lucide-react';
import { BlockData, SlashMenuState, DropTarget } from '../types';

interface BlockProps {
  block: BlockData;
  index: number;
  isSelected: boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (afterId: string) => void;
  removeBlock: (id: string) => void;
  setSlashMenu: Dispatch<SetStateAction<SlashMenuState>>;
  blockRef: (el: HTMLDivElement | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent) => void;
  dropTarget: DropTarget | null;
  onHeightChange: (id: string, height: number) => void;
  onClearSelection: () => void;
}

const BLOCK_STYLES: Record<string, string> = {
  h1: 'text-3xl font-bold mt-6 mb-2 text-gray-900',
  h2: 'text-2xl font-semibold mt-4 mb-2 text-gray-800',
  text: 'text-base my-1 text-gray-700 leading-relaxed'
};

export const Block: React.FC<BlockProps> = ({
  block,
  index,
  isSelected,
  updateBlock,
  addBlock,
  removeBlock,
  setSlashMenu,
  blockRef,
  onDragStart,
  onDragOver,
  onDrop,
  dropTarget,
  onHeightChange,
  onClearSelection
}) => {
  const internalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (internalRef.current) {
      blockRef(internalRef.current);

      const ro = new ResizeObserver(() => {
        if (internalRef.current) {
          // Usa offsetHeight para capturar altura total (conteúdo + padding + border)
          onHeightChange(block.id, internalRef.current.offsetHeight);
        }
      });
      ro.observe(internalRef.current);
      return () => ro.disconnect();
    }
  }, [block.id, onHeightChange, blockRef]);

  useEffect(() => {
    const el = document.getElementById(`editable-${block.id}`);
    if (el && document.activeElement !== el && el.innerText !== block.content) {
      el.innerText = block.content;
    }
  }, [block.content, block.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      addBlock(block.id);
    }

    if (e.key === 'Backspace' && (!block.content || block.content.trim() === '')) {
      e.preventDefault();
      removeBlock(block.id);
    }

    if (e.key === 'ArrowUp') {
      const currentEl = document.getElementById(`editable-${block.id}`);
      const blockContainer = currentEl?.closest('.group');
      const prev = blockContainer?.previousSibling as HTMLElement;
      if (prev) {
        const editable = prev.querySelector('[contenteditable]') as HTMLElement;
        if (editable) editable.focus();
      }
    }

    if (e.key === 'ArrowDown') {
      const currentEl = document.getElementById(`editable-${block.id}`);
      const blockContainer = currentEl?.closest('.group');
      const next = blockContainer?.nextSibling as HTMLElement;
      if (next) {
        const editable = next.querySelector('[contenteditable]') as HTMLElement;
        if (editable) editable.focus();
      }
    }
  };

  return (
    <div
      ref={internalRef}
      className={`group relative flex items-start -ml-12 pl-12 pr-2 py-0.5 transition-colors ${
        isSelected ? 'bg-blue-100' : 'hover:bg-gray-50'
      }`}
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

      <div
        className="drag-handle absolute left-2 top-1.5 p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-opacity"
        draggable
        onDragStart={e => onDragStart(e, block.id)}
        onMouseDown={e => e.stopPropagation()}
      >
        <GripVertical size={16} />
      </div>

      <div className="flex-1 min-w-0 notion-block-content">
        <div
          id={`editable-${block.id}`}
          contentEditable
          suppressContentEditableWarning
          className={`outline-none empty:before:text-gray-300 cursor-text ${BLOCK_STYLES[block.type]} focus:empty:before:content-[attr(data-placeholder)]`}
          data-placeholder="Digite '/' para comandos..."
          onKeyDown={handleKeyDown}
          onInput={e => updateBlock(block.id, { content: e.currentTarget.innerText })}
          onFocus={onClearSelection}
        />
      </div>
    </div>
  );
};
