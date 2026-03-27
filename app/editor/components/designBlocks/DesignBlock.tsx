'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { BlockData } from '../../types';
import { getTemplate } from './registry';

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
        // Strip disallowed elements but keep their text content
        if (!ALLOWED_TAGS.has(el.tagName)) {
          // Move children up before removing the element
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          continue;
        }
        // Remove dangerous attributes (event handlers, script URLs)
        // Keep: style, color, class, href (non-javascript), face, size
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

export const DesignBlock: React.FC<DesignBlockProps> = ({ block, updateBlock, uploadImage, autoNumber }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSwapKey = useRef<string | null>(null);
  const isLocalEdit = useRef(false);
  const isBuilt = useRef(false);
  const mountedTemplateId = useRef<string | null>(null);

  // Stable refs to avoid stale closures in DOM event listeners
  const valuesRef = useRef(block.designBlockData?.values ?? {});
  const dataRef = useRef(block.designBlockData);
  const updateBlockRef = useRef(updateBlock);
  valuesRef.current = block.designBlockData?.values ?? {};
  dataRef.current = block.designBlockData;
  updateBlockRef.current = updateBlock;

  const data = block.designBlockData;
  if (!data) return null;

  const template = getTemplate(data.templateId);
  if (!template) return null;

  const values = data.values;

  // Save values with sanitization
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

  // Keyboard handler for editable zones (attached once, uses refs for fresh values)
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
    // ArrowUp/Down: navigate between zones, then escape to adjacent blocks
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

    // Skip when we just saved locally (DOM is already up to date)
    if (isLocalEdit.current) {
      isLocalEdit.current = false;
      return;
    }

    const needsFullBuild = !isBuilt.current || mountedTemplateId.current !== data.templateId;

    if (needsFullBuild) {
      // --- Full build: first render or template changed ---
      const div = document.createElement('div');
      div.innerHTML = template.html;

      // Inject values + make editable
      div.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
        const key = el.getAttribute('data-editable')!;
        el.innerHTML = sanitizeHtml(values[key] ?? template.defaults[key] ?? '');
        el.setAttribute('contenteditable', 'true');
        el.style.outline = 'none';
        el.style.minHeight = '1em';
        el.style.cursor = 'text';
      });

      // Inject swappable images
      div.querySelectorAll<HTMLImageElement>('[data-swappable]').forEach(el => {
        const key = el.getAttribute('data-swappable')!;
        el.src = values[key] ?? template.defaults[key] ?? '';
      });

      // Inject auto-number (read-only, computed from document position)
      div.querySelectorAll<HTMLElement>('[data-autonumber]').forEach(el => {
        el.textContent = autoNumber ?? '';
      });

      container.innerHTML = div.innerHTML;

      // Attach listeners ONCE
      container.querySelectorAll<HTMLElement>('[data-editable]').forEach(el => {
        el.addEventListener('input', () => {
          const key = el.getAttribute('data-editable')!;
          isLocalEdit.current = true;
          saveValues({ [key]: el.innerHTML });
        });
        el.addEventListener('keydown', (e) => handleZoneKeyDown(e, el));
      });

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
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          activeSwapKey.current = el.getAttribute('data-swappable');
          fileInputRef.current?.click();
        });
      });

      isBuilt.current = true;
      mountedTemplateId.current = data.templateId;
    } else {
      // --- Surgical update: only patch changed zones (collab/undo) ---
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

    // Always update auto-number (cheap, no rebuild needed)
    container.querySelectorAll<HTMLElement>('[data-autonumber]').forEach(el => {
      const num = autoNumber ?? '';
      if (el.textContent !== num) el.textContent = num;
    });
  }, [data.templateId, JSON.stringify(values), autoNumber, template, saveValues, handleZoneKeyDown]);

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
