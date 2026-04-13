-- =============================================================================
-- 006: Design Library (reusable design blocks + clauses)
-- =============================================================================
-- Every resource always has BOTH workspace_id and document_id set:
--   * document_id = the document where it was created (origin)
--   * workspace_id = the workspace that owns the origin document
--
-- The picker groups resources into:
--   * "Deste documento" → document_id = currentDocumentId
--   * "Do workspace"    → workspace_id = currentWorkspaceId AND document_id != currentDocumentId
--
-- So a single query `workspace_id = ?` covers both sections; the split is
-- done client-side. Resources are never workspace-only — they always have
-- an origin document.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- design_block_templates
-- -----------------------------------------------------------------------------
create table if not exists design_block_templates (
  id text primary key,
  workspace_id text not null,
  document_id text not null,
  name text not null,
  html text not null,
  defaults jsonb not null default '{}'::jsonb,
  autonumber text, -- 'heading' | 'subheading' | null
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_design_templates_workspace
  on design_block_templates (workspace_id);

create index if not exists idx_design_templates_document
  on design_block_templates (document_id);

-- -----------------------------------------------------------------------------
-- design_clauses
-- -----------------------------------------------------------------------------
-- `items` is an ordered JSONB array: [{ templateId: string, values: Record<string,string> }]
-- templateId is a REFERENCE (clause re-renders with whatever template html is current).
-- values are stored per-item inside the clause (not shared with the template).
-- -----------------------------------------------------------------------------
create table if not exists design_clauses (
  id text primary key,
  workspace_id text not null,
  document_id text not null,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_design_clauses_workspace
  on design_clauses (workspace_id);

create index if not exists idx_design_clauses_document
  on design_clauses (document_id);

-- -----------------------------------------------------------------------------
-- Realtime + RLS (permissive — align with other tables for now)
-- -----------------------------------------------------------------------------
alter table design_block_templates enable row level security;
alter table design_clauses enable row level security;

create policy "allow_all_for_now"
  on design_block_templates for all using (true) with check (true);

create policy "allow_all_for_now"
  on design_clauses for all using (true) with check (true);

-- Add to Supabase Realtime publication (ignore if already there)
do $$
begin
  begin
    alter publication supabase_realtime add table design_block_templates;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table design_clauses;
  exception when duplicate_object then null;
  end;
end $$;
