import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlockManager } from '../hooks/useBlockManager';
import { BlockData } from '../types';

function setup(initialBlocks?: BlockData[]) {
  const blocks = initialBlocks || [
    { id: 'a', type: 'text' as const, content: 'Alpha' },
    { id: 'b', type: 'text' as const, content: 'Beta' },
    { id: 'c', type: 'text' as const, content: 'Charlie' },
  ];
  let current = blocks;
  const setBlocks = vi.fn((newBlocks: BlockData[]) => {
    current = newBlocks;
    // Simulate React re-render by updating the ref
    rerender();
  });

  const { result, rerender: rrFn } = renderHook(() =>
    useBlockManager({ blocks: current, setBlocks })
  );

  const rerender = () => rrFn();

  return { result, getBlocks: () => current, setBlocks };
}

describe('useBlockManager', () => {
  describe('updateBlock', () => {
    it('updates content of a specific block', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.updateBlock('b', { content: 'Updated' }));
      expect(getBlocks().find(b => b.id === 'b')!.content).toBe('Updated');
    });

    it('updates type without affecting other blocks', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.updateBlock('a', { type: 'h1' }));
      const blocks = getBlocks();
      expect(blocks[0].type).toBe('h1');
      expect(blocks[1].type).toBe('text');
    });
  });

  describe('addBlock', () => {
    it('inserts a new block after the given id', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.addBlock('a'));
      const blocks = getBlocks();
      expect(blocks.length).toBe(4);
      expect(blocks[0].id).toBe('a');
      expect(blocks[1].type).toBe('text');
      expect(blocks[1].content).toBe('');
      expect(blocks[2].id).toBe('b');
    });
  });

  describe('addBlockBefore', () => {
    it('inserts a new block before the given id', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.addBlockBefore('b'));
      const blocks = getBlocks();
      expect(blocks.length).toBe(4);
      expect(blocks[0].id).toBe('a');
      expect(blocks[1].type).toBe('text');
      expect(blocks[1].content).toBe('');
      expect(blocks[2].id).toBe('b');
    });
  });

  describe('addBlockWithContent', () => {
    it('inserts a block with specified content', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.addBlockWithContent('a', 'New content'));
      const blocks = getBlocks();
      expect(blocks[1].content).toBe('New content');
    });
  });

  describe('removeBlock', () => {
    it('removes a block by id', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.removeBlock('b'));
      const blocks = getBlocks();
      expect(blocks.length).toBe(2);
      expect(blocks.find(b => b.id === 'b')).toBeUndefined();
    });

    it('does not remove the last block', () => {
      const { result, getBlocks } = setup([
        { id: 'only', type: 'text', content: '' },
      ]);
      act(() => result.current.removeBlock('only'));
      expect(getBlocks().length).toBe(1);
    });
  });

  describe('deleteSelectedBlocks', () => {
    it('removes all selected blocks', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.deleteSelectedBlocks(new Set(['a', 'c'])));
      const blocks = getBlocks();
      expect(blocks.length).toBe(1);
      expect(blocks[0].id).toBe('b');
    });

    it('creates empty block when all are deleted', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.deleteSelectedBlocks(new Set(['a', 'b', 'c'])));
      const blocks = getBlocks();
      expect(blocks.length).toBe(1);
      expect(blocks[0].content).toBe('');
    });

    it('does nothing for empty selection', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.deleteSelectedBlocks(new Set()));
      expect(getBlocks().length).toBe(3);
    });
  });

  describe('addListBlock', () => {
    it('adds a list block with correct type and indent', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.addListBlock('a', 'bullet_list', 2));
      const blocks = getBlocks();
      expect(blocks[1].type).toBe('bullet_list');
      expect(blocks[1].indent).toBe(2);
    });
  });

  describe('moveBlocks', () => {
    it('moves blocks to bottom of target', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.moveBlocks(['a'], 'c', 'bottom'));
      const blocks = getBlocks();
      expect(blocks.map(b => b.id)).toEqual(['b', 'c', 'a']);
    });

    it('moves blocks to top of target', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.moveBlocks(['c'], 'a', 'top'));
      const blocks = getBlocks();
      expect(blocks.map(b => b.id)).toEqual(['c', 'a', 'b']);
    });

    it('moves multiple blocks together preserving order', () => {
      const { result, getBlocks } = setup();
      act(() => result.current.moveBlocks(['a', 'b'], 'c', 'bottom'));
      const blocks = getBlocks();
      expect(blocks.map(b => b.id)).toEqual(['c', 'a', 'b']);
    });
  });
});
