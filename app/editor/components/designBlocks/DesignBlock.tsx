'use client';

import React, { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Image, Shapes } from 'lucide-react';
import { BlockData } from '../../types';
import { getTemplate } from './registry';
import { useLibraryTemplate } from '../../designLibrary';
import { IconPicker } from './IconPicker';
import { useSwappable } from './useSwappable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Allowed tags for editable content — everything else is stripped */
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'SPAN', 'SUB', 'SUP', 'A', 'FONT',
]);

/** Sanitize HTML from contentEditable: keep only safe formatting tags */
function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  function walk(node: Node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED_TAGS.has(el.tagName)) {
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
          } else if (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript')) {
            el.removeAttribute(attr.name);
          }
        }
        walk(el);
      }
    }
  }

  walk(div);
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DesignBlockProps {
  block: BlockData;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  uploadImage?: (file: File) => Promise<string | null>;
  autoNumber?: string;
}

/**
 * Outer guard component. Runs the minimal hooks needed to look up the
 * template, then either bails out (returns null) or mounts the inner
 * implementation with `data` + `template` guaranteed non-null.
 *
 * This split exists because the inner component runs ~10+ hooks, and the
 * presence of `template` can flip across renders (e.g. async library
 * bootstrap finishing after the first render). Without this split, the
 * early-return-then-hooks pattern would crash with "Rendered more hooks
 * than during the previous render" the first time the library snapshot
 * gains a previously-missing template.
 */
export const DesignBlock: React.FC<DesignBlockProps> = ({ block, updateBlock, uploadImage, autoNumber }) => {
  const data = block.designBlockData;
  const liveTemplate = useLibraryTemplate(data?.templateId);
  const template = liveTemplate ?? (data ? getTemplate(data.templateId) : undefined);
  if (!data || !template) return null;
  return (
    <DesignBlockInner
      block={block}
      data={data}
      template={template}
      updateBlock={updateBlock}
      uploadImage={uploadImage}
      autoNumber={autoNumber}
    />
  );
};

interface DesignBlockInnerProps {
  block: BlockData;
  data: NonNullable<BlockData['designBlockData']>;
  template: NonNullable<ReturnType<typeof getTemplate>>;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  uploadImage?: (file: File) => Promise<string | null>;
  autoNumber?: string;
}

const DesignBlockInner: React.FC<DesignBlockInnerProps> = ({ block, data, template, updateBlock, uploadImage, autoNumber }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLocalEdit = useRef(false);
  const isBuilt = useRef(false);
  const mountedTemplateId = useRef<string | null>(null);
  /** Tracks the html signature of the mounted template so we rebuild on edit */
  const mountedTemplateHtml = useRef<string | null>(null);

  // Stable refs to avoid stale closures in DOM event listeners attached
  // imperatively inside the build effect below. We refresh them in a
  // useLayoutEffect (synchronous post-commit) so any handler triggered after
  // the DOM is committed sees the latest values without violating the
  // "no ref writes during render" lint rule.
  const valuesRef = useRef(data.values);
  const dataRef = useRef(data);
  const updateBlockRef = useRef(updateBlock);
  useLayoutEffect(() => {
    valuesRef.current = data.values;
    dataRef.current = data;
    updateBlockRef.current = updateBlock;
  });

  const values = data.values;

  // Save values with sanitization (for editable HTML content)
  const saveValues = useCallback((updated: Record<string, string>) => {
    isLocalEdit.current = true;
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(updated)) {
      sanitized[k] = sanitizeHtml(v);
    }
    updateBlockRef.current(block.id, {
      designBlockData: { ...dataRef.current!, values: { ...valuesRef.current, ...sanitized } },
    });
  }, [block.id]);

  // Save values without sanitization (for URLs / image sources)
  const saveRawValues = useCallback((updated: Record<string, string>) => {
    isLocalEdit.current = true;
    updateBlockRef.current(block.id, {
      designBlockData: { ...dataRef.current!, values: { ...valuesRef.current, ...updated } },
    });
  }, [block.id]);

  // Swappable images/icons hook. Destructured up-front so the JSX below
  // doesn't access ref-typed properties off the hook object during render
  // (the lint rule react-hooks/refs flags any property access on an object
  // that exposes refs in its public shape).
  const {
    fileInputRef,
    popoverRef,
    swapPopover,
    iconPickerOpen,
    iconPickerPos,
    attachSwapListeners,
    handleFileChange,
    handleIconSelect,
    handleCloseIconPicker,
    openIconPicker,
    openFileInput,
    getPortalTarget,
  } = useSwappable({ containerRef, saveValues: saveRawValues, uploadImage });

  // Keyboard handler for editable zones
  const handleZoneKeyDown = useCallback((e: KeyboardEvent, el: HTMLElement) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('insertLineBreak');
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.stopPropagation();
    }
    if (e.key === '/') {
      e.stopPropagation();
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const cursorRect = range.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const noHeight = !cursorRect.height;
      const atTop = e.key === 'ArrowUp' && (noHeight || cursorRect.top - elRect.top < 4);
      const atBottom = e.key === 'ArrowDown' && (noHeight || elRect.bottom - cursorRect.bottom < 4);

      if (!atTop && !atBottom) return;

      e.preventDefault();
      e.stopPropagation();

      const container = el.closest('.design-block-container');
      if (!container) return;
      const zones = Array.from(container.querySelectorAll<HTMLElement>('[data-editable]'));
      const currentIdx = zones.indexOf(el);

      const nextIdx = e.key === 'ArrowDown' ? currentIdx + 1 : currentIdx - 1;
      if (nextIdx >= 0 && nextIdx < zones.length) {
        focusAndScroll(zones[nextIdx], sel, e.key === 'ArrowUp');
        return;
      }

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
    }
  }, []);

  // Build DOM once when template changes. Update zones surgically otherwise.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isLocalEdit.current) {
      isLocalEdit.current = false;
      return;
    }

    const needsFullBuild = !isBuilt.current
      || mountedTemplateId.current !== data.templateId
      || mountedTemplateHtml.current !== template.html;

    if (needsFullBuild) {
      const div = document.createElement('div');
      div.innerHTML = template.html;

      div.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
        const key = el.getAttribute('data-editable')!;
        el.innerHTML = sanitizeHtml(values[key] ?? template.defaults[key] ?? '');
        el.setAttribute('contenteditable', 'true');
        el.style.outline = 'none';
        el.style.minHeight = '1em';
        el.style.cursor = 'text';
        el.style.fontSize = 'inherit';
      });

      div.querySelectorAll<HTMLImageElement>('[data-swappable]').forEach(el => {
        const key = el.getAttribute('data-swappable')!;
        el.src = values[key] ?? template.defaults[key] ?? '';
      });

      div.querySelectorAll<HTMLElement>('[data-autonumber]').forEach(el => {
        el.textContent = autoNumber ?? '';
      });

      container.innerHTML = div.innerHTML;

      // Attach editable listeners
      container.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
        el.addEventListener('input', () => {
          const key = el.getAttribute('data-editable')!;
          isLocalEdit.current = true;
          saveValues({ [key]: el.innerHTML });
        });
        el.addEventListener('keydown', (e) => handleZoneKeyDown(e, el));
      });

      // Attach swappable listeners (delegated to hook)
      attachSwapListeners(container);

      isBuilt.current = true;
      mountedTemplateId.current = data.templateId;
      mountedTemplateHtml.current = template.html;
    } else {
      container.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
        const key = el.getAttribute('data-editable')!;
        const newVal = sanitizeHtml(values[key] ?? template.defaults[key] ?? '');
        if (el.innerHTML !== newVal) {
          el.innerHTML = newVal;
        }
      });
      container.querySelectorAll<HTMLImageElement>('[data-swappable]').forEach(el => {
        const key = el.getAttribute('data-swappable')!;
        const newVal = values[key] ?? template.defaults[key] ?? '';
        if (el.src !== newVal) {
          el.src = newVal;
        }
      });
    }

    container.querySelectorAll<HTMLElement>('[data-autonumber]').forEach(el => {
      const num = autoNumber ?? '';
      if (el.textContent !== num) el.textContent = num;
    });
  }, [data.templateId, JSON.stringify(values), autoNumber, template, saveValues, handleZoneKeyDown, attachSwapListeners]);

  // Apply text alignment to all editable zones
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const align = block.align || 'left';
    container.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
      el.style.textAlign = align;
    });
  }, [block.align]);

  // Clean up built state on unmount
  useEffect(() => {
    return () => { isBuilt.current = false; };
  }, []);

  return (
    <div className="my-1 relative">
      <div ref={containerRef} className="design-block-container" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Swap choice popover (portal to scroll container for absolute positioning) */}
      {swapPopover && createPortal(
        <div
          ref={popoverRef}
          className="absolute z-9999 bg-white shadow-xl border border-gray-200 rounded-lg py-1 w-44"
          style={{
            left: swapPopover.x,
            top: swapPopover.y,
            transform: 'translateX(-50%)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2.5 text-gray-700"
            onClick={openIconPicker}
          >
            <Shapes size={16} className="text-purple-500" />
            Escolher ícone
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2.5 text-gray-700"
            onClick={openFileInput}
          >
            <Image size={16} className="text-blue-500" />
            Enviar imagem
          </button>
        </div>,
        getPortalTarget(),
      )}

      {/* Icon picker floating panel (portal to scroll container) */}
      {iconPickerOpen && createPortal(
        <div
          className="absolute z-9999"
          style={{
            left: iconPickerPos.x,
            top: iconPickerPos.y,
            transform: 'translateX(-50%)',
          }}
        >
          <IconPicker
            onSelect={handleIconSelect}
            onClose={handleCloseIconPicker}
          />
        </div>,
        getPortalTarget(),
      )}
    </div>
  );
};
