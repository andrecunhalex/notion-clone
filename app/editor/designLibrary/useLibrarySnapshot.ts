'use client';

import { useSyncExternalStore } from 'react';
import { subscribeLibrary, getLibrarySnapshot } from './store';
import type { LibrarySnapshot, LibraryTemplate } from './types';

/**
 * Fine-grained subscription to the library store. Any component calling this
 * re-renders only when the snapshot identity changes (i.e. on actual library
 * mutations), not on every editor render.
 */
export function useLibrarySnapshot(): LibrarySnapshot {
  return useSyncExternalStore(subscribeLibrary, getLibrarySnapshot, getLibrarySnapshot);
}

/**
 * Subscribe to a single template by id. DesignBlock uses this so that editing
 * a template's HTML propagates to all blocks referencing it without rebuilding
 * the whole editor.
 */
export function useLibraryTemplate(id: string | undefined): LibraryTemplate | undefined {
  const snap = useSyncExternalStore(subscribeLibrary, getLibrarySnapshot, getLibrarySnapshot);
  if (!id) return undefined;
  return snap.templates.find(t => t.id === id);
}
