import * as Y from 'yjs';
import { BlockData } from '../types';
import { generateId } from '../utils';

// ---------------------------------------------------------------------------
// Y.Doc ↔ BlockData[] conversion
// ---------------------------------------------------------------------------

/** Convert a Y.Map to a BlockData object */
function yMapToBlock(yMap: Y.Map<unknown>): BlockData {
  const block: BlockData = {
    id: (yMap.get('id') as string) || generateId(),
    type: (yMap.get('type') as BlockData['type']) || 'text',
    content: (yMap.get('content') as string) || '',
  };

  const indent = yMap.get('indent') as number | undefined;
  if (indent !== undefined) block.indent = indent;

  const align = yMap.get('align') as BlockData['align'] | undefined;
  if (align) block.align = align;

  const tableData = yMap.get('tableData') as BlockData['tableData'] | undefined;
  if (tableData) block.tableData = tableData;

  const imageData = yMap.get('imageData') as BlockData['imageData'] | undefined;
  if (imageData) block.imageData = imageData;

  return block;
}

/** Convert a BlockData object to updates on a Y.Map */
function blockToYMap(block: BlockData, yMap: Y.Map<unknown>) {
  yMap.set('id', block.id);
  yMap.set('type', block.type);
  yMap.set('content', block.content);

  if (block.indent !== undefined) yMap.set('indent', block.indent);
  else yMap.delete('indent');

  if (block.align) yMap.set('align', block.align);
  else yMap.delete('align');

  if (block.tableData) yMap.set('tableData', block.tableData);
  else yMap.delete('tableData');

  if (block.imageData) yMap.set('imageData', block.imageData);
  else yMap.delete('imageData');
}

// ---------------------------------------------------------------------------
// YjsDocSync — bridges Y.Doc ↔ BlockData[]
// ---------------------------------------------------------------------------

export class YjsDocSync {
  readonly doc: Y.Doc;
  private readonly yBlocks: Y.Array<Y.Map<unknown>>;
  private _onChange: ((blocks: BlockData[]) => void) | null = null;
  private _suppressRemote = false;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.yBlocks = doc.getArray<Y.Map<unknown>>('blocks');
  }

  /** Read the current blocks from the Y.Doc (deduplicates by ID) */
  getBlocks(): BlockData[] {
    const seen = new Set<string>();
    const blocks: BlockData[] = [];
    for (const yMap of this.yBlocks.toArray()) {
      const block = yMapToBlock(yMap);
      if (!seen.has(block.id)) {
        seen.add(block.id);
        blocks.push(block);
      }
    }
    return blocks;
  }

  /** Set blocks from React state → Y.Doc (local edit) */
  setBlocks(blocks: BlockData[]) {
    this._suppressRemote = true;
    this.doc.transact(() => {
      this._applyDiff(blocks);
    }, 'local');
    this._suppressRemote = false;
  }

  /** Initialize the doc with blocks if it's empty */
  initIfEmpty(blocks: BlockData[]) {
    if (this.yBlocks.length === 0) {
      this.doc.transact(() => {
        for (const block of blocks) {
          const yMap = new Y.Map<unknown>();
          blockToYMap(block, yMap);
          this.yBlocks.push([yMap]);
        }
      }, 'init');
    }
  }

  /** Listen for remote changes (from other peers / indexeddb / supabase-load) */
  onRemoteChange(callback: (blocks: BlockData[]) => void) {
    this._onChange = callback;

    const observer = (_events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      // Suppress all notifications while a local setBlocks() is in progress
      if (this._suppressRemote) return;
      // Only notify for changes NOT originated from our local edits
      if (transaction.origin === 'local' || transaction.origin === 'init') return;
      callback(this.getBlocks());
    };

    this.yBlocks.observeDeep(observer);
    return () => this.yBlocks.unobserveDeep(observer);
  }

  /** Sync React blocks → Y.Doc. Two paths: fast (content-only) or full rebuild (structure change) */
  private _applyDiff(inputBlocks: BlockData[]) {
    const yArr = this.yBlocks;

    // Deduplicate input blocks by ID (keep first occurrence)
    const seen = new Set<string>();
    const newBlocks = inputBlocks.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    // Check if structure (IDs / order) changed
    const currentIds: string[] = [];
    for (let i = 0; i < yArr.length; i++) {
      currentIds.push(yArr.get(i).get('id') as string);
    }
    const newIds = newBlocks.map(b => b.id);

    const structureChanged =
      currentIds.length !== newIds.length ||
      currentIds.some((id, i) => id !== newIds[i]);

    if (!structureChanged) {
      // Fast path: only content changed — update Y.Maps in place (minimal Yjs ops)
      for (let i = 0; i < newBlocks.length; i++) {
        this._updateYMap(yArr.get(i), newBlocks[i]);
      }
    } else {
      // Structure changed (add/remove/reorder) — rebuild the array
      // This is safe and correct: Yjs diff engine handles the rest efficiently
      if (yArr.length > 0) yArr.delete(0, yArr.length);
      for (const block of newBlocks) {
        const yMap = new Y.Map<unknown>();
        blockToYMap(block, yMap);
        yArr.push([yMap]);
      }
    }
  }

  private _updateYMap(yMap: Y.Map<unknown>, block: BlockData) {
    // Only set changed fields to minimize Yjs updates
    if (yMap.get('type') !== block.type) yMap.set('type', block.type);
    if (yMap.get('content') !== block.content) yMap.set('content', block.content);

    const curIndent = yMap.get('indent') as number | undefined;
    if (block.indent !== undefined) {
      if (curIndent !== block.indent) yMap.set('indent', block.indent);
    } else if (curIndent !== undefined) {
      yMap.delete('indent');
    }

    const curAlign = yMap.get('align') as string | undefined;
    if (block.align) {
      if (curAlign !== block.align) yMap.set('align', block.align);
    } else if (curAlign) {
      yMap.delete('align');
    }

    // For complex objects, use JSON comparison
    if (block.tableData) {
      if (JSON.stringify(yMap.get('tableData')) !== JSON.stringify(block.tableData)) {
        yMap.set('tableData', block.tableData);
      }
    } else if (yMap.get('tableData')) {
      yMap.delete('tableData');
    }

    if (block.imageData) {
      if (JSON.stringify(yMap.get('imageData')) !== JSON.stringify(block.imageData)) {
        yMap.set('imageData', block.imageData);
      }
    } else if (yMap.get('imageData')) {
      yMap.delete('imageData');
    }
  }
}
