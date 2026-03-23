// =============================================================================
// Editor Entry Point
// =============================================================================
// Importe tudo daqui para usar o editor como lib.
// Exemplo:
//   import { NotionEditor } from './editor';
//   import type { BlockData, NotionEditorProps } from './editor';
// =============================================================================

// Componente principal
export { NotionEditor } from './NotionEditor';

// Provider e data source (para integração com Yjs/Supabase)
export { EditorProvider, useLocalDataSource, useEditorContext } from './EditorProvider';
export type { EditorDataSource, DocumentMeta } from './EditorProvider';

// Tipos
export type {
  BlockData,
  BlockType,
  ViewMode,
  NotionEditorProps,
  TableData,
  TableCellData,
  ImageData,
  ImageAlignment,
  TextAlign,
  EditorDataSourceInterface,
  EditorConfig,
  PageConfig,
} from './types';

// Utils úteis para extensão
export { generateId, createEmptyBlock, isContentEmpty, focusBlock, resolvePageConfig, getContentHeight, DEFAULT_PAGE_CONFIG } from './utils';

// Parsing utils (para quem quiser converter HTML <-> Blocks)
export {
  parseHtmlToBlocks,
  parsePlainTextToBlocks,
  blocksToHtml,
  blocksToText,
} from './utils/htmlParser';

// Constantes (cores, etc.)
export { TEXT_COLORS, BG_COLORS } from './constants';

// Colaboração em tempo real (Yjs + Supabase)
export {
  useCollaborativeEditor,
  RemoteCursorsOverlay,
  SyncStatusBadge,
} from './collaboration';
export type {
  CollaborationConfig,
  CollaborationUser,
  RemoteUser,
  SyncStatus,
  CursorPosition,
} from './collaboration';
