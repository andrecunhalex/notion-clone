'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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

/**
 * Busca fontes de public/fonts/, injeta @font-face e
 * disponibiliza a lista via context para os seletores.
 */
export const FontLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customFonts, setCustomFonts] = useState<FontEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchFontFamilies().then((families: FontFamily[]) => {
      if (cancelled) return;

      // Inject @font-face CSS
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
    });

    return () => {
      cancelled = true;
      document.getElementById('editor-custom-fonts')?.remove();
    };
  }, []);

  const allFonts = [...SYSTEM_FONTS, ...customFonts];

  return (
    <FontContext.Provider value={{ allFonts, customFonts }}>
      {children}
    </FontContext.Provider>
  );
};
