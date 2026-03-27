'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { BlockData } from '../../types';
import { getTemplate } from './registry';

function focusAndScroll(target: HTMLElement, sel: Selection, collapseToEnd: boolean) {
  target.focus({ preventScroll: true });
  const r = document.createRange();
  r.selectNodeContents(target);
  r.collapse(collapseToEnd);
  sel.removeAllRanges();
  sel.addRange(r);
  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const margin = 60;
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

interface DesignBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  uploadImage?: (file: File) => Promise<string | null>;
}

export const DesignBlock: React.FC<DesignBlockProps> = ({ block, updateBlock, uploadImage }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSwapKey = useRef<string | null>(null);
  const isLocalEdit = useRef(false);

  const data = block.designBlockData;
  if (!data) return null;

  const template = getTemplate(data.templateId);
  if (!template) return null;

  const values = data.values;

  // Build the HTML with current values injected
  const buildHtml = useCallback(() => {
    const div = document.createElement('div');
    div.innerHTML = template.html;

    // Inject editable values
    div.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
      const key = el.getAttribute('data-editable')!;
      el.innerHTML = values[key] ?? template.defaults[key] ?? '';
      el.setAttribute('contenteditable', 'true');
      el.style.outline = 'none';
      el.style.minHeight = '1em';
    });

    // Inject swappable images
    div.querySelectorAll<HTMLImageElement>('[data-swappable]').forEach(el => {
      const key = el.getAttribute('data-swappable')!;
      el.src = values[key] ?? template.defaults[key] ?? '';
    });

    return div.innerHTML;
  }, [template, values]);

  // Render template HTML and attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Skip sync when we just saved locally
    if (isLocalEdit.current) {
      isLocalEdit.current = false;
      return;
    }

    container.innerHTML = buildHtml();
    attachListeners(container);
  }, [data.templateId, JSON.stringify(values)]);

  const saveValues = useCallback((updated: Record<string, string>) => {
    isLocalEdit.current = true;
    updateBlock(block.id, {
      designBlockData: { ...data, values: { ...values, ...updated } },
    });
  }, [block.id, data, values, updateBlock]);

  const attachListeners = useCallback((container: HTMLElement) => {
    // Editable zones: save on input
    container.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
      el.setAttribute('contenteditable', 'true');
      el.style.outline = 'none';
      el.style.cursor = 'text';

      el.addEventListener('input', () => {
        const key = el.getAttribute('data-editable')!;
        isLocalEdit.current = true;
        saveValues({ [key]: el.innerHTML });
      });

      // Prevent Enter from creating blocks — insert line break instead
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          document.execCommand('insertLineBreak');
        }
        // Stop backspace/delete from bubbling to block manager
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.stopPropagation();
        }
        // Stop slash from opening menu inside design block
        if (e.key === '/') {
          e.stopPropagation();
        }
        // ArrowUp/Down: navigate between editable zones, then escape to adjacent blocks
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;

          // Check if cursor is at the edge of this zone
          const range = sel.getRangeAt(0);
          const cursorRect = range.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          // For empty elements or collapsed ranges with no height, treat as at-edge
          const noHeight = !cursorRect.height;
          const atTop = e.key === 'ArrowUp' && (noHeight || cursorRect.top - elRect.top < 4);
          const atBottom = e.key === 'ArrowDown' && (noHeight || elRect.bottom - cursorRect.bottom < 4);

          if (!atTop && !atBottom) return; // let browser handle normal cursor movement

          e.preventDefault();
          e.stopPropagation();

          // Collect all editable zones in this design block
          const container = el.closest('.design-block-container');
          if (!container) return;
          const zones = Array.from(container.querySelectorAll<HTMLElement>('[data-editable]'));
          const currentIdx = zones.indexOf(el);

          // Try to move to adjacent zone within the same design block
          const nextIdx = e.key === 'ArrowDown' ? currentIdx + 1 : currentIdx - 1;
          if (nextIdx >= 0 && nextIdx < zones.length) {
            const target = zones[nextIdx];
            focusAndScroll(target, sel, e.key === 'ArrowUp');
            return;
          }

          // No more zones in this direction → navigate to adjacent block
          const blockWrapper = el.closest('[data-block-id]');
          if (!blockWrapper) return;
          const sibling = e.key === 'ArrowUp'
            ? blockWrapper.previousElementSibling
            : blockWrapper.nextElementSibling;
          if (sibling) {
            const editables = sibling.querySelectorAll<HTMLElement>('[contenteditable="true"]');
            const target = e.key === 'ArrowUp'
              ? editables[editables.length - 1]
              : editables[0];
            if (target) focusAndScroll(target, sel, e.key === 'ArrowUp');
          }
          return;
        }
      });
    });

    // Swappable zones: click to change image
    container.querySelectorAll<HTMLElement>('[data-swappable]').forEach(el => {
      el.style.cursor = 'pointer';
      el.style.transition = 'box-shadow 0.15s ease';

      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = '0 0 0 2px rgba(139, 92, 246, 0.5)';
        el.style.borderRadius = '8px';
      });
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = 'none';
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeSwapKey.current = el.getAttribute('data-swappable');
        fileInputRef.current?.click();
      });
    });
  }, [saveValues]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = activeSwapKey.current;
    if (!file || !key) return;

    let src: string;
    if (uploadImage) {
      const url = await uploadImage(file);
      src = url || URL.createObjectURL(file);
    } else {
      src = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    saveValues({ [key]: src });

    // Update DOM immediately
    const img = containerRef.current?.querySelector(`[data-swappable="${key}"]`) as HTMLImageElement;
    if (img) img.src = src;

    // Reset input so same file can be re-selected
    e.target.value = '';
    activeSwapKey.current = null;
  }, [uploadImage, saveValues]);

  return (
    <div className="my-1">
      <div ref={containerRef} className="design-block-container" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};
