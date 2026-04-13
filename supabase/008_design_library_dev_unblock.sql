-- =============================================================================
-- 008: Dev-only unblock for design library (RUN AFTER 007)
-- =============================================================================
-- Migration 007 enabled strict RLS that requires auth.uid() to match a
-- workspace_members row. The demo setup in `app/page.tsx` still uses the
-- Supabase anon key without signing in, so auth.uid() is NULL and every
-- request is rejected — including loading existing rows and creating new
-- ones (error: "new row violates row-level security policy").
--
-- This migration unblocks local development by:
--
--   1. Inserting the `demo-workspace` row in `workspaces` (so foreign keys
--      and the policies below have something to anchor to).
--
--   2. Adding DEV-ONLY policies that allow ANY caller (including the
--      anon key) to read/write resources whose `workspace_id` is exactly
--      'demo-workspace'. Other workspaces still require real auth via
--      the strict policies from 007 — those are untouched.
--
-- ⚠️  THIS IS DEVELOPMENT-ONLY — REMOVE BEFORE PRODUCTION  ⚠️
--
-- The rollback script at the bottom of this file drops the dev policies.
-- Run it once you've wired up real Supabase Auth in app/page.tsx.
-- See the chat reply for the production migration path.
-- =============================================================================

-- Ensure the demo workspace exists so any future foreign keys work
insert into workspaces (id, name)
values ('demo-workspace', 'Demo Workspace')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- DEV-ONLY policies — anon access scoped to 'demo-workspace' only
-- -----------------------------------------------------------------------------
-- Postgres OR's policies of the same kind (SELECT/INSERT/...). The strict
-- members_* policies from 007 still apply for any other workspace_id —
-- this just adds a permissive escape hatch for the demo workspace.

create policy "dev_demo_select_templates"
  on design_block_templates for select
  using (workspace_id = 'demo-workspace');

create policy "dev_demo_insert_templates"
  on design_block_templates for insert
  with check (workspace_id = 'demo-workspace');

create policy "dev_demo_update_templates"
  on design_block_templates for update
  using (workspace_id = 'demo-workspace')
  with check (workspace_id = 'demo-workspace');

create policy "dev_demo_delete_templates"
  on design_block_templates for delete
  using (workspace_id = 'demo-workspace');

create policy "dev_demo_select_clauses"
  on design_clauses for select
  using (workspace_id = 'demo-workspace');

create policy "dev_demo_insert_clauses"
  on design_clauses for insert
  with check (workspace_id = 'demo-workspace');

create policy "dev_demo_update_clauses"
  on design_clauses for update
  using (workspace_id = 'demo-workspace')
  with check (workspace_id = 'demo-workspace');

create policy "dev_demo_delete_clauses"
  on design_clauses for delete
  using (workspace_id = 'demo-workspace');

-- =============================================================================
-- ROLLBACK before going to production
-- =============================================================================
-- Once you have real auth wired up and have backfilled workspace_members
-- with the relevant uids, run this block to remove the dev escape hatch:
--
-- drop policy if exists "dev_demo_select_templates" on design_block_templates;
-- drop policy if exists "dev_demo_insert_templates" on design_block_templates;
-- drop policy if exists "dev_demo_update_templates" on design_block_templates;
-- drop policy if exists "dev_demo_delete_templates" on design_block_templates;
-- drop policy if exists "dev_demo_select_clauses"   on design_clauses;
-- drop policy if exists "dev_demo_insert_clauses"   on design_clauses;
-- drop policy if exists "dev_demo_update_clauses"   on design_clauses;
-- drop policy if exists "dev_demo_delete_clauses"   on design_clauses;
-- =============================================================================
