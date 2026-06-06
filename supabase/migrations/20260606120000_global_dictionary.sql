create extension if not exists pgcrypto;

create table if not exists public.dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('vocabulary', 'spelling')),
  value text,
  original text,
  replacement text,
  pronunciations text,
  intensity numeric,
  language text,
  owner_user_id text not null,
  status text not null default 'pending_user' check (status in ('pending_user', 'approved_global', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  disabled_at timestamptz,
  disabled_by text
);

create table if not exists public.dictionary_audit_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.dictionary_entries(id) on delete set null,
  action text not null,
  actor_user_id text,
  actor_is_admin boolean not null default false,
  before_entry jsonb,
  after_entry jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dictionary_entries_status_idx on public.dictionary_entries(status);
create index if not exists dictionary_entries_owner_idx on public.dictionary_entries(owner_user_id);
create index if not exists dictionary_entries_type_idx on public.dictionary_entries(type);

alter table public.dictionary_entries enable row level security;
alter table public.dictionary_audit_log enable row level security;

grant select, insert, update on public.dictionary_entries to service_role;
grant select, insert, update on public.dictionary_audit_log to service_role;

drop policy if exists "dictionary_entries_no_direct_access" on public.dictionary_entries;
create policy "dictionary_entries_no_direct_access"
on public.dictionary_entries
for all
using (false)
with check (false);

drop policy if exists "dictionary_audit_log_no_direct_access" on public.dictionary_audit_log;
create policy "dictionary_audit_log_no_direct_access"
on public.dictionary_audit_log
for all
using (false)
with check (false);
