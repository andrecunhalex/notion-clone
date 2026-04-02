// --- Tipos do Editor ---

export type BlockType = 'text' | 'h1' | 'h2' | 'h3' | 'divider' | 'bullet_list' | 'numbered_list' | 'table' | 'image' | 'design_block';

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

export interface DesignBlockData {
  templateId: string;
  values: Record<string, string>;
}

export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  indent?: number;
  align?: TextAlign;
  fullWidth?: boolean;
  tableData?: TableData;
  imageData?: ImageData;
  designBlockData?: DesignBlockData;
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
  /** Document-level metadata (font, etc.) */
  meta?: Record<string, unknown>;
  setMeta?: (updates: Record<string, unknown>) => void;
}

// Page dimensions and padding configuration
export interface PageConfig {
  /** Page width in px (default: 794 — A4 at 96dpi) */
  width?: number;
  /** Page height in px (default: 1123 — A4 at 96dpi) */
  height?: number;
  /** Padding top in px (default: 56 ≈ 15mm) */
  paddingTop?: number;
  /** Padding right in px (default: 75 ≈ 20mm) */
  paddingRight?: number;
  /** Padding bottom in px (default: 56 ≈ 15mm) */
  paddingBottom?: number;
  /** Padding left in px (default: 75 ≈ 20mm) */
  paddingLeft?: number;
}

// ---------------------------------------------------------------------------
// Section Navigation configuration
// ---------------------------------------------------------------------------

/** Where on the page the section nav buttons are rendered */
export type SectionNavPosition = 'header' | 'footer' | 'left' | 'right';

/** Filter that decides which pages show the section nav */
export type SectionNavPageFilter =
  | 'all'
  | 'none'
  | number[]
  | ((pageIndex: number, totalPages: number) => boolean);

/**
 * HTML template for section nav buttons.
 *
 * Active and inactive states have **separate HTML templates** — they can be
 * completely different designs, not just color swaps.
 *
 * Supports placeholders in both templates:
 *   {{label}}  — button label (custom or truncated original)
 *   {{number}} — auto-number (e.g. "1", "1.1")
 *   {{title}}  — original full title text
 *
 * Everything is pure HTML + Tailwind — fully serializable (can be stored in DB).
 *
 * Example:
 * ```
 * {
 *   activeHtml: '<div class="bg-purple-600 text-white rounded-full px-3 py-1 text-xs font-bold">{{label}}</div>',
 *   inactiveHtml: '<div class="bg-gray-100 text-gray-400 rounded-full px-3 py-1 text-xs border border-gray-200">{{label}}</div>',
 * }
 * ```
 */
export interface SectionNavButtonTemplate {
  /** Full HTML for the button when the heading IS on the current page */
  activeHtml: string;
  /** Full HTML for the button when the heading is NOT on the current page */
  inactiveHtml: string;
}

export interface SectionNavConfig {
  /** Position on the page (default: 'header') */
  position?: SectionNavPosition;
  /** Which pages show the nav. 'all' | 'none' | number[] | filter fn. Default: 'all' */
  pages?: SectionNavPageFilter;
  /** Max visible buttons before collapsing to a single "Sumário" button (default: unlimited) */
  maxButtons?: number;
  /** Max characters for button labels before truncating with "..." (default: 16) */
  maxLabelLength?: number;
  /** Active color for default buttons (default: '#7c3aed' — purple). Ignored when buttonTemplate is set. */
  activeColor?: string;
  /** Custom button template (HTML + Tailwind). Overrides the default pill buttons. Serializable for DB storage. */
  buttonTemplate?: SectionNavButtonTemplate;
}

// Editor configuration for customizable values
export interface EditorConfig {
  /** Page dimensions and padding (paginated mode) */
  page?: PageConfig;
  /** Height in px of the usable page area in paginated mode (default: auto-calculated from page config) */
  pageContentHeight?: number;
  /** History debounce window in ms (default: 500) */
  historyDebounceMs?: number;
  /** Custom font fetcher — replaces the default /api/fonts call */
  fetchFonts?: () => Promise<import('../fonts').FontFamily[]>;
  /** Custom image uploader — returns URL. If not provided, images are stored as base64 */
  uploadImage?: (file: File) => Promise<string | null>;
  /** Initial zoom level (0.1 to 3, default: 1) */
  defaultZoom?: number;
  /** Section navigation buttons on pages (table-of-contents nav) */
  sectionNav?: SectionNavConfig;
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
  /** Called when the user focuses a block (for collaboration awareness) */
  onBlockFocus?: (blockId: string | null) => void;
  /** Remote users for presence in toolbar (collaboration mode) */
  remoteUsers?: { id: string; name: string; color: string; cursor?: { blockId: string } | null }[];
  /** Sync status for toolbar indicator */
  syncStatus?: 'disconnected' | 'connecting' | 'connected' | 'synced';
}
