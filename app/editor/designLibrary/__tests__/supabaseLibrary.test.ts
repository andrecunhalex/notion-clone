// ---------------------------------------------------------------------------
// supabaseLibrary integration tests
// ---------------------------------------------------------------------------
// We mock `getSupabaseClient` with a thin in-memory implementation that
// supports the methods supabaseLibrary actually uses: from().select/insert/
// update/delete with .eq/.single/.then chaining, plus channel().on/subscribe/
// unsubscribe with manual fire-realtime helper.
//
// This lets us drive the library through realistic CRUD + realtime flows
// — including the "undo race" scenario that needed a guard fix.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted runs before vi.mock so we can keep mock state in a closure
// that's also accessible from the tests below.
const mocks = vi.hoisted(() => {
  interface Table {
    rows: Record<string, unknown>[];
  }
  const tables: Record<string, Table> = {
    design_block_templates: { rows: [] },
    design_clauses: { rows: [] },
  };

  interface ChannelHandler {
    table: string;
    callback: (payload: Record<string, unknown>) => void;
  }
  const channelHandlers: ChannelHandler[] = [];
  const unsubscribed = { value: false };
  let cachedClient: ReturnType<typeof makeClient> | null = null;

  const reset = () => {
    tables.design_block_templates.rows = [];
    tables.design_clauses.rows = [];
    channelHandlers.length = 0;
    unsubscribed.value = false;
    cachedClient = null;
  };

  const fireRealtime = (table: string, payload: Record<string, unknown>) => {
    for (const h of channelHandlers) {
      if (h.table === table) h.callback(payload);
    }
  };

  // ----- Query builder mock -----
  // Supports the chaining shapes used by supabaseLibrary:
  //   .select('*').eq(col, val)              → awaited directly
  //   .insert(row).select().single()         → .single() returns the result
  //   .update(updates).eq().select().single()
  //   .delete().eq()                          → awaited directly
  const createQueryBuilder = (tableName: string) => {
    const filters: Array<{ col: string; val: unknown }> = [];
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let pendingRow: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    const exec = () => {
      const table = tables[tableName];
      if (!table) return { data: null, error: { message: 'unknown table' } };
      const matches = (row: Record<string, unknown>) =>
        filters.every(f => row[f.col] === f.val);

      switch (action) {
        case 'select':
          return { data: table.rows.filter(matches), error: null };
        case 'insert': {
          if (!pendingRow) return { data: null, error: { message: 'no row' } };
          if (pendingRow.id != null && table.rows.some(r => r.id === pendingRow!.id)) {
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          }
          const inserted = { ...pendingRow };
          table.rows.push(inserted);
          return { data: inserted, error: null };
        }
        case 'update': {
          const idx = table.rows.findIndex(matches);
          if (idx < 0) return { data: null, error: { message: 'not found' } };
          table.rows[idx] = { ...table.rows[idx], ...(pendingUpdate ?? {}) };
          return { data: table.rows[idx], error: null };
        }
        case 'delete': {
          tables[tableName].rows = table.rows.filter(r => !matches(r));
          return { data: null, error: null };
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push({ col, val });
        return builder;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert: (row: any) => {
        action = 'insert';
        pendingRow = row;
        return builder;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (updates: any) => {
        action = 'update';
        pendingUpdate = updates;
        return builder;
      },
      delete: () => {
        action = 'delete';
        return builder;
      },
      single: async () => exec(),
      // Thenable so `await builder` works for select / delete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any, reject?: any) => {
        try {
          return Promise.resolve(exec()).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return builder;
  };

  const createMockChannel = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel: any = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on(_event: string, opts: any, callback: any) {
        channelHandlers.push({ table: opts.table, callback });
        return channel;
      },
      subscribe() { return channel; },
      unsubscribe() { unsubscribed.value = true; },
    };
    return channel;
  };

  function makeClient() {
    return {
      from: (tableName: string) => createQueryBuilder(tableName),
      channel: () => createMockChannel(),
    };
  }

  const createMockClient = () => {
    if (!cachedClient) cachedClient = makeClient();
    return cachedClient;
  };

  return { tables, reset, fireRealtime, unsubscribed, createMockClient };
});

vi.mock('../../collaboration/supabase-client', () => ({
  getSupabaseClient: () => mocks.createMockClient(),
}));

// IMPORT AFTER vi.mock so the library uses the mocked client
import { createSupabaseLibrary } from '../supabaseLibrary';
import type { DesignLibraryInterface } from '../types';

const CONFIG = {
  supabaseUrl: 'http://test.local',
  supabaseAnonKey: 'anon',
  workspaceId: 'w1',
  documentId: 'd1',
  userId: 'u1',
};

/** Wait for queued promises to resolve (bootstrap fetch + commit). */
const flush = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

describe('supabaseLibrary', () => {
  let lib: DesignLibraryInterface;

  beforeEach(async () => {
    mocks.reset();
    lib = createSupabaseLibrary(CONFIG);
    await flush();
  });

  // -------------------------------------------------------------------
  // bootstrap
  // -------------------------------------------------------------------

  describe('bootstrap', () => {
    it('starts not bootstrapped, becomes bootstrapped after fetch', async () => {
      mocks.reset();
      const fresh = createSupabaseLibrary(CONFIG);
      expect(fresh.getSnapshot().bootstrapped).toBe(false);
      await flush();
      expect(fresh.getSnapshot().bootstrapped).toBe(true);
    });

    it('only loads rows from the configured workspace', async () => {
      mocks.reset();
      mocks.tables.design_block_templates.rows = [
        { id: 't1', workspace_id: 'w1', document_id: 'd1', name: 'mine', html: '<div>m</div>', defaults: {}, autonumber: null },
        { id: 't2', workspace_id: 'w2', document_id: 'd1', name: 'other', html: '<div>o</div>', defaults: {}, autonumber: null },
      ];
      const fresh = createSupabaseLibrary(CONFIG);
      await flush();
      expect(fresh.getSnapshot().templates).toHaveLength(1);
      expect(fresh.getSnapshot().templates[0].name).toBe('mine');
    });

    it('loads both templates and clauses on bootstrap', async () => {
      mocks.reset();
      mocks.tables.design_block_templates.rows = [
        { id: 't1', workspace_id: 'w1', document_id: 'd1', name: 't', html: '<div></div>', defaults: {}, autonumber: null },
      ];
      mocks.tables.design_clauses.rows = [
        { id: 'c1', workspace_id: 'w1', document_id: 'd1', name: 'c', items: [] },
      ];
      const fresh = createSupabaseLibrary(CONFIG);
      await flush();
      expect(fresh.getSnapshot().templates).toHaveLength(1);
      expect(fresh.getSnapshot().clauses).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  // CRUD + sanitization
  // -------------------------------------------------------------------

  describe('createTemplate', () => {
    it('inserts the row and updates the snapshot optimistically', async () => {
      const tpl = await lib.createTemplate({
        name: 'A',
        html: '<div>hi</div>',
        defaults: { body: 'x' },
      });
      expect(tpl.id).toBeTruthy();
      expect(lib.getSnapshot().templates).toHaveLength(1);
      expect(lib.getSnapshot().templates[0].id).toBe(tpl.id);
      expect(mocks.tables.design_block_templates.rows).toHaveLength(1);
    });

    it('sanitizes HTML before sending to Supabase', async () => {
      await lib.createTemplate({
        name: 'evil',
        html: '<div>safe<script>alert(1)</script></div>',
        defaults: {},
      });
      const row = mocks.tables.design_block_templates.rows[0] as { html: string };
      expect(row.html).not.toContain('<script');
      expect(row.html).toContain('safe');
    });

    it('uses the provided id when restoring (undo flow)', async () => {
      const tpl = await lib.createTemplate({
        id: 'fixed-id',
        name: 'A',
        html: '<div></div>',
        defaults: {},
      });
      expect(tpl.id).toBe('fixed-id');
      expect((mocks.tables.design_block_templates.rows[0] as { id: string }).id).toBe('fixed-id');
    });
  });

  describe('updateTemplate', () => {
    it('patches the row and updates the snapshot', async () => {
      const tpl = await lib.createTemplate({ name: 'A', html: '<div></div>', defaults: {} });
      const updated = await lib.updateTemplate(tpl.id, { name: 'B' });
      expect(updated.name).toBe('B');
      expect(lib.getTemplate(tpl.id)?.name).toBe('B');
    });

    it('sanitizes HTML on update', async () => {
      const tpl = await lib.createTemplate({ name: 'A', html: '<div>a</div>', defaults: {} });
      await lib.updateTemplate(tpl.id, {
        html: '<div>x<script>bad()</script></div>',
      });
      const row = mocks.tables.design_block_templates.rows[0] as { html: string };
      expect(row.html).not.toContain('<script');
    });
  });

  describe('deleteTemplate', () => {
    it('removes the row and updates the snapshot', async () => {
      const tpl = await lib.createTemplate({ name: 'A', html: '<div></div>', defaults: {} });
      await lib.deleteTemplate(tpl.id);
      expect(lib.getSnapshot().templates).toHaveLength(0);
      expect(mocks.tables.design_block_templates.rows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // Realtime — events from other clients
  // -------------------------------------------------------------------

  describe('realtime', () => {
    it('applies INSERT events from another client', () => {
      mocks.fireRealtime('design_block_templates', {
        eventType: 'INSERT',
        new: { id: 'remote', workspace_id: 'w1', document_id: 'dx', name: 'remote', html: '<div></div>', defaults: {}, autonumber: null },
      });
      expect(lib.getSnapshot().templates).toHaveLength(1);
      expect(lib.getSnapshot().templates[0].id).toBe('remote');
    });

    it('applies UPDATE events from another client', () => {
      mocks.fireRealtime('design_block_templates', {
        eventType: 'INSERT',
        new: { id: 'r1', workspace_id: 'w1', document_id: 'dx', name: 'old name', html: '<div></div>', defaults: {}, autonumber: null },
      });
      mocks.fireRealtime('design_block_templates', {
        eventType: 'UPDATE',
        new: { id: 'r1', workspace_id: 'w1', document_id: 'dx', name: 'new name', html: '<div></div>', defaults: {}, autonumber: null },
      });
      expect(lib.getSnapshot().templates[0].name).toBe('new name');
    });

    it('applies DELETE events from another client', () => {
      mocks.fireRealtime('design_block_templates', {
        eventType: 'INSERT',
        new: { id: 'r1', workspace_id: 'w1', document_id: 'dx', name: 'r', html: '<div></div>', defaults: {}, autonumber: null },
      });
      expect(lib.getSnapshot().templates).toHaveLength(1);

      mocks.fireRealtime('design_block_templates', {
        eventType: 'DELETE',
        old: { id: 'r1' },
      });
      expect(lib.getSnapshot().templates).toHaveLength(0);
    });

    it('applies clause events on the clauses channel', () => {
      mocks.fireRealtime('design_clauses', {
        eventType: 'INSERT',
        new: { id: 'c1', workspace_id: 'w1', document_id: 'dx', name: 'remote clause', items: [] },
      });
      expect(lib.getSnapshot().clauses).toHaveLength(1);
      expect(lib.getSnapshot().clauses[0].name).toBe('remote clause');
    });
  });

  // -------------------------------------------------------------------
  // Late-realtime DELETE guard — the undo race fix
  // -------------------------------------------------------------------

  describe('late-realtime DELETE guard (undo race)', () => {
    it('preserves a restored template when the original DELETE event arrives late', async () => {
      // Step 1: user creates a template
      const tpl = await lib.createTemplate({
        name: 'X',
        html: '<div>x</div>',
        defaults: {},
      });
      expect(lib.getSnapshot().templates).toHaveLength(1);

      // Step 2: user deletes it (REST + optimistic local removal)
      await lib.deleteTemplate(tpl.id);
      expect(lib.getSnapshot().templates).toHaveLength(0);

      // Step 3: user clicks Undo — re-create with same id
      await lib.createTemplate({
        id: tpl.id,
        name: 'X',
        html: '<div>x</div>',
        defaults: {},
      });
      expect(lib.getSnapshot().templates).toHaveLength(1);

      // Step 4: the realtime DELETE event for the original delete arrives
      // LATE — without the recently-touched guard this would clobber the
      // restored row.
      mocks.fireRealtime('design_block_templates', {
        eventType: 'DELETE',
        old: { id: tpl.id },
      });

      // Restored template should still be present
      expect(lib.getSnapshot().templates).toHaveLength(1);
      expect(lib.getSnapshot().templates[0].id).toBe(tpl.id);
    });

    it('preserves a restored clause when the original DELETE event arrives late', async () => {
      const clause = await lib.createClause({ name: 'X', items: [] });
      await lib.deleteClause(clause.id);
      expect(lib.getSnapshot().clauses).toHaveLength(0);

      await lib.createClause({ id: clause.id, name: 'X', items: [] });
      expect(lib.getSnapshot().clauses).toHaveLength(1);

      mocks.fireRealtime('design_clauses', {
        eventType: 'DELETE',
        old: { id: clause.id },
      });

      expect(lib.getSnapshot().clauses).toHaveLength(1);
    });

    it('does NOT block legitimate DELETEs from other clients (untouched id)', () => {
      mocks.fireRealtime('design_block_templates', {
        eventType: 'INSERT',
        new: { id: 'untouched', workspace_id: 'w1', document_id: 'dx', name: 'r', html: '<div></div>', defaults: {}, autonumber: null },
      });
      expect(lib.getSnapshot().templates).toHaveLength(1);

      // Another client deletes — we never touched this id locally, so the
      // guard doesn't apply and the delete goes through.
      mocks.fireRealtime('design_block_templates', {
        eventType: 'DELETE',
        old: { id: 'untouched' },
      });
      expect(lib.getSnapshot().templates).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  describe('subscribe / dispose', () => {
    it('notifies subscribers on every commit', async () => {
      const listener = vi.fn();
      lib.subscribe(listener);
      await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
      expect(listener).toHaveBeenCalled();
    });

    it('detaches subscribers when unsubscribed', async () => {
      const listener = vi.fn();
      const unsub = lib.subscribe(listener);
      unsub();
      await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
      expect(listener).not.toHaveBeenCalled();
    });

    it('dispose() unsubscribes the realtime channel', () => {
      expect(mocks.unsubscribed.value).toBe(false);
      lib.dispose();
      expect(mocks.unsubscribed.value).toBe(true);
    });

    it('dispose() is idempotent', () => {
      lib.dispose();
      expect(() => lib.dispose()).not.toThrow();
    });

    it('dispose() detaches local listeners', async () => {
      const listener = vi.fn();
      lib.subscribe(listener);
      lib.dispose();
      // Future events won't reach listener (snapshot won't change either,
      // since dispose drops the channel — but verify listener isn't called)
      mocks.fireRealtime('design_block_templates', {
        eventType: 'INSERT',
        new: { id: 'after', workspace_id: 'w1', document_id: 'dx', name: 'a', html: '<div></div>', defaults: {}, autonumber: null },
      });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
