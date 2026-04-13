'use client';

// ---------------------------------------------------------------------------
// DesignLibraryProvider
// ---------------------------------------------------------------------------
// Wraps the editor, installs a DesignLibraryInterface into the module store,
// and exposes it via React context for components that need CRUD access
// (picker modal, settings panel manager).
//
// Rendering code (DesignBlock, preview builders) does NOT read from context —
// it reads directly from the module store via useSyncExternalStore, so changes
// to templates propagate without re-rendering the editor tree.
// ---------------------------------------------------------------------------

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { setActiveLibrary } from './store';
import { createFallbackLibrary } from './fallbackLibrary';
import { createSupabaseLibrary } from './supabaseLibrary';
import type { DesignLibraryInterface, DesignLibraryConfig } from './types';

// ---------------------------------------------------------------------------
// Refcounted instance cache
// ---------------------------------------------------------------------------
// Multiple Providers can mount in the tree (rare, but possible — e.g. a
// preview pane next to the editor). They all share the same library
// instance for a given key so we don't create N realtime channels.
//
// Each acquire() bumps the refcount; release() decrements it. When the count
// hits zero we call dispose() on the instance to tear down sockets, then
// remove it from the cache. The next acquire() with the same key starts a
// fresh instance (and re-bootstraps).
//
// This replaces the old "leak forever / cleanup on beforeunload" approach
// which broke on SPA navigation.
// ---------------------------------------------------------------------------

interface CacheEntry {
  lib: DesignLibraryInterface;
  refs: number;
}

const libraryCache = new Map<string, CacheEntry>();

function acquireLibrary(
  key: string,
  factory: () => DesignLibraryInterface,
): DesignLibraryInterface {
  const existing = libraryCache.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.lib;
  }
  const created = factory();
  libraryCache.set(key, { lib: created, refs: 1 });
  return created;
}

function releaseLibrary(key: string) {
  const entry = libraryCache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    try {
      entry.lib.dispose();
    } catch (err) {
      console.warn('[designLibrary] dispose threw', err);
    }
    libraryCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProviderProps {
  config?: DesignLibraryConfig;
  /** Escape hatch: pass a custom interface (useful for tests / lib users) */
  library?: DesignLibraryInterface;
  /** Fallback documentId when no config is given (for scope filtering) */
  documentId?: string;
  children: React.ReactNode;
}

const DesignLibraryContext = createContext<DesignLibraryInterface | null>(null);

export const DesignLibraryProvider: React.FC<ProviderProps> = ({ config, library, documentId, children }) => {
  // Identity key. External libraries get a unique key so they don't collide
  // with cached instances (and we never call dispose on caller-owned libs).
  const externalKey = useMemo(
    () => library ? `external:${Math.random().toString(36).slice(2)}` : null,
    [library],
  );
  const configKey = config
    ? `supabase:${config.supabaseUrl}:${config.workspaceId}:${config.documentId}`
    : externalKey ?? `fallback:${documentId ?? ''}`;

  // Acquire the instance for this key. useMemo gives us a stable reference
  // within the render cycle; the cache handles cross-mount deduping. The
  // matching release happens in the effect cleanup below.
  const lib = useMemo<DesignLibraryInterface>(() => {
    if (library) {
      // Caller-owned: register in cache so dispose isn't called on it
      // accidentally if a sibling Provider tries to acquire the same key.
      // The factory here just returns the existing instance.
      return acquireLibrary(configKey, () => library);
    }
    return acquireLibrary(
      configKey,
      () => config ? createSupabaseLibrary(config) : createFallbackLibrary(documentId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // Register the active library in the module store so getTemplate() / preview
  // helpers / DesignBlock render all see the same snapshot. Release on unmount
  // — when the last consumer is gone, dispose tears down the realtime channel.
  useEffect(() => {
    setActiveLibrary(lib);
    return () => {
      setActiveLibrary(null);
      // Skip releasing caller-owned instances — they belong to the caller.
      if (!library) {
        releaseLibrary(configKey);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);

  return (
    <DesignLibraryContext.Provider value={lib}>
      {children}
    </DesignLibraryContext.Provider>
  );
};

/** Hook for components that need CRUD access (management / picker modals) */
export function useDesignLibrary(): DesignLibraryInterface {
  const lib = useContext(DesignLibraryContext);
  if (!lib) throw new Error('useDesignLibrary must be used inside <DesignLibraryProvider>');
  return lib;
}
