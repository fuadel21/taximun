-- Taximun taxi core schema for the Barcelona pilot.
-- Safe to run multiple times: uses IF NOT EXISTS / DROP POLICY IF EXISTS.

create extension if not exists pgcrypto;

create or replace function public.taximun_open_id()
returns text
language sql
stable
as $$
  select case
    when auth.uid() is null then null
    else 'supabase:' || auth.uid()::text
  end;
$$;

create or replace function public.taximun_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin';
$$;

create table if not exists public.taxi_rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id text not null,
  passenger_name text,
  driver_id text,
  driver_name text,
  taxi_code text,
  plate text,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat numeric(10, 7),
  pickup_lng numeric(10, 7),
  dropoff_lat numeric(10, 7),
  dropoff_lng numeric(10, 7),
  estimated_fare numeric(10, 2) not null default 0,
  estimated_duration integer not null default 0,
  distance_km numeric(10, 2) not null default 0,
  payment_method text not null default 'cash',
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'rejected')),
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_live_status (
  driver_id text primary key,
  driver_name text,
  taxi_code text not null default 'TX-000',
  plate text not null default 'SIN-MAT',
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  current_lat numeric(10, 7),
  current_lng numeric(10, 7),
  current_zone text not null default 'Barcelona',
  total_earnings numeric(10, 2) not null default 0,
  total_rides integer not null default 0,
  rating numeric(3, 2) not null default 5.00,
  updated_at timestamptz not null default now()
);

create table if not exists public.taxi_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_role text not null check (actor_role in ('passenger', 'driver', 'admin', 'system')),
  ride_id uuid references public.taxi_rides(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.taxi_driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  document_type text not null check (document_type in ('identity', 'driver_license', 'taxi_license', 'insurance', 'vehicle_inspection', 'other')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  file_url text,
  expires_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists taxi_rides_passenger_status_idx on public.taxi_rides(passenger_id, status, requested_at desc);
create index if not exists taxi_rides_driver_status_idx on public.taxi_rides(driver_id, status, requested_at desc);
create index if not exists taxi_rides_pending_idx on public.taxi_rides(status, requested_at asc) where status = 'pending';
create index if not exists taxi_rides_pickup_geo_idx on public.taxi_rides(pickup_lat, pickup_lng) where pickup_lat is not null and pickup_lng is not null;
create index if not exists driver_live_status_status_zone_idx on public.driver_live_status(status, current_zone, updated_at desc);
create index if not exists driver_live_status_geo_idx on public.driver_live_status(current_lat, current_lng) where current_lat is not null and current_lng is not null;
create index if not exists taxi_activity_actor_idx on public.taxi_activity_logs(actor_id, created_at desc);
create index if not exists taxi_activity_ride_idx on public.taxi_activity_logs(ride_id, created_at desc);
create index if not exists taxi_driver_documents_driver_idx on public.taxi_driver_documents(driver_id, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_taxi_rides_updated_at on public.taxi_rides;
create trigger set_taxi_rides_updated_at
before update on public.taxi_rides
for each row execute function public.set_updated_at();

drop trigger if exists set_driver_live_status_updated_at on public.driver_live_status;
create trigger set_driver_live_status_updated_at
before update on public.driver_live_status
for each row execute function public.set_updated_at();

drop trigger if exists set_taxi_driver_documents_updated_at on public.taxi_driver_documents;
create trigger set_taxi_driver_documents_updated_at
before update on public.taxi_driver_documents
for each row execute function public.set_updated_at();

alter table public.taxi_rides enable row level security;
alter table public.driver_live_status enable row level security;
alter table public.taxi_activity_logs enable row level security;
alter table public.taxi_driver_documents enable row level security;

drop policy if exists "taxi rides select participant or pending" on public.taxi_rides;
create policy "taxi rides select participant or pending"
on public.taxi_rides
for select
to authenticated
using (
  public.taximun_is_admin()
  or passenger_id = public.taximun_open_id()
  or driver_id = public.taximun_open_id()
  or status = 'pending'
);

drop policy if exists "taxi rides passenger insert own" on public.taxi_rides;
create policy "taxi rides passenger insert own"
on public.taxi_rides
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or passenger_id = public.taximun_open_id()
);

drop policy if exists "taxi rides passenger cancel own" on public.taxi_rides;
create policy "taxi rides passenger cancel own"
on public.taxi_rides
for update
to authenticated
using (
  public.taximun_is_admin()
  or passenger_id = public.taximun_open_id()
  or driver_id = public.taximun_open_id()
)
with check (
  public.taximun_is_admin()
  or passenger_id = public.taximun_open_id()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "driver status readable by authenticated" on public.driver_live_status;
create policy "driver status readable by authenticated"
on public.driver_live_status
for select
to authenticated
using (true);

drop policy if exists "driver status upsert own" on public.driver_live_status;
create policy "driver status upsert own"
on public.driver_live_status
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "driver status update own" on public.driver_live_status;
create policy "driver status update own"
on public.driver_live_status
for update
to authenticated
using (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
)
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "activity select own or admin" on public.taxi_activity_logs;
create policy "activity select own or admin"
on public.taxi_activity_logs
for select
to authenticated
using (
  public.taximun_is_admin()
  or actor_id = public.taximun_open_id()
);

drop policy if exists "activity insert own or admin" on public.taxi_activity_logs;
create policy "activity insert own or admin"
on public.taxi_activity_logs
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or actor_id = public.taximun_open_id()
);

drop policy if exists "driver documents select own or admin" on public.taxi_driver_documents;
create policy "driver documents select own or admin"
on public.taxi_driver_documents
for select
to authenticated
using (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "driver documents insert own" on public.taxi_driver_documents;
create policy "driver documents insert own"
on public.taxi_driver_documents
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "driver documents update admin" on public.taxi_driver_documents;
create policy "driver documents update admin"
on public.taxi_driver_documents
for update
to authenticated
using (public.taximun_is_admin())
with check (public.taximun_is_admin());

create or replace view public.taxi_admin_overview as
select
  (select count(*) from public.taxi_rides where status in ('pending', 'assigned', 'in_progress')) as active_rides,
  (select count(*) from public.driver_live_status where status = 'available') as active_drivers,
  (select coalesce(sum(estimated_fare), 0) from public.taxi_rides where status = 'completed') as completed_revenue,
  (select count(*) from public.taxi_driver_documents where status = 'pending') as pending_documents;
