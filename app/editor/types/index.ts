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

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  indent?: number;
  align?: TextAlign;
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

// Interface para data source plugável (local vs Yjs/Supabase)
export interface EditorDataSourceInterface {
  blocks: BlockData[];
  setBlocks: (blocks: BlockData[]) => void;
  undo: () => string[];
  redo: () => string[];
  canUndo: boolean;
  canRedo: boolean;
  /** Track selected IDs for history restoration (optional) */
  trackSelectedIds?: (ids: string[]) => void;
}

// Editor configuration for customizable values
export interface EditorConfig {
  /** Height in px of the usable page area in paginated mode (default: 950) */
  pageContentHeight?: number;
  /** History debounce window in ms (default: 500) */
  historyDebounceMs?: number;
  /** Custom font fetcher — replaces the default /api/fonts call */
  fetchFonts?: () => Promise<import('../fonts').FontFamily[]>;
}

// Props do Editor principal (para reutilização)
export interface NotionEditorProps {
  initialBlocks?: BlockData[];
  onChange?: (blocks: BlockData[]) => void;
  defaultViewMode?: ViewMode;
  title?: string;
  /** Provide a custom data source (e.g. Yjs-backed) instead of the built-in local one */
  dataSource?: EditorDataSourceInterface;
  /** Editor configuration for customizable values */
  config?: EditorConfig;
}
