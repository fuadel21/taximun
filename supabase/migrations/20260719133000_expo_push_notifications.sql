-- PR #66 · Real push notification infrastructure

create table if not exists public.taxi_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_role text not null default 'user',
  expo_push_token text not null unique,
  platform text not null default 'unknown',
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_push_devices_role_check check (user_role in ('passenger','driver','admin','user')),
  constraint taxi_push_devices_platform_check check (platform in ('android','ios','web','unknown')),
  constraint taxi_push_devices_token_check check (expo_push_token ~ '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]+\\]$')
);

create index if not exists taxi_push_devices_user_idx
  on public.taxi_push_devices(user_id, enabled);

create table if not exists public.taxi_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.taxi_notifications(id) on delete set null,
  recipient_id text not null,
  push_device_id uuid references public.taxi_push_devices(id) on delete set null,
  provider text not null default 'expo',
  status text not null default 'queued',
  provider_ticket_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint taxi_push_deliveries_status_check check (status in ('queued','sent','failed','disabled'))
);

create index if not exists taxi_push_deliveries_recipient_idx
  on public.taxi_push_deliveries(recipient_id, created_at desc);

alter table public.taxi_push_devices enable row level security;
alter table public.taxi_push_devices force row level security;
alter table public.taxi_push_deliveries enable row level security;
alter table public.taxi_push_deliveries force row level security;

revoke all on public.taxi_push_devices from anon, authenticated;
revoke all on public.taxi_push_deliveries from anon, authenticated;
grant all on public.taxi_push_devices to service_role;
grant all on public.taxi_push_deliveries to service_role;

create or replace function public.taximun_touch_push_device()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_push_devices_touch on public.taxi_push_devices;
create trigger taxi_push_devices_touch
before update on public.taxi_push_devices
for each row execute function public.taximun_touch_push_device();
