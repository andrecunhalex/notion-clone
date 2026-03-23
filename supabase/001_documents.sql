-- =============================================================================
-- 001: Documents table (Yjs state persistence)
-- =============================================================================

create table if not exists documents (
  id text primary key,
  yjs_state text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_updated_at on documents (updated_at desc);
