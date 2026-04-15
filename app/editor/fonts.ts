// =============================================================================
// SISTEMA DINÂMICO DE FONTES DO EDITOR
// =============================================================================
//
// Para adicionar uma nova fonte:
//   1. Crie uma pasta em public/fonts/ com o nome da fonte (ex: public/fonts/roboto/)
//   2. Coloque os arquivos (.woff2, .woff, .ttf, .otf) dentro da pasta
//   3. Pronto! A fonte aparece automaticamente nos seletores do editor
//
// O sistema detecta peso (Regular, Bold, Light, etc.) e estilo (Italic)
// automaticamente pelo nome do arquivo.
// =============================================================================

export interface FontVariant {
  file: string;
  weight: number;
  style: string;
  isVariable?: boolean;
}

export interface FontFamily {
  /** Display name */
  name: string;
  /** Folder in public/fonts/ */
  folder: string;
  /** All weight/style variants */
  variants: FontVariant[];
}

export interface FontEntry {
  /** Nome exibido no seletor */
  name: string;
  /** Nome CSS font-family */
  family: string;
  /** Whether this is a custom (file-based) font */
  isCustom?: boolean;
  /** Available font-weight values for this family */
  availableWeights?: number[];
}

/** Maps weight numbers to human-readable names */
export const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/** Font size presets in pt (shared between floating toolbar and document toolbar) */
export const SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96] as const;

/** Default document font size in pt (matches Google Docs / Word default) */
export const DEFAULT_FONT_SIZE = 11;

// --- Fontes do sistema (sempre disponíveis) ---
export const SYSTEM_FONTS: FontEntry[] = [
  { name: 'Padrão', family: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"' },
  { name: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { name: 'Mono', family: 'ui-monospace, "Cascadia Code", Menlo, monospace' },
];

// Valor padrão para "sem fonte definida"
export const DEFAULT_FONT_FAMILY = '';

function getFontFormat(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'truetype';
    case 'otf': return 'opentype';
    default: return 'truetype';
  }
}

/** Fetch font families from the API */
export async function fetchFontFamilies(): Promise<FontFamily[]> {
  const res = await fetch('/api/fonts');
  const data = await res.json();
  return data.families;
}

// System font names that could collide with custom font folder names
const SYSTEM_FONT_NAMES = new Set(
  SYSTEM_FONTS.flatMap(f =>
    f.family.split(',').map(s => s.trim().replace(/['"]/g, '').toLowerCase())
  )
);

/** Get the CSS font-family name, disambiguating from system fonts */
export function getCssFontFamily(name: string): string {
  if (SYSTEM_FONT_NAMES.has(name.toLowerCase())) {
    return `${name} Custom`;
  }
  return name;
}

/** Full weight ladder — used when a family is backed by a variable font */
const VARIABLE_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Convert FontFamily[] to FontEntry[] for the selector dropdown */
export function fontFamiliesToEntries(families: FontFamily[]): FontEntry[] {
  return families.map(f => {
    const hasVariable = f.variants.some(v => v.isVariable);
    const weights = hasVariable
      ? VARIABLE_WEIGHTS
      : [...new Set(f.variants.map(v => v.weight))].sort((a, b) => a - b);
    const cssFamily = getCssFontFamily(f.name);
    return {
      name: f.name,
      family: cssFamily,
      isCustom: true,
      availableWeights: weights,
    };
  });
}

/** Generate @font-face CSS for all dynamic font families */
export function generateFontFaceCSS(families: FontFamily[]): string {
  const rules: string[] = [];
  for (const family of families) {
    const cssFamily = getCssFontFamily(family.name);
    for (const variant of family.variants) {
      // Variable fonts cover the full 100–900 range in a single file
      const fontWeight = variant.isVariable ? '100 900' : `${variant.weight}`;
      const baseFormat = getFontFormat(variant.file);
      const fmt = variant.isVariable ? `${baseFormat}-variations` : baseFormat;
      rules.push(`@font-face {
  font-family: '${cssFamily}';
  src: url('/fonts/${variant.file}') format('${fmt}');
  font-weight: ${fontWeight};
  font-style: ${variant.style};
  font-display: swap;
}`);
    }
  }
  return rules.join('\n\n');
}
