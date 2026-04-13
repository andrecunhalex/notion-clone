-- =============================================================================
-- 007: Design Library RLS — replace permissive policies with workspace ACLs
-- =============================================================================
-- This migration tightens the design library tables for production:
--
--   1. Creates `workspaces` and `workspace_members` so Supabase auth can
--      tell who is allowed to read/write a given workspace's resources.
--      If you already have these tables in your real schema, drop the
--      CREATE blocks and keep only the RLS section.
--
--   2. Drops the permissive "allow_all_for_now" policies from the
--      design_block_templates and design_clauses tables.
--
--   3. Replaces them with policies that use auth.uid() to enforce:
--        SELECT / INSERT / UPDATE / DELETE → only members of the workspace
--
-- After applying this migration, the editor will only return rows for the
-- authenticated user's workspaces. Calls without a session token (anon
-- key alone) get zero rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workspace tables (skip if you already have them)
-- -----------------------------------------------------------------------------

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member', -- 'owner' | 'admin' | 'member' | 'viewer'
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user
  on workspace_members (user_id);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

-- Members can read their workspaces
drop policy if exists "members_select_workspace" on workspaces;
create policy "members_select_workspace"
  on workspaces for select
  using (
    id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- Members can read the membership rows of workspaces they belong to
drop policy if exists "members_select_membership" on workspace_members;
create policy "members_select_membership"
  on workspace_members for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Helper: is the current user a member of this workspace?
-- -----------------------------------------------------------------------------

create or replace function is_workspace_member(target_workspace text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
  );
$$;

-- Allow authenticated users to call the helper
grant execute on function is_workspace_member(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tighten design_block_templates
-- -----------------------------------------------------------------------------

drop policy if exists "allow_all_for_now" on design_block_templates;

create policy "members_select_templates"
  on design_block_templates for select
  using (is_workspace_member(workspace_id));

create policy "members_insert_templates"
  on design_block_templates for insert
  with check (is_workspace_member(workspace_id));

create policy "members_update_templates"
  on design_block_templates for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members_delete_templates"
  on design_block_templates for delete
  using (is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Tighten design_clauses
-- -----------------------------------------------------------------------------

drop policy if exists "allow_all_for_now" on design_clauses;

create policy "members_select_clauses"
  on design_clauses for select
  using (is_workspace_member(workspace_id));

create policy "members_insert_clauses"
  on design_clauses for insert
  with check (is_workspace_member(workspace_id));

create policy "members_update_clauses"
  on design_clauses for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "members_delete_clauses"
  on design_clauses for delete
  using (is_workspace_member(workspace_id));

-- =============================================================================
-- Migration checklist for production
-- =============================================================================
--
--   1. Apply this migration on Supabase (sql editor or CLI).
--
--   2. Backfill workspace_members for existing users:
--        insert into workspace_members (workspace_id, user_id, role)
--        select 'demo-workspace', id, 'owner' from auth.users;
--
--   3. Make sure the editor passes the user's session token to the Supabase
--      client (not just the anon key) — the existing collaboration/auth
--      setup should already do this if you use supabase-js with auth.
--
--   4. Replace the WORKSPACE_ID mock in app/page.tsx with the real workspace
--      id from your auth context.
-- =============================================================================
