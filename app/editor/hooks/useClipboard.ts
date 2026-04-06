import { useCallback } from 'react';
import { BlockData } from '../types';
import { generateId, isContentEmpty } from '../utils';
import {
  CLIPBOARD_MARKER,
  parseHtmlToBlocks,
  parsePlainTextToBlocks,
  blocksToHtml,
  blocksToText,
  stripHtml,
} from '../utils/htmlParser';

interface UseClipboardProps {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}

export const useClipboard = ({ blocks, setBlocks, selectedIds, setSelectedIds }: UseClipboardProps) => {

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return;

    const selectedBlocks = blocks.filter(b => selectedIds.has(b.id));
    const json = encodeURIComponent(JSON.stringify(selectedBlocks));
    const innerHtml = blocksToHtml(selectedBlocks);
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
    const text = clipboardData.getData('text/plain');

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

    // 2. If editing inline (focused in a contentEditable) and no own format detected
    if (!processedBlocks) {
      const active = document.activeElement as HTMLElement;
      const isEditing = active?.isContentEditable &&
        (active.id?.startsWith('editable-') || active.hasAttribute('data-table-cell') || active.hasAttribute('data-editable'));

      if (isEditing) {
        const isDesignBlock = active.hasAttribute('data-editable');
        const htmlBlocks = html ? parseHtmlToBlocks(html) : null;
        const isSimplePaste = !htmlBlocks || (
          htmlBlocks.length === 1 && htmlBlocks[0].type === 'text'
        );

        if (isSimplePaste || isDesignBlock) {
          e.preventDefault();
          const cleanHtml = isSimplePaste
            ? (htmlBlocks?.[0]?.content || text || '')
            : (htmlBlocks?.map(b => b.content).join(' ') || text || '');
          if (cleanHtml) {
            document.execCommand('insertHTML', false, cleanHtml);
            active.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return;
        }

        processedBlocks = htmlBlocks;
      }
    }

    // 3. Parse HTML / plain text into blocks
    if (!processedBlocks) {
      const htmlBlocks = html ? parseHtmlToBlocks(html) : null;
      const textBlocks = text ? parsePlainTextToBlocks(text) : null;

      const htmlHasFormatting = htmlBlocks?.some(b =>
        /<(b|i|u|s|code|strong|em)[\s>]/i.test(b.content)
      );
      const htmlHasStructure = htmlBlocks?.some(b => b.type === 'table' || b.type === 'divider');

      if (htmlBlocks && (htmlHasStructure || htmlHasFormatting)) {
        processedBlocks = htmlBlocks;
      } else if (htmlBlocks && textBlocks && textBlocks.length > htmlBlocks.length) {
        const htmlTypeMap = new Map<string, BlockData['type']>();
        for (const hb of htmlBlocks) {
          if (hb.type !== 'text') htmlTypeMap.set(stripHtml(hb.content).trim(), hb.type);
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
    let replaceEmpty = false;

    if (selectedIds.size > 0) {
      const lastSelectedIndex = blocks.reduce((max, b, i) =>
        selectedIds.has(b.id) ? i : max, -1
      );
      insertIndex = lastSelectedIndex === -1 ? blocks.length : lastSelectedIndex + 1;
    } else if (document.activeElement?.id.startsWith('editable-')) {
      const activeId = document.activeElement.id.replace('editable-', '');
      const activeIndex = blocks.findIndex(b => b.id === activeId);
      if (activeIndex !== -1) {
        const activeBlock = blocks[activeIndex];
        if (activeBlock.type === 'text' && isContentEmpty(activeBlock.content)) {
          replaceEmpty = true;
          insertIndex = activeIndex;
        } else {
          insertIndex = activeIndex + 1;
        }
      }
    }

    // --- Build final blocks ---
    let finalBlocks: BlockData[];

    if (replaceEmpty) {
      finalBlocks = [...blocks];
      finalBlocks.splice(insertIndex, 1, ...processedBlocks);
    } else {
      finalBlocks = [...blocks];
      finalBlocks.splice(insertIndex, 0, ...processedBlocks);
    }

    // Blur active element but prevent its onBlur/onInput from saving to history
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl?.isContentEditable) {
      const blockInput = (ev: Event) => { ev.stopImmediatePropagation(); };
      activeEl.addEventListener('blur', blockInput, { capture: true, once: true });
      activeEl.blur();
    }

    setBlocks(finalBlocks);
    setSelectedIds(new Set(processedBlocks.map(b => b.id)));
  }, [blocks, setBlocks, selectedIds, setSelectedIds]);

  return { handleCopy, handlePaste };
};
