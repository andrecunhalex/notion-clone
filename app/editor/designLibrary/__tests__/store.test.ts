import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setActiveLibrary,
  getActiveLibrary,
  getLibrarySnapshot,
  subscribeLibrary,
  getTemplateFromStore,
  getClauseFromStore,
} from '../store';
import { createFallbackLibrary } from '../fallbackLibrary';

describe('store', () => {
  beforeEach(() => {
    setActiveLibrary(null);
  });

  it('returns empty snapshot when no library is active', () => {
    const snap = getLibrarySnapshot();
    expect(snap.templates).toEqual([]);
    expect(snap.clauses).toEqual([]);
    expect(snap.bootstrapped).toBe(false);
  });

  it('exposes the active library snapshot once installed', async () => {
    const lib = createFallbackLibrary('doc-1');
    setActiveLibrary(lib);
    await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
    const snap = getLibrarySnapshot();
    expect(snap.templates).toHaveLength(1);
    expect(snap.templates[0].name).toBe('a');
  });

  it('forwards subscribe notifications from the active library', async () => {
    const lib = createFallbackLibrary('doc-1');
    setActiveLibrary(lib);
    const listener = vi.fn();
    const unsub = subscribeLibrary(listener);
    await lib.createTemplate({ name: 'a', html: '<div></div>', defaults: {} });
    // The store fires once when setActiveLibrary is called and once per
    // commit. We only care that commit notifications reach the subscriber.
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('detaches from the previous library when a new one is installed', async () => {
    const a = createFallbackLibrary('doc-a');
    const b = createFallbackLibrary('doc-b');
    setActiveLibrary(a);
    await a.createTemplate({ name: 'in-a', html: '<div></div>', defaults: {} });
    setActiveLibrary(b);
    // Now the snapshot should reflect b (empty), not a
    expect(getLibrarySnapshot().templates).toHaveLength(0);

    // Mutating a should not affect the store snapshot
    await a.createTemplate({ name: 'still-in-a', html: '<div></div>', defaults: {} });
    expect(getLibrarySnapshot().templates).toHaveLength(0);
  });

  it('getTemplateFromStore returns templates from the active snapshot', async () => {
    const lib = createFallbackLibrary('doc-1');
    setActiveLibrary(lib);
    const tpl = await lib.createTemplate({ name: 'x', html: '<div></div>', defaults: {} });
    expect(getTemplateFromStore(tpl.id)?.name).toBe('x');
  });

  it('getClauseFromStore returns clauses from the active snapshot', async () => {
    const lib = createFallbackLibrary('doc-1');
    setActiveLibrary(lib);
    const c = await lib.createClause({ name: 'y', items: [] });
    expect(getClauseFromStore(c.id)?.name).toBe('y');
  });

  it('getActiveLibrary returns null after detach', () => {
    const lib = createFallbackLibrary('doc-1');
    setActiveLibrary(lib);
    expect(getActiveLibrary()).toBe(lib);
    setActiveLibrary(null);
    expect(getActiveLibrary()).toBe(null);
  });
});
