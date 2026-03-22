import { describe, it, expect } from 'vitest';
import {
  isContentEmpty,
  isListType,
  getBulletChar,
  getListNumber,
  createEmptyBlock,
  createDefaultTableData,
  getPaginatedBlocks,
  PAGE_CONTENT_HEIGHT,
} from '../utils';
import { BlockData } from '../types';

// ---------------------------------------------------------------------------
// isContentEmpty
// ---------------------------------------------------------------------------
describe('isContentEmpty', () => {
  it('returns true for empty string', () => {
    expect(isContentEmpty('')).toBe(true);
  });

  it('returns true for null/undefined-ish', () => {
    expect(isContentEmpty(undefined as unknown as string)).toBe(true);
  });

  it('returns true for whitespace-only HTML', () => {
    expect(isContentEmpty('<br>')).toBe(true);
    expect(isContentEmpty('<span>  </span>')).toBe(true);
    expect(isContentEmpty('<b></b>')).toBe(true);
  });

  it('returns false for text content', () => {
    expect(isContentEmpty('hello')).toBe(false);
    expect(isContentEmpty('<b>bold</b>')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isListType
// ---------------------------------------------------------------------------
describe('isListType', () => {
  it('identifies list types', () => {
    expect(isListType('bullet_list')).toBe(true);
    expect(isListType('numbered_list')).toBe(true);
  });

  it('rejects non-list types', () => {
    expect(isListType('text')).toBe(false);
    expect(isListType('h1')).toBe(false);
    expect(isListType('table')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBulletChar
// ---------------------------------------------------------------------------
describe('getBulletChar', () => {
  it('returns different chars for different indent levels', () => {
    expect(getBulletChar(0)).toBe('•');
    expect(getBulletChar(1)).toBe('◦');
    expect(getBulletChar(2)).toBe('▪');
  });

  it('clamps at max level', () => {
    expect(getBulletChar(10)).toBe('▪');
  });
});

// ---------------------------------------------------------------------------
// getListNumber
// ---------------------------------------------------------------------------
describe('getListNumber', () => {
  const blocks: BlockData[] = [
    { id: '1', type: 'numbered_list', content: 'first' },
    { id: '2', type: 'numbered_list', content: 'second' },
    { id: '3', type: 'numbered_list', content: 'third' },
  ];

  it('counts sequential numbered list items', () => {
    expect(getListNumber(blocks[0], blocks, 0)).toBe(1);
    expect(getListNumber(blocks[1], blocks, 1)).toBe(2);
    expect(getListNumber(blocks[2], blocks, 2)).toBe(3);
  });

  it('resets count after non-list block', () => {
    const mixed: BlockData[] = [
      { id: '1', type: 'numbered_list', content: 'a' },
      { id: '2', type: 'text', content: 'break' },
      { id: '3', type: 'numbered_list', content: 'b' },
    ];
    expect(getListNumber(mixed[2], mixed, 2)).toBe(1);
  });

  it('handles nested indentation', () => {
    const nested: BlockData[] = [
      { id: '1', type: 'numbered_list', content: 'top', indent: 0 },
      { id: '2', type: 'numbered_list', content: 'nested', indent: 1 },
      { id: '3', type: 'numbered_list', content: 'nested 2', indent: 1 },
      { id: '4', type: 'numbered_list', content: 'top 2', indent: 0 },
    ];
    expect(getListNumber(nested[2], nested, 2)).toBe(2);
    expect(getListNumber(nested[3], nested, 3)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createEmptyBlock
// ---------------------------------------------------------------------------
describe('createEmptyBlock', () => {
  it('creates a text block with unique id', () => {
    const a = createEmptyBlock();
    const b = createEmptyBlock();
    expect(a.type).toBe('text');
    expect(a.content).toBe('');
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// createDefaultTableData
// ---------------------------------------------------------------------------
describe('createDefaultTableData', () => {
  it('creates a 3x3 table', () => {
    const table = createDefaultTableData();
    expect(table.rows.length).toBe(3);
    expect(table.rows[0].length).toBe(3);
    expect(table.columnWidths.length).toBe(3);
    expect(table.hasHeaderRow).toBe(false);
  });

  it('column widths sum to ~100%', () => {
    const table = createDefaultTableData();
    const sum = table.columnWidths.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });
});

// ---------------------------------------------------------------------------
// getPaginatedBlocks
// ---------------------------------------------------------------------------
describe('getPaginatedBlocks', () => {
  const makeBlock = (id: string): BlockData => ({ id, type: 'text', content: `block ${id}` });

  it('returns single page in continuous mode', () => {
    const blocks = [makeBlock('1'), makeBlock('2')];
    const pages = getPaginatedBlocks(blocks, {}, 'continuous');
    expect(pages).toEqual([blocks]);
  });

  it('splits blocks across pages based on heights', () => {
    const blocks = [makeBlock('1'), makeBlock('2'), makeBlock('3')];
    const heights = { '1': 500, '2': 500, '3': 200 };
    const pages = getPaginatedBlocks(blocks, heights, 'paginated');
    expect(pages.length).toBe(2);
    expect(pages[0].length).toBe(1); // block 1 fills first page (500)
    expect(pages[1].length).toBe(2); // blocks 2+3 fit on second (700)
  });

  it('puts oversized block on its own page', () => {
    const blocks = [makeBlock('1'), makeBlock('big'), makeBlock('3')];
    const heights = { '1': 100, 'big': 1200, '3': 100 };
    const pages = getPaginatedBlocks(blocks, heights, 'paginated');
    expect(pages.length).toBe(3);
    expect(pages[1]).toEqual([blocks[1]]);
  });

  it('uses default height (24) when not measured', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => makeBlock(String(i)));
    const pages = getPaginatedBlocks(blocks, {}, 'paginated');
    // 50 blocks * 24px = 1200px, PAGE_CONTENT_HEIGHT = 950 → 2 pages
    expect(pages.length).toBe(2);
  });

  it('respects custom pageContentHeight', () => {
    const blocks = [makeBlock('1'), makeBlock('2')];
    const heights = { '1': 60, '2': 60 };
    const pages = getPaginatedBlocks(blocks, heights, 'paginated', 100);
    expect(pages.length).toBe(2); // 60 + 60 > 100
  });
});
