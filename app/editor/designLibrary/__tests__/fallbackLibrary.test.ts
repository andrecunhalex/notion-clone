import { describe, it, expect, beforeEach } from 'vitest';
import { createFallbackLibrary } from '../fallbackLibrary';
import type { DesignLibraryInterface } from '../types';

describe('fallbackLibrary', () => {
  let lib: DesignLibraryInterface;

  beforeEach(() => {
    lib = createFallbackLibrary('doc-1');
  });

  it('starts empty and bootstrapped', () => {
    const snap = lib.getSnapshot();
    expect(snap.templates).toEqual([]);
    expect(snap.clauses).toEqual([]);
    expect(snap.bootstrapped).toBe(true);
  });

  // -------- templates --------------------------------------------------

  it('creates a template and exposes it via getSnapshot', async () => {
    const tpl = await lib.createTemplate({
      name: 'Card',
      html: '<div><p data-editable="body"></p></div>',
      defaults: { body: 'hi' },
    });
    expect(tpl.id).toBeTruthy();
    expect(tpl.documentId).toBe('doc-1');
    expect(lib.getSnapshot().templates).toHaveLength(1);
    expect(lib.getTemplate(tpl.id)).toEqual(tpl);
  });

  it('sanitizes <script> from html on create', async () => {
    const tpl = await lib.createTemplate({
      name: 'evil',
      html: '<div>safe<script>alert(1)</script></div>',
      defaults: {},
    });
    expect(tpl.html).not.toContain('<script');
    expect(tpl.html).toContain('safe');
  });

  it('updates a template', async () => {
    const tpl = await lib.createTemplate({ name: 'a', html: '<div>a</div>', defaults: {} });
    const updated = await lib.updateTemplate(tpl.id, { name: 'b' });
    expect(updated.name).toBe('b');
    expect(lib.getTemplate(tpl.id)?.name).toBe('b');
  });

  it('sanitizes html on update', async () => {
    const tpl = await lib.createTemplate({ name: 'a', html: '<div>a</div>', defaults: {} });
    const updated = await lib.updateTemplate(tpl.id, {
      html: '<div>x<script>bad()</script></div>',
    });
    expect(updated.html).not.toContain('<script');
  });

  it('deletes a template', async () => {
    const tpl = await lib.createTemplate({ name: 'a', html: '<div>a</div>', defaults: {} });
    await lib.deleteTemplate(tpl.id);
    expect(lib.getTemplate(tpl.id)).toBeUndefined();
    expect(lib.getSnapshot().templates).toHaveLength(0);
  });

  // -------- clauses ---------------------------------------------------

  it('creates a clause with items', async () => {
    const clause = await lib.createClause({
      name: 'My clause',
      items: [{ id: 'i1', templateId: 't1', values: { body: 'hi' } }],
    });
    expect(clause.id).toBeTruthy();
    expect(clause.documentId).toBe('doc-1');
    expect(clause.items).toHaveLength(1);
  });

  it('updates a clause', async () => {
    const c = await lib.createClause({ name: 'A', items: [] });
    const updated = await lib.updateClause(c.id, { name: 'B' });
    expect(updated.name).toBe('B');
  });

  it('deletes a clause', async () => {
    const c = await lib.createClause({ name: 'A', items: [] });
    await lib.deleteClause(c.id);
    expect(lib.getClause(c.id)).toBeUndefined();
  });

  // -------- subscribe -------------------------------------------------

  it('notifies subscribers on commit', async () => {
    let calls = 0;
    const unsub = lib.subscribe(() => { calls++; });
    await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
    await lib.createClause({ name: 'a', items: [] });
    expect(calls).toBe(2);
    unsub();
    await lib.createTemplate({ name: 'b', html: '<div></div>', defaults: {} });
    expect(calls).toBe(2); // no more notifications after unsubscribe
  });

  it('snapshot identity changes on commit (drives useSyncExternalStore)', async () => {
    const before = lib.getSnapshot();
    await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
    const after = lib.getSnapshot();
    expect(after).not.toBe(before);
  });

  // -------- dispose ---------------------------------------------------

  it('dispose() detaches all listeners', async () => {
    let calls = 0;
    lib.subscribe(() => { calls++; });
    lib.dispose();
    await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
    expect(calls).toBe(0);
  });

  it('dispose() is idempotent', () => {
    lib.dispose();
    expect(() => lib.dispose()).not.toThrow();
  });
});
