import { BlockData, BlockType, TableData } from '../types';

// Gera ID único
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Bloco inicial padrão
export const createEmptyBlock = (): BlockData => ({
  id: generateId(),
  type: 'text',
  content: ''
});

// --- List helpers ---

export const isListType = (type: BlockType): boolean =>
  type === 'bullet_list' || type === 'numbered_list';

const BULLET_CHARS = ['•', '◦', '▪', '▪'];

export const getBulletChar = (indent: number): string =>
  BULLET_CHARS[Math.min(indent, BULLET_CHARS.length - 1)];

export const getListNumber = (
  block: BlockData,
  blocks: BlockData[],
  globalIndex: number
): number => {
  let count = 1;
  const indent = block.indent ?? 0;
  for (let i = globalIndex - 1; i >= 0; i--) {
    const prev = blocks[i];
    if (prev.type !== 'numbered_list') break;
    if ((prev.indent ?? 0) === indent) count++;
    else if ((prev.indent ?? 0) < indent) break;
  }
  return count;
};

// --- Table helpers ---

export const createDefaultTableData = (): TableData => ({
  rows: Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ content: '' }))
  ),
  columnWidths: [33.33, 33.33, 33.34],
  hasHeaderRow: false,
});

// Constantes de paginação (A4 em pixels ~96dpi: 794x1123, com margens de 20mm = ~75px cada lado)
export const PAGE_CONTENT_HEIGHT = 950; // Altura útil da página

// Calcula páginas para modo paginado
export const getPaginatedBlocks = (
  blocks: BlockData[],
  blockHeights: Record<string, number>,
  viewMode: 'continuous' | 'paginated'
): BlockData[][] => {
  if (viewMode === 'continuous') return [blocks];

  const pages: BlockData[][] = [];
  let currentPage: BlockData[] = [];
  let currentH = 0;

  blocks.forEach((block) => {
    const h = blockHeights[block.id] || 24;

    // Se o bloco sozinho é maior que a página, coloca numa página própria
    if (h >= PAGE_CONTENT_HEIGHT) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentH = 0;
      }
      // Bloco gigante fica sozinho na página (vai ter overflow visual)
      pages.push([block]);
      return;
    }

    // Se adicionar esse bloco estoura a página, começa nova página
    if (currentH + h > PAGE_CONTENT_HEIGHT && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentH = 0;
    }
    
    currentPage.push(block);
    currentH += h;
  });

  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
};

// Foca no elemento editável de um bloco
export const focusBlock = (blockId: string, position: 'end' | 'start' | false = 'end') => {
  setTimeout(() => {
    const el = document.getElementById(`editable-${blockId}`);
    if (el) {
      el.focus({ preventScroll: true });
      if (position) {
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel) {
          range.selectNodeContents(el);
          range.collapse(position === 'start');
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }, 0);
};

// Check if HTML content is effectively empty (no visible text)
export const isContentEmpty = (content: string): boolean => {
  if (!content) return true;
  const text = content.replace(/<[^>]*>/g, '').trim();
  return text === '';
};

// Extract plain text from HTML content
export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};

// Copia texto para clipboard (compatível com iframes)
export const copyToClipboard = (text: string) => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Falha ao copiar', err);
  }

  document.body.removeChild(textArea);
};
