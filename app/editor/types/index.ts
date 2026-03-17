// --- Tipos do Editor ---

export type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'divider' | 'bullet_list' | 'numbered_list' | 'table' | 'image';

export interface TableCellData {
  content: string;
  bgColor?: string;
  textColor?: string;
}

export interface TableData {
  rows: TableCellData[][];
  columnWidths: number[];
  hasHeaderRow: boolean;
}

export type ImageAlignment = 'left' | 'center' | 'right';

export interface ImageData {
  src: string;
  width: number; // percentage of container width (10-100)
  alignment: ImageAlignment;
  caption?: string;
}

export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  indent?: number;
  tableData?: TableData;
  imageData?: ImageData;
}

export interface SlashMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  blockId: string | null;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export interface DropTarget {
  id: string;
  position: 'top' | 'bottom';
}

export type ViewMode = 'continuous' | 'paginated';

// Props do Editor principal (para reutilização)
export interface NotionEditorProps {
  initialBlocks?: BlockData[];
  onChange?: (blocks: BlockData[]) => void;
  defaultViewMode?: ViewMode;
  title?: string;
}
