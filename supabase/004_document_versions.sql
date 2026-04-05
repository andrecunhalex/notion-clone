-- =============================================================================
-- 004: Document versions (version history snapshots)
-- =============================================================================
-- Each row represents a snapshot of the document at the start of an editing
-- session. A version is only created when the user actually edits — opening
-- a document without editing does not generate a version.
-- =============================================================================

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  blocks jsonb not null,
  meta jsonb not null default '{}',
  user_id text not null,
  user_name text not null,
  user_color text not null default '#3b82f6',
  created_at timestamptz not null default now()
);

create index if not exists idx_doc_versions_lookup
  on document_versions (document_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Same permissive pattern as documents table (003_rls_documents.sql).
-- When you add user authentication, replace with restrictive policies:
--
--   CREATE POLICY "owner_select" ON document_versions FOR SELECT
--     USING (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
--   CREATE POLICY "owner_insert" ON document_versions FOR INSERT
--     WITH CHECK (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
-- =============================================================================

alter table document_versions enable row level security;

create policy "allow_all_for_now"
  on document_versions
  for all
  using (true)
  with check (true);
