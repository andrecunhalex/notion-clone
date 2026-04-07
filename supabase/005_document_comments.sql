-- =============================================================================
-- 005: Document comments (comment threads with replies)
-- =============================================================================
-- Each row represents a comment thread anchored to a specific text range
-- within a block. The `comments` JSONB array contains the thread's entries
-- (initial comment + replies).
-- =============================================================================

create table if not exists document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  block_id text not null,
  selected_text text not null default '',
  comments jsonb not null default '[]',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doc_comments_lookup
  on document_comments (document_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Same permissive pattern as documents table (003_rls_documents.sql).
-- When you add user authentication, replace with restrictive policies:
--
--   CREATE POLICY "owner_select" ON document_comments FOR SELECT
--     USING (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
--   CREATE POLICY "owner_insert" ON document_comments FOR INSERT
--     WITH CHECK (document_id IN (SELECT id FROM documents WHERE owner_id = auth.uid()::text));
-- =============================================================================

alter table document_comments enable row level security;

create policy "allow_all_for_now"
  on document_comments
  for all
  using (true)
  with check (true);
