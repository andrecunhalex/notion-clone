// ---------------------------------------------------------------------------
// Module-level design library store
// ---------------------------------------------------------------------------
// A lightweight singleton that holds the *currently active* library snapshot
// plus a subscribe/notify mechanism. Exists so that low-level helpers like
// `getTemplate(id)` can be called from anywhere (DesignBlock render, SlashMenu
// preview) without prop-drilling the whole library, and so that components can
// subscribe via `useSyncExternalStore` for fine-grained re-renders.
//
// ## Stack semantics
//
// Multiple providers can mount at the same time — the main editor holds one,
// and the version history overlay mounts 2–3 extra ones for its read-only
// panels. We track them in a stack: every `setActiveLibrary(lib)` pushes,
// every `releaseActiveLibrary(lib)` pops that specific instance (not
// necessarily the top — React unmount order can differ from mount order).
// The *top of the stack* is the active library at any moment.
//
// This replaces the old "singleton slot that any cleanup could null out"
// design, where closing the history overlay would wipe the main editor's
// registration and make all design blocks render as null until reload.
//
// `setActiveLibrary(null)` is kept as a legacy nuke-all reset — used only by
// tests. Provider cleanups go through `releaseActiveLibrary(lib)` instead.
// ---------------------------------------------------------------------------

import type { DesignLibraryInterface, LibrarySnapshot, LibraryTemplate, LibraryClause } from './types';

const EMPTY_SNAPSHOT: LibrarySnapshot = { templates: [], clauses: [], bootstrapped: false };

/** Most-recent-wins stack of mounted libraries. Top is active. */
const libStack: DesignLibraryInterface[] = [];
let activeLibrary: DesignLibraryInterface | null = null;
let cachedSnapshot: LibrarySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let unsubscribeFromActive: (() => void) | null = null;

function notify() {
  for (const l of listeners) l();
}

/**
 * Swap in a new active library. Cheap no-op if it's already the active one
 * (same reference), so duplicate mounts don't churn subscriptions.
 */
function swapActive(next: DesignLibraryInterface | null) {
  if (next === activeLibrary) return;
  if (unsubscribeFromActive) {
    unsubscribeFromActive();
    unsubscribeFromActive = null;
  }
  activeLibrary = next;
  cachedSnapshot = next ? next.getSnapshot() : EMPTY_SNAPSHOT;
  if (next) {
    const captured = next;
    unsubscribeFromActive = captured.subscribe(() => {
      cachedSnapshot = captured.getSnapshot();
      notify();
    });
  }
  notify();
}

/**
 * Push a library onto the stack and make it active. Passing `null` is kept
 * as a legacy "reset everything" for tests — provider cleanups should call
 * `releaseActiveLibrary(lib)` instead so they don't wipe another provider's
 * registration.
 */
export function setActiveLibrary(lib: DesignLibraryInterface | null) {
  if (lib === null) {
    libStack.length = 0;
    swapActive(null);
    return;
  }
  libStack.push(lib);
  swapActive(lib);
}

/**
 * Remove the most recent occurrence of `lib` from the stack. If other
 * mounts are still holding libraries, the new top becomes active; otherwise
 * the active slot clears. Safe to call with a library that was never
 * pushed (no-op).
 */
export function releaseActiveLibrary(lib: DesignLibraryInterface) {
  const idx = libStack.lastIndexOf(lib);
  if (idx < 0) return;
  libStack.splice(idx, 1);
  swapActive(libStack.length > 0 ? libStack[libStack.length - 1] : null);
}

export function getActiveLibrary(): DesignLibraryInterface | null {
  return activeLibrary;
}

// ---------------------------------------------------------------------------
// useSyncExternalStore-compatible API
// ---------------------------------------------------------------------------

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibrarySnapshot(): LibrarySnapshot {
  return cachedSnapshot;
}

// ---------------------------------------------------------------------------
// Lookup helpers (sync, used by rendering code)
// ---------------------------------------------------------------------------

export function getTemplateFromStore(id: string): LibraryTemplate | undefined {
  return cachedSnapshot.templates.find(t => t.id === id);
}

export function getClauseFromStore(id: string): LibraryClause | undefined {
  return cachedSnapshot.clauses.find(c => c.id === id);
}
