// ---------------------------------------------------------------------------
// Supabase-backed design library
// ---------------------------------------------------------------------------
// Queries design_block_templates and design_clauses for the current workspace
// (pulling the entire workspace so "Do workspace" / "Deste documento" can be
// split client-side) and subscribes to realtime changes.
//
// Every resource always has both workspace_id and document_id set on insert.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../collaboration/supabase-client';
import { sanitizeTemplateHtml } from './sanitizeTemplate';
import type {
  DesignLibraryConfig,
  DesignLibraryInterface,
  LibraryClause,
  LibrarySnapshot,
  LibraryTemplate,
  TemplateInput,
  ClauseInput,
  ClauseItem,
} from './types';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface DbTemplateRow {
  id: string;
  workspace_id: string;
  document_id: string;
  name: string;
  html: string;
  defaults: Record<string, string>;
  autonumber: string | null;
}

interface DbClauseRow {
  id: string;
  workspace_id: string;
  document_id: string;
  name: string;
  items: ClauseItem[];
}

function rowToTemplate(row: DbTemplateRow): LibraryTemplate {
  return {
    id: row.id,
    name: row.name,
    html: row.html,
    defaults: row.defaults ?? {},
    autonumber: (row.autonumber as 'heading' | 'subheading' | null) ?? undefined,
    workspaceId: row.workspace_id,
    documentId: row.document_id,
  };
}

function rowToClause(row: DbClauseRow): LibraryClause {
  return {
    id: row.id,
    name: row.name,
    items: Array.isArray(row.items) ? row.items : [],
    workspaceId: row.workspace_id,
    documentId: row.document_id,
  };
}

export function createSupabaseLibrary(config: DesignLibraryConfig): DesignLibraryInterface {
  const client: SupabaseClient = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
  const { workspaceId, documentId, userId } = config;

  let snapshot: LibrarySnapshot = { templates: [], clauses: [], bootstrapped: false };
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };
  const commit = (next: LibrarySnapshot) => { snapshot = next; notify(); };

  // --- Initial bootstrap fetch -------------------------------------------
  async function bootstrap() {
    const [{ data: tplRows, error: tplErr }, { data: clauseRows, error: clauseErr }] = await Promise.all([
      client.from('design_block_templates').select('*').eq('workspace_id', workspaceId),
      client.from('design_clauses').select('*').eq('workspace_id', workspaceId),
    ]);

    if (tplErr) console.error('[designLibrary] fetch templates failed', tplErr);
    if (clauseErr) console.error('[designLibrary] fetch clauses failed', clauseErr);

    commit({
      templates: (tplRows ?? []).map(rowToTemplate),
      clauses: (clauseRows ?? []).map(rowToClause),
      bootstrapped: true,
    });
  }

  bootstrap();

  // --- Realtime subscription — incremental updates -----------------------
  // We apply postgres_changes payloads directly to the snapshot instead of
  // refetching. This costs zero extra queries per mutation (vs. one full
  // SELECT before) and keeps the snapshot in sync regardless of who made
  // the change (this tab via optimistic update or a remote client).
  function applyTemplateChange(event: 'INSERT' | 'UPDATE' | 'DELETE', newRow?: DbTemplateRow, oldRow?: DbTemplateRow) {
    const id = newRow?.id ?? oldRow?.id;
    if (!id) return;
    if (event === 'DELETE') {
      commit({ ...snapshot, templates: snapshot.templates.filter(t => t.id !== id) });
      return;
    }
    if (!newRow) return;
    const tpl = rowToTemplate(newRow);
    const exists = snapshot.templates.some(t => t.id === id);
    const templates = exists
      ? snapshot.templates.map(t => (t.id === id ? tpl : t))
      : [...snapshot.templates, tpl];
    commit({ ...snapshot, templates });
  }

  function applyClauseChange(event: 'INSERT' | 'UPDATE' | 'DELETE', newRow?: DbClauseRow, oldRow?: DbClauseRow) {
    const id = newRow?.id ?? oldRow?.id;
    if (!id) return;
    if (event === 'DELETE') {
      commit({ ...snapshot, clauses: snapshot.clauses.filter(c => c.id !== id) });
      return;
    }
    if (!newRow) return;
    const clause = rowToClause(newRow);
    const exists = snapshot.clauses.some(c => c.id === id);
    const clauses = exists
      ? snapshot.clauses.map(c => (c.id === id ? clause : c))
      : [...snapshot.clauses, clause];
    commit({ ...snapshot, clauses });
  }

  const channel = client
    .channel(`design-library:${workspaceId}:${documentId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'design_block_templates', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        applyTemplateChange(
          payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          payload.new as DbTemplateRow | undefined,
          payload.old as DbTemplateRow | undefined,
        );
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'design_clauses', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        applyClauseChange(
          payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          payload.new as DbClauseRow | undefined,
          payload.old as DbClauseRow | undefined,
        );
      },
    )
    .subscribe();

  // Channel is torn down by `dispose()` below — the Provider's refcounted
  // cache calls it when the last consumer unmounts. We no longer rely on
  // beforeunload (didn't fire on SPA navigation, leaked sockets).

  let disposed = false;

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getTemplate: (id) => snapshot.templates.find(t => t.id === id),
    getClause: (id) => snapshot.clauses.find(c => c.id === id),

    async createTemplate(input: TemplateInput) {
      const id = input.id ?? generateId('tpl');
      const row = {
        id,
        workspace_id: workspaceId,
        document_id: documentId,
        name: input.name,
        html: sanitizeTemplateHtml(input.html),
        defaults: input.defaults,
        autonumber: input.autonumber ?? null,
        created_by: userId ?? null,
      };
      const { data, error } = await client
        .from('design_block_templates')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      const tpl = rowToTemplate(data);
      commit({ ...snapshot, templates: [...snapshot.templates.filter(t => t.id !== tpl.id), tpl] });
      return tpl;
    },

    async updateTemplate(id, patch) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.html !== undefined) updates.html = sanitizeTemplateHtml(patch.html);
      if (patch.defaults !== undefined) updates.defaults = patch.defaults;
      if (patch.autonumber !== undefined) updates.autonumber = patch.autonumber ?? null;

      const { data, error } = await client
        .from('design_block_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const tpl = rowToTemplate(data);
      commit({ ...snapshot, templates: snapshot.templates.map(t => (t.id === id ? tpl : t)) });
      return tpl;
    },

    async deleteTemplate(id) {
      const { error } = await client.from('design_block_templates').delete().eq('id', id);
      if (error) throw error;
      commit({ ...snapshot, templates: snapshot.templates.filter(t => t.id !== id) });
    },

    async createClause(input: ClauseInput) {
      const id = input.id ?? generateId('clause');
      const row = {
        id,
        workspace_id: workspaceId,
        document_id: documentId,
        name: input.name,
        items: input.items,
        created_by: userId ?? null,
      };
      const { data, error } = await client
        .from('design_clauses')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      const clause = rowToClause(data);
      commit({ ...snapshot, clauses: [...snapshot.clauses.filter(c => c.id !== clause.id), clause] });
      return clause;
    },

    async updateClause(id, patch) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.items !== undefined) updates.items = patch.items;

      const { data, error } = await client
        .from('design_clauses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const clause = rowToClause(data);
      commit({ ...snapshot, clauses: snapshot.clauses.map(c => (c.id === id ? clause : c)) });
      return clause;
    },

    async deleteClause(id) {
      const { error } = await client.from('design_clauses').delete().eq('id', id);
      if (error) throw error;
      commit({ ...snapshot, clauses: snapshot.clauses.filter(c => c.id !== id) });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        channel.unsubscribe();
      } catch (err) {
        console.warn('[designLibrary] channel.unsubscribe failed', err);
      }
      listeners.clear();
    },
  };
}
