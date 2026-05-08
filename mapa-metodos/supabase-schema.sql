create table if not exists public.project_states (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.project_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_states'
      and policyname = 'project_states_public_select'
  ) then
    create policy project_states_public_select
      on public.project_states
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_states'
      and policyname = 'project_states_public_insert'
  ) then
    create policy project_states_public_insert
      on public.project_states
      for insert
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_states'
      and policyname = 'project_states_public_update'
  ) then
    create policy project_states_public_update
      on public.project_states
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_states'
  ) then
    alter publication supabase_realtime add table public.project_states;
  end if;
end $$;
