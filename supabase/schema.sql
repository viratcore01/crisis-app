-- RAPID Crisis Response schema + RLS
-- Run this in Supabase SQL Editor

create extension if not exists "pgcrypto";

create or replace function public.app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    'guest'
  );
$$;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'guest' check (role in ('guest', 'staff', 'manager')),
  property_id uuid references public.properties(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  incident_type text not null,
  status text not null default 'active',
  severity text not null,
  room_number text,
  floor_number integer,
  description text,
  triggered_by text,
  affected_count integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  guest_name text,
  message text,
  incident_type text,
  priority text,
  analysis jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.incidents(id) on delete cascade,
  assigned_to text,
  task_description text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'staff')
  )
  on conflict (id) do update set
    name = excluded.name,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.properties enable row level security;
alter table public.profiles enable row level security;
alter table public.incidents enable row level security;
alter table public.alerts enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "properties_read" on public.properties;
create policy "properties_read"
on public.properties
for select
using (auth.role() = 'authenticated');

drop policy if exists "properties_manage" on public.properties;
create policy "properties_manage"
on public.properties
for insert
with check (public.app_role() = 'manager' and auth.role() = 'authenticated');

drop policy if exists "properties_update" on public.properties;
create policy "properties_update"
on public.properties
for update
using (public.app_role() = 'manager' and auth.role() = 'authenticated')
with check (public.app_role() = 'manager' and auth.role() = 'authenticated');

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles
for select
using (auth.uid() = id or public.app_role() = 'manager');

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
on public.profiles
for update
using (auth.uid() = id or public.app_role() = 'manager')
with check (auth.uid() = id or public.app_role() = 'manager');

drop policy if exists "incidents_read" on public.incidents;
create policy "incidents_read"
on public.incidents
for select
using (
  auth.role() = 'authenticated'
  and (public.app_role() = 'manager' or status = 'active')
);

drop policy if exists "incidents_insert" on public.incidents;
create policy "incidents_insert"
on public.incidents
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "incidents_update" on public.incidents;
create policy "incidents_update"
on public.incidents
for update
using (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'))
with check (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'));

drop policy if exists "alerts_read" on public.alerts;
create policy "alerts_read"
on public.alerts
for select
using (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'));

drop policy if exists "alerts_insert" on public.alerts;
create policy "alerts_insert"
on public.alerts
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read"
on public.tasks
for select
using (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'));

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
on public.tasks
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.app_role() in ('manager', 'staff')
    or (public.app_role() = 'guest' and assigned_to = 'Response Team')
  )
);

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
for update
using (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'))
with check (auth.role() = 'authenticated' and public.app_role() in ('manager', 'staff'));

-- Optional seed property
-- insert into public.properties (name) values ('Grand Plaza Hotel');
