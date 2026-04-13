// ---------------------------------------------------------------------------
// In-memory fallback library
// ---------------------------------------------------------------------------
// Used when no designLibraryConfig is provided. Starts empty — the user's
// real templates and clauses live in the DB. This keeps the editor functional
// in local/demo mode without polluting the picker with example blocks.
// ---------------------------------------------------------------------------

import type {
  DesignLibraryInterface,
  LibraryClause,
  LibrarySnapshot,
  LibraryTemplate,
  TemplateInput,
  ClauseInput,
} from './types';

const FALLBACK_WORKSPACE = '__fallback_workspace__';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createFallbackLibrary(documentId: string = '__fallback_doc__'): DesignLibraryInterface {
  let snapshot: LibrarySnapshot = { templates: [], clauses: [] };

  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };
  const commit = (next: LibrarySnapshot) => { snapshot = next; notify(); };

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getTemplate: (id) => snapshot.templates.find(t => t.id === id),
    getClause: (id) => snapshot.clauses.find(c => c.id === id),

    async createTemplate(input: TemplateInput) {
      const tpl: LibraryTemplate = {
        id: input.id ?? generateId('tpl'),
        name: input.name,
        html: input.html,
        defaults: input.defaults,
        autonumber: input.autonumber,
        workspaceId: FALLBACK_WORKSPACE,
        documentId,
      };
      commit({ ...snapshot, templates: [...snapshot.templates, tpl] });
      return tpl;
    },

    async updateTemplate(id, patch) {
      let updated: LibraryTemplate | undefined;
      const templates = snapshot.templates.map(t => {
        if (t.id !== id) return t;
        updated = {
          ...t,
          ...(patch.name !== undefined ? { name: patch.name } : null),
          ...(patch.html !== undefined ? { html: patch.html } : null),
          ...(patch.defaults !== undefined ? { defaults: patch.defaults } : null),
          ...(patch.autonumber !== undefined ? { autonumber: patch.autonumber } : null),
        };
        return updated;
      });
      commit({ ...snapshot, templates });
      if (!updated) throw new Error(`Template ${id} not found`);
      return updated;
    },

    async deleteTemplate(id) {
      commit({ ...snapshot, templates: snapshot.templates.filter(t => t.id !== id) });
    },

    async createClause(input: ClauseInput) {
      const clause: LibraryClause = {
        id: input.id ?? generateId('clause'),
        name: input.name,
        items: input.items,
        workspaceId: FALLBACK_WORKSPACE,
        documentId,
      };
      commit({ ...snapshot, clauses: [...snapshot.clauses, clause] });
      return clause;
    },

    async updateClause(id, patch) {
      let updated: LibraryClause | undefined;
      const clauses = snapshot.clauses.map(c => {
        if (c.id !== id) return c;
        updated = {
          ...c,
          ...(patch.name !== undefined ? { name: patch.name } : null),
          ...(patch.items !== undefined ? { items: patch.items } : null),
        };
        return updated;
      });
      commit({ ...snapshot, clauses });
      if (!updated) throw new Error(`Clause ${id} not found`);
      return updated;
    },

    async deleteClause(id) {
      commit({ ...snapshot, clauses: snapshot.clauses.filter(c => c.id !== id) });
    },
  };
}
