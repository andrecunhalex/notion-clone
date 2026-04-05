'use client';

import React, { memo, useMemo } from 'react';
import { BlockData } from '../types';
import { isListType, getBulletChar } from '../utils';
import { getTemplate } from './designBlocks';

// ---------------------------------------------------------------------------
// Styles — same as Block.tsx for visual consistency
// ---------------------------------------------------------------------------

const BLOCK_STYLES: Record<string, string> = {
  h1: 'font-bold my-0 p-0 text-gray-900',
  h2: 'font-semibold my-0 p-0 text-gray-800',
  h3: 'font-semibold my-0 p-0 text-gray-800',
  text: 'my-0 text-gray-700',
  bullet_list: 'my-0 text-gray-700',
  numbered_list: 'my-0 text-gray-700',
};

const BLOCK_INLINE_STYLES: Record<string, React.CSSProperties> = {
  h1: { fontSize: '1.875em', lineHeight: 1.3 },
  h2: { fontSize: '1.5em', lineHeight: 1.3 },
  h3: { fontSize: '1.25em', lineHeight: 1.3 },
  text: { lineHeight: 1.5 },
  bullet_list: { lineHeight: 1.5 },
  numbered_list: { lineHeight: 1.5 },
};

// ---------------------------------------------------------------------------
// Design block HTML builder
// ---------------------------------------------------------------------------

function buildDesignBlockHtml(
  templateId: string,
  values: Record<string, string>,
  autoNumber?: string,
): string {
  const tpl = getTemplate(templateId);
  if (!tpl) return '';

  const div = document.createElement('div');
  div.innerHTML = tpl.html;

  div.querySelectorAll('[data-editable]').forEach(el => {
    const key = el.getAttribute('data-editable')!;
    el.innerHTML = values[key] ?? tpl.defaults[key] ?? '';
    el.removeAttribute('contenteditable');
  });

  div.querySelectorAll('[data-swappable]').forEach(el => {
    const key = el.getAttribute('data-swappable')!;
    const src = values[key] || tpl.defaults[key] || '';
    if (src) (el as HTMLImageElement).src = src;
  });

  if (autoNumber) {
    div.querySelectorAll('[data-autonumber]').forEach(el => {
      el.textContent = autoNumber;
    });
  }

  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReadOnlyBlockProps {
  block: BlockData;
  listNumber: number;
  autoNumber?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ReadOnlyBlockInner: React.FC<ReadOnlyBlockProps> = ({ block, listNumber, autoNumber }) => {
  const isList = isListType(block.type);
  const indent = block.indent ?? 0;
  const contentStyle = BLOCK_INLINE_STYLES[block.type];
  const alignStyle = block.align
    ? { ...contentStyle, textAlign: block.align as React.CSSProperties['textAlign'] }
    : contentStyle;

  // Divider
  if (block.type === 'divider') {
    return (
      <div className="py-2">
        <hr className="border-t border-gray-300" />
      </div>
    );
  }

  // Image
  if (block.type === 'image' && block.imageData) {
    const { src, width, alignment, caption } = block.imageData;
    const justify = alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start';
    return (
      <div className="py-1" style={{ display: 'flex', justifyContent: justify }}>
        <div style={{ width: `${width}%` }}>
          {src && <img src={src} alt={caption || ''} className="w-full rounded" />}
          {caption && <p className="text-xs text-gray-400 text-center mt-1">{caption}</p>}
        </div>
      </div>
    );
  }

  // Table
  if (block.type === 'table' && block.tableData) {
    const { rows, columnWidths, hasHeaderRow } = block.tableData;
    return (
      <div className="my-1 overflow-x-auto">
        <table className="w-full border-collapse border border-gray-200" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {columnWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <tbody>
            {rows.map((row, ri) => {
              const isHeader = hasHeaderRow && ri === 0;
              return (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`border border-gray-200 ${isHeader ? 'font-medium' : ''}`}
                      style={{
                        backgroundColor: cell.bgColor || (isHeader ? '#F9FAFB' : 'white'),
                        color: cell.textColor || '#374151',
                      }}
                    >
                      <div
                        className="px-2 py-1.5 min-h-7"
                        dangerouslySetInnerHTML={{ __html: cell.content }}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Design block
  if (block.type === 'design_block' && block.designBlockData) {
    return (
      <DesignBlockReadOnly block={block} autoNumber={autoNumber} />
    );
  }

  // Text / Headings / Lists
  const listMarker = isList ? (
    block.type === 'bullet_list' ? (
      <span
        className="select-none text-gray-400 shrink-0 inline-flex items-center justify-center"
        style={{ width: 24 + indent * 24, paddingLeft: indent * 24 }}
      >
        {getBulletChar(indent)}
      </span>
    ) : (
      <span
        className="select-none text-gray-400 shrink-0 inline-flex items-center justify-end pr-1"
        style={{ minWidth: 24 + indent * 24, paddingLeft: indent * 24 }}
      >
        {listNumber}.
      </span>
    )
  ) : null;

  return (
    <div className="flex items-start py-px my-px">
      {listMarker}
      <div className="flex-1 min-w-0 py-0.5 px-1">
        <div
          className={`${BLOCK_STYLES[block.type] || ''} min-h-[1.5em]`}
          style={alignStyle}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      </div>
    </div>
  );
};

// Design block read-only renderer
const DesignBlockReadOnly: React.FC<{
  block: BlockData;
  autoNumber?: string;
}> = ({ block, autoNumber }) => {
  const html = useMemo(() => {
    if (typeof document === 'undefined') return '';
    return buildDesignBlockHtml(
      block.designBlockData!.templateId,
      block.designBlockData!.values,
      autoNumber,
    );
  }, [block.designBlockData, autoNumber]);

  return (
    <div className="my-1" dangerouslySetInnerHTML={{ __html: html }} />
  );
};

export const ReadOnlyBlock = memo(ReadOnlyBlockInner);
