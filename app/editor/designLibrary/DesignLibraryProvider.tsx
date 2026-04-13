'use client';

// ---------------------------------------------------------------------------
// DesignLibraryProvider
// ---------------------------------------------------------------------------
// Wraps the editor, installs a DesignLibraryInterface into the module store,
// and exposes it via React context for components that need CRUD access
// (SlashMenu picker, DesignSettings manager).
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
// Module-level instance cache
// ---------------------------------------------------------------------------
// Keyed by the config identity (url + workspace + doc). A single entry per key
// means:
//   * React Strict Mode's double-invoke of useMemo in dev doesn't create two
//     libraries (two refetches, two realtime channels)
//   * Mounting the same editor twice in the tree (unlikely but possible) or
//     remounting after a transient unmount reuses the same live snapshot
//     instead of fetching everything again
// ---------------------------------------------------------------------------

const libraryCache = new Map<string, DesignLibraryInterface>();

function getOrCreateLibrary(
  key: string,
  factory: () => DesignLibraryInterface,
): DesignLibraryInterface {
  const existing = libraryCache.get(key);
  if (existing) return existing;
  const created = factory();
  libraryCache.set(key, created);
  return created;
}

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
  // Identity key so we only reuse/recreate the instance when config changes.
  const configKey = config
    ? `supabase:${config.supabaseUrl}:${config.workspaceId}:${config.documentId}`
    : library
      ? 'external'
      : `fallback:${documentId ?? ''}`;

  // Instance lookup goes through the module-level cache — see top of file.
  // useMemo only keeps a stable reference within the current render cycle;
  // the cache handles React Strict Mode + cross-mount deduping.
  const lib = useMemo<DesignLibraryInterface>(() => {
    if (library) return library;
    return getOrCreateLibrary(
      configKey,
      () => config ? createSupabaseLibrary(config) : createFallbackLibrary(documentId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // Register the active library in the module store so getTemplate() / preview
  // helpers / DesignBlock render all see the same snapshot.
  useEffect(() => {
    setActiveLibrary(lib);
    return () => { setActiveLibrary(null); };
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
