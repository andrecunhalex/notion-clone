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

// --- Fontes do sistema (sempre disponíveis) ---
export const SYSTEM_FONTS: FontEntry[] = [
  { name: 'Padrão', family: 'system-ui, -apple-system, sans-serif' },
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

/** Convert FontFamily[] to FontEntry[] for the selector dropdown */
export function fontFamiliesToEntries(families: FontFamily[]): FontEntry[] {
  return families.map(f => {
    // Dedupe and sort available weights (only non-italic to avoid duplicates)
    const weights = [...new Set(f.variants.map(v => v.weight))].sort((a, b) => a - b);
    return {
      name: f.name,
      family: f.name,
      isCustom: true,
      availableWeights: weights,
    };
  });
}

/** Generate @font-face CSS for all dynamic font families */
export function generateFontFaceCSS(families: FontFamily[]): string {
  const rules: string[] = [];
  for (const family of families) {
    for (const variant of family.variants) {
      rules.push(`@font-face {
  font-family: '${family.name}';
  src: url('/fonts/${variant.file}') format('${getFontFormat(variant.file)}');
  font-weight: ${variant.weight};
  font-style: ${variant.style};
  font-display: swap;
}`);
    }
  }
  return rules.join('\n\n');
}
