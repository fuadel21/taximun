-- Internal notification center for Taximun.
-- Used for driver verification events, admin alerts, ride events and future platform messages.

create extension if not exists pgcrypto;

create table if not exists public.taxi_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null,
  recipient_role text not null default 'user' check (recipient_role in ('passenger', 'driver', 'admin', 'user')),
  actor_id text,
  actor_role text check (actor_role in ('passenger', 'driver', 'admin', 'system')),
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'error', 'document_uploaded', 'document_approved', 'document_rejected', 'driver_approved', 'driver_rejected')),
  title text not null,
  body text,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists taxi_notifications_recipient_unread_idx
on public.taxi_notifications(recipient_id, read_at, created_at desc);

create index if not exists taxi_notifications_role_type_idx
on public.taxi_notifications(recipient_role, type, created_at desc);

alter table public.taxi_notifications enable row level security;

drop policy if exists "notifications select own or admin" on public.taxi_notifications;
create policy "notifications select own or admin"
on public.taxi_notifications
for select
to authenticated
using (
  public.taximun_is_admin()
  or recipient_id = public.taximun_open_id()
);

drop policy if exists "notifications insert own or admin" on public.taxi_notifications;
create policy "notifications insert own or admin"
on public.taxi_notifications
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or recipient_id = public.taximun_open_id()
  or actor_id = public.taximun_open_id()
);

drop policy if exists "notifications update own or admin" on public.taxi_notifications;
create policy "notifications update own or admin"
on public.taxi_notifications
for update
to authenticated
using (
  public.taximun_is_admin()
  or recipient_id = public.taximun_open_id()
)
with check (
  public.taximun_is_admin()
  or recipient_id = public.taximun_open_id()
);

create or replace function public.taximun_notify_admins(
  p_actor_id text,
  p_actor_role text,
  p_type text,
  p_title text,
  p_body text,
  p_action_url text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.taxi_notifications (
    recipient_id,
    recipient_role,
    actor_id,
    actor_role,
    type,
    title,
    body,
    action_url,
    metadata
  )
  select
    p.user_id,
    'admin',
    p_actor_id,
    p_actor_role,
    p_type,
    p_title,
    p_body,
    p_action_url,
    coalesce(p_metadata, '{}'::jsonb)
  from public.taxi_user_profiles p
  where p.role = 'admin';

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.taximun_notify_admins(text, text, text, text, text, text, jsonb) to authenticated, service_role;
