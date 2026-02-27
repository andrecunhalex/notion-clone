// Exportação principal do Editor
export { NotionEditor } from './NotionEditor';

// Tipos para uso externo
export type { 
  BlockData, 
  BlockType, 
  ViewMode, 
  NotionEditorProps 
} from './types';

// Utils úteis para extensão
export { generateId, createEmptyBlock } from './utils';
