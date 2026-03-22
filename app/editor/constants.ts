// =============================================================================
// Constantes compartilhadas do Editor
// =============================================================================

export interface ColorOption {
  name: string;
  value: string;
  preview: string;
  border?: boolean;
}

// --- Paleta de cores (estilo Notion) ---

export const TEXT_COLORS: ColorOption[] = [
  { name: 'Padrão', value: '', preview: '#37352F', border: true },
  { name: 'Cinza', value: '#9B9A97', preview: '#9B9A97' },
  { name: 'Marrom', value: '#64473A', preview: '#64473A' },
  { name: 'Laranja', value: '#D9730D', preview: '#D9730D' },
  { name: 'Amarelo', value: '#DFAB01', preview: '#DFAB01' },
  { name: 'Verde', value: '#0F7B6C', preview: '#0F7B6C' },
  { name: 'Azul', value: '#0B6E99', preview: '#0B6E99' },
  { name: 'Roxo', value: '#6940A5', preview: '#6940A5' },
  { name: 'Rosa', value: '#AD1A72', preview: '#AD1A72' },
  { name: 'Vermelho', value: '#E03E3E', preview: '#E03E3E' },
];

export const BG_COLORS: ColorOption[] = [
  { name: 'Padrão', value: '', preview: '#FFFFFF', border: true },
  { name: 'Cinza', value: '#F1F1EF', preview: '#F1F1EF' },
  { name: 'Marrom', value: '#F4EEEE', preview: '#F4EEEE' },
  { name: 'Laranja', value: '#FBECDD', preview: '#FBECDD' },
  { name: 'Amarelo', value: '#FBF3DB', preview: '#FBF3DB' },
  { name: 'Verde', value: '#EDF3EC', preview: '#EDF3EC' },
  { name: 'Azul', value: '#E7F3F8', preview: '#E7F3F8' },
  { name: 'Roxo', value: '#F6F3F9', preview: '#F6F3F9' },
  { name: 'Rosa', value: '#F9F0F5', preview: '#F9F0F5' },
  { name: 'Vermelho', value: '#FBE4E4', preview: '#FBE4E4' },
];

// Versão com nomes estendidos para contexto de tabela
export const TABLE_TEXT_COLORS: ColorOption[] = [
  { name: 'Texto padrão', value: '', preview: '#37352F' },
  { name: 'Texto cinza', value: '#9B9A97', preview: '#9B9A97' },
  { name: 'Texto marrom', value: '#64473A', preview: '#64473A' },
  { name: 'Texto laranja', value: '#D9730D', preview: '#D9730D' },
  { name: 'Texto amarelo', value: '#DFAB01', preview: '#DFAB01' },
  { name: 'Texto verde', value: '#0F7B6C', preview: '#0F7B6C' },
  { name: 'Texto azul', value: '#0B6E99', preview: '#0B6E99' },
  { name: 'Texto roxo', value: '#6940A5', preview: '#6940A5' },
  { name: 'Texto rosa', value: '#AD1A72', preview: '#AD1A72' },
  { name: 'Texto vermelho', value: '#E03E3E', preview: '#E03E3E' },
];

export const TABLE_BG_COLORS: ColorOption[] = [
  { name: 'Fundo padrão', value: '', preview: '#FFFFFF' },
  { name: 'Fundo cinza', value: '#F1F1EF', preview: '#F1F1EF' },
  { name: 'Fundo marrom', value: '#F4EEEE', preview: '#F4EEEE' },
  { name: 'Fundo laranja', value: '#FBECDD', preview: '#FBECDD' },
  { name: 'Fundo amarelo', value: '#FBF3DB', preview: '#FBF3DB' },
  { name: 'Fundo verde', value: '#EDF3EC', preview: '#EDF3EC' },
  { name: 'Fundo azul', value: '#E7F3F8', preview: '#E7F3F8' },
  { name: 'Fundo roxo', value: '#F6F3F9', preview: '#F6F3F9' },
  { name: 'Fundo rosa', value: '#F9F0F5', preview: '#F9F0F5' },
  { name: 'Fundo vermelho', value: '#FBE4E4', preview: '#FBE4E4' },
];

// --- OS detection ---
export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
export const shiftKey = isMac ? '⇧' : 'Shift';

// --- Color normalization (cached) ---
let _canvasCtx: CanvasRenderingContext2D | null | undefined;
function getCanvasCtx(): CanvasRenderingContext2D | null {
  if (_canvasCtx === undefined) {
    _canvasCtx = document.createElement('canvas').getContext('2d');
  }
  return _canvasCtx;
}

const colorCache = new Map<string, string>();

export function normalizeColor(color: string): string {
  if (!color) return '';
  const cached = colorCache.get(color);
  if (cached !== undefined) return cached;
  const ctx = getCanvasCtx();
  if (!ctx) {
    const result = color.toLowerCase();
    colorCache.set(color, result);
    return result;
  }
  ctx.fillStyle = color;
  const result = ctx.fillStyle.toLowerCase();
  colorCache.set(color, result);
  return result;
}
