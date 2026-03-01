import { useCallback } from 'react';
import { BlockData } from '../types';
import { generateId } from '../utils';

// Marker used to detect our own clipboard data inside HTML
const CLIPBOARD_MARKER = 'data-nc-blocks';

interface UseClipboardProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}

// ---------------------------------------------------------------------------
// HTML ↔ Blocks conversion
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set(['style', 'script', 'meta', 'link', 'head', 'colgroup']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'li', 'blockquote', 'pre', 'div', 'ul', 'ol', 'table']);

/** Extract text from a node, converting <br> to \n */
function getInnerText(node: Node): string {
  let text = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase();
      if (tag === 'br') {
        text += '\n';
      } else if (!SKIP_TAGS.has(tag)) {
        text += getInnerText(child);
      }
    }
  });
  return text;
}

/** Parse clipboard HTML into blocks */
function parseHtmlToBlocks(html: string): BlockData[] | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: BlockData[] = [];

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({ id: generateId(), type: 'text', content: text });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (SKIP_TAGS.has(tag)) return;

    if (tag === 'h1') {
      blocks.push({ id: generateId(), type: 'h1', content: getInnerText(el) });
    } else if (tag === 'h2' || tag === 'h3') {
      blocks.push({ id: generateId(), type: 'h2', content: getInnerText(el) });
    } else if (tag === 'p') {
      // Always create block (even if empty — preserves spacing like Notion)
      blocks.push({ id: generateId(), type: 'text', content: getInnerText(el) });
    } else if (tag === 'ul' || tag === 'ol') {
      el.childNodes.forEach(child => processNode(child));
    } else if (tag === 'li') {
      blocks.push({ id: generateId(), type: 'text', content: getInnerText(el) });
    } else if (tag === 'div' || tag === 'article' || tag === 'section' || tag === 'main') {
      // Container: check if it has block-level children
      const hasBlockChildren = Array.from(el.children).some(c =>
        BLOCK_TAGS.has(c.tagName.toLowerCase())
      );
      if (hasBlockChildren) {
        el.childNodes.forEach(child => processNode(child));
      } else {
        const content = getInnerText(el);
        blocks.push({ id: generateId(), type: 'text', content });
      }
    } else {
      // Other elements — extract text if any
      const content = getInnerText(el);
      if (content.trim()) {
        blocks.push({ id: generateId(), type: 'text', content });
      }
    }
  };

  doc.body.childNodes.forEach(child => processNode(child));
  return blocks.length > 0 ? blocks : null;
}

/** Convert blocks to HTML for external paste */
function blocksToHtml(blocks: BlockData[]): string {
  return blocks.map(b => {
    const content = (b.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    switch (b.type) {
      case 'h1': return `<h1>${content}</h1>`;
      case 'h2': return `<h2>${content}</h2>`;
      default: return `<p>${content}</p>`;
    }
  }).join('');
}

/** Convert blocks to plain text */
function blocksToText(blocks: BlockData[]): string {
  return blocks.map(b => b.content).join('\n');
}

/**
 * Parse plain text into blocks, line by line.
 * - Single \n within text = line break inside a block
 * - First blank line after text = end of that block
 * - Consecutive blank lines = empty blocks (one per extra blank line)
 * - Supports # / ## markdown headings
 */
function parsePlainTextToBlocks(text: string): BlockData[] | null {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: BlockData[] = [];
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentLines.length === 0) return;
    const content = currentLines.join('\n');
    const trimmed = content.trim();
    let type: BlockData['type'] = 'text';
    let finalContent = content;

    if (trimmed.startsWith('# ')) {
      type = 'h1';
      finalContent = trimmed.slice(2);
    } else if (trimmed.startsWith('## ')) {
      type = 'h2';
      finalContent = trimmed.slice(3);
    }

    blocks.push({ id: generateId(), type, content: finalContent });
    currentLines = [];
  };

  for (const line of lines) {
    if (line.trim() === '') {
      if (currentLines.length > 0) {
        // End of current block
        flushCurrent();
      } else {
        // Consecutive blank line → empty block
        blocks.push({ id: generateId(), type: 'text', content: '' });
      }
    } else {
      currentLines.push(line);
    }
  }

  flushCurrent();
  return blocks.length > 0 ? blocks : null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useClipboard = ({ blocks, setBlocks, selectedIds, setSelectedIds }: UseClipboardProps) => {

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return;

    const selectedBlocks = blocks.filter(b => selectedIds.has(b.id));
    const json = encodeURIComponent(JSON.stringify(selectedBlocks));
    const innerHtml = blocksToHtml(selectedBlocks);
    // Embed JSON in a data attribute so paste can restore exact blocks
    const html = `<div ${CLIPBOARD_MARKER}="${json}">${innerHtml}</div>`;
    const text = blocksToText(selectedBlocks);

    try {
      navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })
      ]);
    } catch {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }, [blocks, selectedIds]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let processedBlocks: BlockData[] | null = null;
    const html = clipboardData.getData('text/html');

    // 1. Check for our own format (JSON embedded in HTML data attribute)
    if (html) {
      const match = html.match(new RegExp(`${CLIPBOARD_MARKER}="([^"]*)"`));
      if (match) {
        try {
          const data = JSON.parse(decodeURIComponent(match[1])) as BlockData[];
          processedBlocks = data.map(b => ({ ...b, id: generateId() }));
        } catch { /* fall through */ }
      }
    }

    // 2. Parse HTML (for block types) and plain text (for structure with empty blocks)
    if (!processedBlocks) {
      const text = clipboardData.getData('text/plain');
      const htmlBlocks = html ? parseHtmlToBlocks(html) : null;
      const textBlocks = text ? parsePlainTextToBlocks(text) : null;

      if (htmlBlocks && textBlocks && textBlocks.length > htmlBlocks.length) {
        // Plain text has more blocks (empty blocks preserved) — use it but inherit types from HTML
        const htmlTypeMap = new Map<string, BlockData['type']>();
        for (const hb of htmlBlocks) {
          if (hb.type !== 'text') {
            htmlTypeMap.set(hb.content.trim(), hb.type);
          }
        }
        for (const tb of textBlocks) {
          const htmlType = htmlTypeMap.get(tb.content.trim());
          if (htmlType) tb.type = htmlType;
        }
        processedBlocks = textBlocks;
      } else if (htmlBlocks) {
        processedBlocks = htmlBlocks;
      } else {
        processedBlocks = textBlocks;
      }
    }

    if (!processedBlocks || processedBlocks.length === 0) return;

    e.preventDefault();

    // --- Determine insert position ---
    let insertIndex = blocks.length;
    let removeSelected = false;
    let replaceEmpty = false;

    if (selectedIds.size > 0) {
      // Replace selected blocks with pasted content
      removeSelected = true;
      insertIndex = blocks.findIndex(b => selectedIds.has(b.id));
      if (insertIndex === -1) insertIndex = blocks.length;
    } else if (document.activeElement?.id.startsWith('editable-')) {
      const activeId = document.activeElement.id.replace('editable-', '');
      const activeIndex = blocks.findIndex(b => b.id === activeId);
      if (activeIndex !== -1) {
        const activeBlock = blocks[activeIndex];
        if (activeBlock.type === 'text' && activeBlock.content.trim() === '') {
          replaceEmpty = true;
          insertIndex = activeIndex;
        } else {
          insertIndex = activeIndex + 1;
        }
      }
    }

    // --- Build final blocks ---
    let finalBlocks: BlockData[];

    if (removeSelected) {
      finalBlocks = blocks.filter(b => !selectedIds.has(b.id));
      finalBlocks.splice(insertIndex, 0, ...processedBlocks);
    } else if (replaceEmpty) {
      finalBlocks = [...blocks];
      finalBlocks.splice(insertIndex, 1, ...processedBlocks);
    } else {
      finalBlocks = [...blocks];
      finalBlocks.splice(insertIndex, 0, ...processedBlocks);
    }

    // Blur active element so content syncs
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setBlocks(finalBlocks);

    // Select pasted blocks (Notion behavior)
    setSelectedIds(new Set(processedBlocks.map(b => b.id)));
  }, [blocks, setBlocks, selectedIds, setSelectedIds]);

  return { handleCopy, handlePaste };
};
