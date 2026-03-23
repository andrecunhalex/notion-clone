import { BlockData } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface CollaborationConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  documentId: string;
  user: CollaborationUser;
}

// ---------------------------------------------------------------------------
// Cursor position (character-level precision)
// ---------------------------------------------------------------------------

export interface CursorPosition {
  /** Which block the cursor is in */
  blockId: string;
  /** Character offset of the anchor (start of selection or cursor pos) */
  anchorOffset: number;
  /** Character offset of the focus (end of selection, same as anchor if collapsed) */
  focusOffset: number;
}

// ---------------------------------------------------------------------------
// Remote awareness
// ---------------------------------------------------------------------------

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  /** Exact cursor/selection position within the document */
  cursor: CursorPosition | null;
}

// ---------------------------------------------------------------------------
// Supabase document row
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  yjs_state: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Internal events
// ---------------------------------------------------------------------------

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'synced';
