'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  FontEntry,
  FontFamily,
  SYSTEM_FONTS,
  fetchFontFamilies,
  fontFamiliesToEntries,
  generateFontFaceCSS,
} from '../fonts';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface FontContextValue {
  allFonts: FontEntry[];
  customFonts: FontEntry[];
}

const FontContext = createContext<FontContextValue>({
  allFonts: SYSTEM_FONTS,
  customFonts: [],
});

export const useFonts = () => useContext(FontContext);

// ---------------------------------------------------------------------------
// Global singleton — fonts are loaded once and shared across all editors
// ---------------------------------------------------------------------------

// v2: variable-font migration (Montserrat/Caveat statics removed)
const CACHE_KEY = 'editor-fonts-cache-v2';
const STYLE_ID = 'editor-custom-fonts';

let cachedEntries: FontEntry[] | null = null;
let loadPromise: Promise<FontFamily[]> | null = null;
let fetchedThisSession = false;

/** Inject @font-face CSS into <head> (idempotent). */
function injectCSS(families: FontFamily[]) {
  const css = generateFontFaceCSS(families);
  if (!css) return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

/** Read cached font families from localStorage (sync, best-effort). */
function readLocalCache(): FontFamily[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Save font families to localStorage (best-effort). */
function writeLocalCache(families: FontFamily[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(families)); } catch { /* quota */ }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FontLoaderProps {
  children: React.ReactNode;
  /** Custom font fetcher — replaces the default /api/fonts call */
  fetchFonts?: () => Promise<FontFamily[]>;
}

export const FontLoader: React.FC<FontLoaderProps> = ({ children, fetchFonts }) => {
  // Initialise synchronously from the global cache or localStorage so that
  // fonts are available on the very first render (no FOUC).
  const [customFonts, setCustomFonts] = useState<FontEntry[]>(() => {
    if (cachedEntries) return cachedEntries;
    if (typeof window === 'undefined') return [];
    const local = readLocalCache();
    if (local) {
      injectCSS(local);
      const entries = fontFamiliesToEntries(local);
      cachedEntries = entries;
      return entries;
    }
    return [];
  });

  const fetcher = fetchFonts || fetchFontFamilies;

  useEffect(() => {
    // Already fetched from the API this session — nothing to do.
    // (Version history editors, re-mounts, etc. skip entirely.)
    if (fetchedThisSession) return;

    let cancelled = false;

    // Share a single in-flight request across concurrent FontLoader mounts.
    if (!loadPromise) loadPromise = fetcher();

    loadPromise
      .then((families) => {
        if (cancelled) return;
        fetchedThisSession = true;
        injectCSS(families);
        writeLocalCache(families);
        const entries = fontFamiliesToEntries(families);
        cachedEntries = entries;
        setCustomFonts(entries);
      })
      .catch(() => {
        loadPromise = null; // allow retry on next mount
      });

    return () => { cancelled = true; };
    // NOTE: no CSS cleanup on unmount — the <style> element is a shared
    // global resource and must stay alive while any editor is mounted.
  }, [fetcher]); // eslint-disable-line react-hooks/exhaustive-deps

  const allFonts = useMemo(() => [...SYSTEM_FONTS, ...customFonts], [customFonts]);
  const value = useMemo(() => ({ allFonts, customFonts }), [allFonts, customFonts]);

  return (
    <FontContext.Provider value={value}>
      {children}
    </FontContext.Provider>
  );
};
