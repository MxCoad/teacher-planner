-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One row per teacher holds their whole planner. Row-level security means
-- each signed-in user can only ever read or change their own row.

create table if not exists public.planner_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.planner_state enable row level security;

drop policy if exists "Read own planner" on public.planner_state;
create policy "Read own planner" on public.planner_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own planner" on public.planner_state;
create policy "Create own planner" on public.planner_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own planner" on public.planner_state;
create policy "Update own planner" on public.planner_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own planner" on public.planner_state;
create policy "Delete own planner" on public.planner_state
  for delete to authenticated using ((select auth.uid()) = user_id);
