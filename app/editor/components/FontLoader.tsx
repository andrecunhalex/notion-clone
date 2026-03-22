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

interface FontContextValue {
  allFonts: FontEntry[];
  customFonts: FontEntry[];
}

const FontContext = createContext<FontContextValue>({
  allFonts: SYSTEM_FONTS,
  customFonts: [],
});

export const useFonts = () => useContext(FontContext);

interface FontLoaderProps {
  children: React.ReactNode;
  /** Custom font fetcher — replaces the default /api/fonts call */
  fetchFonts?: () => Promise<FontFamily[]>;
}

export const FontLoader: React.FC<FontLoaderProps> = ({ children, fetchFonts }) => {
  const [customFonts, setCustomFonts] = useState<FontEntry[]>([]);

  const fetcher = fetchFonts || fetchFontFamilies;

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((families: FontFamily[]) => {
        if (cancelled) return;

        const css = generateFontFaceCSS(families);
        if (css) {
          const id = 'editor-custom-fonts';
          let style = document.getElementById(id) as HTMLStyleElement | null;
          if (!style) {
            style = document.createElement('style');
            style.id = id;
            document.head.appendChild(style);
          }
          style.textContent = css;
        }

        setCustomFonts(fontFamiliesToEntries(families));
      })
      .catch(() => {
        // Font loading is optional — silently degrade to system fonts only
      });

    return () => {
      cancelled = true;
      document.getElementById('editor-custom-fonts')?.remove();
    };
  }, [fetcher]);

  const allFonts = useMemo(() => [...SYSTEM_FONTS, ...customFonts], [customFonts]);

  const value = useMemo(() => ({ allFonts, customFonts }), [allFonts, customFonts]);

  return (
    <FontContext.Provider value={value}>
      {children}
    </FontContext.Provider>
  );
};
