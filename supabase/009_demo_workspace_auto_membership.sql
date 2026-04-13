-- =============================================================================
-- 009: Auto-add new auth users to demo-workspace
-- =============================================================================
-- Once you wire up Supabase Auth (anonymous, email, oauth — doesn't matter),
-- every new user gets a row in auth.users. This trigger automatically grants
-- that user membership in 'demo-workspace' so they can use the editor without
-- a manual onboarding step.
--
-- Apply this migration BEFORE removing the dev-only policies from 008. After
-- this is in place, every new sign-in produces a real workspace_members row,
-- so the strict policies from 007 will accept them and you can drop the
-- dev_demo_* policies safely.
--
-- For real production with multiple workspaces, you'll replace this trigger
-- with your invitation/onboarding flow. This is just a local-dev convenience.
-- =============================================================================

-- Backfill any existing auth users that aren't already members
insert into workspace_members (workspace_id, user_id, role)
select 'demo-workspace', id, 'member' from auth.users
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Trigger function — grant demo-workspace membership on user creation
-- -----------------------------------------------------------------------------

create or replace function add_user_to_demo_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into workspace_members (workspace_id, user_id, role)
  values ('demo-workspace', new.id, 'member')
  on conflict do nothing;
  return new;
end;
$$;

-- Drop and recreate so the migration is idempotent
drop trigger if exists on_auth_user_created_add_demo on auth.users;

create trigger on_auth_user_created_add_demo
  after insert on auth.users
  for each row execute function add_user_to_demo_workspace();

-- =============================================================================
-- Migration order summary
-- =============================================================================
-- 006_design_library              → tables
-- 007_design_library_rls          → strict policies + workspace tables
-- 008_design_library_dev_unblock  → dev-only escape hatch (REMOVE before prod)
-- 009 (this)                       → auto-grant demo-workspace membership
--
-- Production rollout sequence:
--   1. Wire up Supabase auth in the client (anon sign-in or real auth)
--   2. Verify every signed-in user gets a workspace_members row (via 009)
--   3. Test that picker still loads + creates work as the auth'd user
--   4. Run the rollback at the bottom of 008 to drop the dev policies
--   5. Confirm anon (no session) requests are now rejected
-- =============================================================================
