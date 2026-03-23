-- =============================================================================
-- 003: Enable Row Level Security on documents
-- =============================================================================
-- Currently using anon key without auth — this permissive policy ensures RLS
-- is enabled (defense in depth). When you add user authentication, replace
-- these policies with owner-based access control:
--
--   CREATE POLICY "owner_select" ON documents FOR SELECT
--     USING (owner_id = auth.uid()::text);
--   CREATE POLICY "owner_upsert" ON documents FOR ALL
--     USING (owner_id = auth.uid()::text)
--     WITH CHECK (owner_id = auth.uid()::text);
-- =============================================================================

alter table documents enable row level security;

-- Permissive policy: allows all operations via anon/service key
-- Replace with restrictive policies once auth is implemented
create policy "allow_all_for_now"
  on documents
  for all
  using (true)
  with check (true);
