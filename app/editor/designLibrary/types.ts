// ---------------------------------------------------------------------------
// Design Library types
// ---------------------------------------------------------------------------
// The Design Library is a pluggable source of design block templates + clauses
// (curated sequences of design blocks) backed by Supabase.
//
// Every resource ALWAYS has both `workspaceId` and `documentId` set —
// `documentId` is the origin doc (where the user created it). The picker
// groups resources into two sections:
//   * "Deste documento" → documentId === currentDocumentId
//   * "Do workspace"    → workspaceId === currentWorkspaceId AND documentId !== currentDocumentId
// ---------------------------------------------------------------------------

import type { DesignBlockTemplate } from '../components/designBlocks/registry';

export interface LibraryTemplate extends DesignBlockTemplate {
  workspaceId: string;
  documentId: string;
}

/** A single slot inside a clause: reference to a template + per-slot values */
export interface ClauseItem {
  /** Stable id for React keys / drag-sort inside the editor */
  id: string;
  templateId: string;
  values: Record<string, string>;
}

export interface LibraryClause {
  id: string;
  workspaceId: string;
  documentId: string;
  name: string;
  items: ClauseItem[];
}

export interface LibrarySnapshot {
  templates: LibraryTemplate[];
  clauses: LibraryClause[];
  /** False until the initial fetch completes (or fails). Consumers can use
   *  this to render a loading state instead of "no items found". */
  bootstrapped: boolean;
}

/**
 * Input shapes for create/update. The library implementation fills in
 * workspaceId/documentId from its config — callers never specify scope.
 */
export interface TemplateInput {
  id?: string;
  name: string;
  html: string;
  defaults: Record<string, string>;
  autonumber?: 'heading' | 'subheading';
}

export interface ClauseInput {
  id?: string;
  name: string;
  items: ClauseItem[];
}

export interface DesignLibraryInterface {
  getSnapshot: () => LibrarySnapshot;
  subscribe: (listener: () => void) => () => void;
  getTemplate: (id: string) => LibraryTemplate | undefined;
  getClause: (id: string) => LibraryClause | undefined;
  createTemplate: (input: TemplateInput) => Promise<LibraryTemplate>;
  updateTemplate: (id: string, patch: Partial<TemplateInput>) => Promise<LibraryTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  createClause: (input: ClauseInput) => Promise<LibraryClause>;
  updateClause: (id: string, patch: Partial<ClauseInput>) => Promise<LibraryClause>;
  deleteClause: (id: string) => Promise<void>;
  /** Tear down realtime subscriptions / network resources. Called by the
   *  Provider when no consumers remain. Idempotent. */
  dispose: () => void;
}

export interface DesignLibraryConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  workspaceId: string;
  documentId: string;
  userId?: string;
}
