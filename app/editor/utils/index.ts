import { BlockData } from '../types';

// Gera ID único
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Bloco inicial padrão
export const createEmptyBlock = (): BlockData => ({
  id: generateId(),
  type: 'text',
  content: ''
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
export const focusBlock = (blockId: string, collapseToEnd = true) => {
  setTimeout(() => {
    const el = document.getElementById(`editable-${blockId}`);
    if (el) {
      el.focus();
      if (collapseToEnd) {
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel) {
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }, 0);
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
