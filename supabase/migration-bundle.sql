-- ═══════════════════════════════════════════════════════════════════════
-- Taximun — Paquete completo de migraciones de base de datos
-- Generado: 2026-10-24 02:55 UTC · 65 migraciones
--
-- CÓMO USARLO (proyecto NUEVO de Supabase):
--   1. Crea el proyecto en https://supabase.com (plan gratis vale).
--   2. Dashboard → Database → Extensions → habilita «pg_cron».
--   3. SQL Editor → New query → pega TODO este archivo → Run.
--   4. Espera «Success. No rows returned» (unos segundos).
--   5. Verifica: SELECT count(*) FROM information_schema.tables
--      WHERE table_schema = 'public';  → decenas de tablas taxi_*.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 20260703090000_admin_control_tables.sql
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

create table if not exists public.admin_drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  taxi_code text not null,
  zone text not null default 'Centro',
  status text not null default 'available' check (status in ('available', 'busy', 'pause', 'offline')),
  rating numeric(3, 2) not null default 5.00,
  rides_today integer not null default 0,
  wait_label text not null default 'Nuevo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_taxis (
  id uuid primary key default gen_random_uuid(),
  taxi_code text not null unique,
  plate text not null,
  driver_name text not null default 'Sin asignar',
  model text not null default 'Vehículo pendiente',
  status text not null default 'available' check (status in ('available', 'busy', 'maintenance', 'offline')),
  inspection_date date not null default (current_date + interval '1 year'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null,
  body text not null,
  level text not null default 'medium' check (level in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_drivers_status on public.admin_drivers(status);
create index if not exists idx_admin_drivers_zone on public.admin_drivers(zone);
create index if not exists idx_admin_taxis_status on public.admin_taxis(status);
create index if not exists idx_admin_incidents_status on public.admin_incidents(status);
create index if not exists idx_admin_activity_logs_created_at on public.admin_activity_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_drivers_updated_at on public.admin_drivers;
create trigger set_admin_drivers_updated_at
before update on public.admin_drivers
for each row execute function public.set_updated_at();

drop trigger if exists set_admin_taxis_updated_at on public.admin_taxis;
create trigger set_admin_taxis_updated_at
before update on public.admin_taxis
for each row execute function public.set_updated_at();

alter table public.admin_drivers enable row level security;
alter table public.admin_taxis enable row level security;
alter table public.admin_incidents enable row level security;
alter table public.admin_activity_logs enable row level security;

-- Access is intentionally handled from the backend with the Supabase service role.
-- No browser/client policies are opened here.


-- ─────────────────────────────────────────────────────────────────────
-- 20260703100000_real_taxi_rides.sql
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

create table if not exists public.taxi_rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id text not null,
  passenger_name text not null default 'Pasajero',
  driver_id text,
  driver_name text,
  taxi_code text,
  plate text,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  estimated_fare numeric(10, 2) not null default 0,
  estimated_duration integer not null default 0,
  distance_km numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'rejected')),
  payment_method text not null default 'cash',
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_live_status (
  driver_id text primary key,
  driver_name text not null default 'Conductor',
  taxi_code text not null default 'TX-000',
  plate text not null default 'SIN-MAT',
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  current_lat double precision,
  current_lng double precision,
  current_zone text not null default 'Centro',
  total_earnings numeric(10, 2) not null default 0,
  total_rides integer not null default 0,
  rating numeric(3, 2) not null default 5.00,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.taxi_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_role text not null check (actor_role in ('passenger', 'driver', 'admin', 'system')),
  message text not null,
  ride_id uuid references public.taxi_rides(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_taxi_rides_passenger_id on public.taxi_rides(passenger_id);
create index if not exists idx_taxi_rides_driver_id on public.taxi_rides(driver_id);
create index if not exists idx_taxi_rides_status on public.taxi_rides(status);
create index if not exists idx_taxi_rides_requested_at on public.taxi_rides(requested_at desc);
create index if not exists idx_driver_live_status_status on public.driver_live_status(status);
create index if not exists idx_taxi_activity_logs_actor on public.taxi_activity_logs(actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_taxi_rides_updated_at on public.taxi_rides;
create trigger set_taxi_rides_updated_at
before update on public.taxi_rides
for each row execute function public.set_updated_at();

drop trigger if exists set_driver_live_status_updated_at on public.driver_live_status;
create trigger set_driver_live_status_updated_at
before update on public.driver_live_status
for each row execute function public.set_updated_at();

alter table public.taxi_rides enable row level security;
alter table public.driver_live_status enable row level security;
alter table public.taxi_activity_logs enable row level security;

-- Access is handled through the server-side tRPC API using the Supabase service role.
-- No direct browser/client RLS policies are opened here.


-- ─────────────────────────────────────────────────────────────────────
-- 20260703110000_taxi_user_profiles.sql
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

create table if not exists public.taxi_user_profiles (
  user_id text primary key,
  role text not null check (role in ('passenger', 'driver', 'admin')),
  full_name text not null default '',
  phone text,
  avatar_url text,
  preferred_payment_method text not null default 'cash',
  rating numeric(3, 2) not null default 5.00,
  completed_rides integer not null default 0,
  favorite_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  driver_license_number text,
  taxi_code text,
  plate text,
  vehicle_model text,
  work_zone text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_taxi_user_profiles_role on public.taxi_user_profiles(role);
create index if not exists idx_taxi_user_profiles_phone on public.taxi_user_profiles(phone);
create index if not exists idx_taxi_user_profiles_verified on public.taxi_user_profiles(is_verified);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_taxi_user_profiles_updated_at on public.taxi_user_profiles;
create trigger set_taxi_user_profiles_updated_at
before update on public.taxi_user_profiles
for each row execute function public.set_updated_at();

alter table public.taxi_user_profiles enable row level security;

-- Profiles are managed through server-side tRPC with Supabase service role.


-- ─────────────────────────────────────────────────────────────────────
-- 20260703120000_taxi_safety_reports.sql
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

create table if not exists public.taxi_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  reporter_role text not null check (reporter_role in ('passenger', 'driver', 'admin')),
  ride_id uuid references public.taxi_rides(id) on delete set null,
  category text not null default 'safety' check (category in ('sos', 'safety', 'lost_item', 'route_issue', 'payment_issue', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  title text not null,
  description text,
  lat double precision,
  lng double precision,
  contact_phone text,
  assigned_admin_id text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_taxi_safety_reports_reporter on public.taxi_safety_reports(reporter_id, created_at desc);
create index if not exists idx_taxi_safety_reports_status on public.taxi_safety_reports(status, created_at desc);
create index if not exists idx_taxi_safety_reports_priority on public.taxi_safety_reports(priority, created_at desc);
create index if not exists idx_taxi_safety_reports_ride on public.taxi_safety_reports(ride_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_taxi_safety_reports_updated_at on public.taxi_safety_reports;
create trigger set_taxi_safety_reports_updated_at
before update on public.taxi_safety_reports
for each row execute function public.set_updated_at();

alter table public.taxi_safety_reports enable row level security;

-- Safety reports are managed through server-side tRPC with Supabase service role.


-- ─────────────────────────────────────────────────────────────────────
-- 20260708090000_taximun_taxi_core.sql
-- ─────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────
-- 20260710103000_taximun_driver_verification.sql
-- ─────────────────────────────────────────────────────────────────────
-- Taximun driver verification schema.
-- Keeps driver profiles and documents ready for admin approval.

create extension if not exists pgcrypto;

create table if not exists public.taxi_user_profiles (
  user_id text primary key,
  role text not null default 'passenger' check (role in ('passenger', 'driver', 'admin')),
  full_name text not null,
  phone text,
  avatar_url text,
  preferred_payment_method text not null default 'cash',
  favorite_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  driver_license_number text,
  taxi_code text,
  plate text,
  vehicle_model text,
  work_zone text,
  rating numeric(3, 2) not null default 5.00,
  completed_rides integer not null default 0,
  is_verified boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'in_review', 'approved', 'rejected')),
  verification_note text,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.taxi_user_profiles add column if not exists verification_status text not null default 'pending';
alter table public.taxi_user_profiles add column if not exists verification_note text;
alter table public.taxi_user_profiles add column if not exists verified_by text;
alter table public.taxi_user_profiles add column if not exists verified_at timestamptz;

alter table public.taxi_driver_documents add column if not exists document_number text;
alter table public.taxi_driver_documents add column if not exists title text;
alter table public.taxi_driver_documents add column if not exists issued_at date;

create index if not exists taxi_user_profiles_role_status_idx on public.taxi_user_profiles(role, verification_status, created_at desc);
create index if not exists taxi_user_profiles_driver_lookup_idx on public.taxi_user_profiles(user_id, role, is_verified);
create index if not exists taxi_driver_documents_type_status_idx on public.taxi_driver_documents(document_type, status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_taxi_user_profiles_updated_at on public.taxi_user_profiles;
create trigger set_taxi_user_profiles_updated_at
before update on public.taxi_user_profiles
for each row execute function public.set_updated_at();

alter table public.taxi_user_profiles enable row level security;
alter table public.taxi_driver_documents enable row level security;

drop policy if exists "profiles select own public driver or admin" on public.taxi_user_profiles;
create policy "profiles select own public driver or admin"
on public.taxi_user_profiles
for select
to authenticated
using (
  public.taximun_is_admin()
  or user_id = public.taximun_open_id()
  or role = 'driver'
);

drop policy if exists "profiles insert own" on public.taxi_user_profiles;
create policy "profiles insert own"
on public.taxi_user_profiles
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or user_id = public.taximun_open_id()
);

drop policy if exists "profiles update own or admin" on public.taxi_user_profiles;
create policy "profiles update own or admin"
on public.taxi_user_profiles
for update
to authenticated
using (
  public.taximun_is_admin()
  or user_id = public.taximun_open_id()
)
with check (
  public.taximun_is_admin()
  or user_id = public.taximun_open_id()
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

drop policy if exists "driver documents update own pending or admin" on public.taxi_driver_documents;
create policy "driver documents update own pending or admin"
on public.taxi_driver_documents
for update
to authenticated
using (
  public.taximun_is_admin()
  or (driver_id = public.taximun_open_id() and status in ('pending', 'rejected'))
)
with check (
  public.taximun_is_admin()
  or (driver_id = public.taximun_open_id() and status in ('pending', 'rejected'))
);

create or replace view public.taxi_driver_verification_overview as
select
  p.user_id,
  p.full_name,
  p.phone,
  p.taxi_code,
  p.plate,
  p.vehicle_model,
  p.work_zone,
  p.is_verified,
  p.verification_status,
  p.verification_note,
  p.created_at,
  count(d.id) as total_documents,
  count(d.id) filter (where d.status = 'approved') as approved_documents,
  count(d.id) filter (where d.status = 'pending') as pending_documents,
  count(d.id) filter (where d.status = 'rejected') as rejected_documents
from public.taxi_user_profiles p
left join public.taxi_driver_documents d on d.driver_id = p.user_id
where p.role = 'driver'
group by p.user_id;


-- ─────────────────────────────────────────────────────────────────────
-- 20260710113000_block_unverified_drivers.sql
-- ─────────────────────────────────────────────────────────────────────
-- Block unverified drivers from operating.
-- The backend calls this before allowing online status or ride acceptance.

create or replace function public.taximun_driver_can_operate(p_driver_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.taxi_user_profiles p
    where p.user_id = p_driver_id
      and p.role = 'driver'
      and p.is_verified = true
      and p.verification_status = 'approved'
  );
$$;

create or replace function public.taximun_driver_operation_message(p_driver_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver'
    ) then 'Completa tu perfil profesional antes de ponerte online.'
    when exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver' and p.verification_status = 'rejected'
    ) then 'Tu verificación fue rechazada. Revisa la nota del administrador y vuelve a enviar la documentación.'
    when exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver' and p.verification_status = 'in_review'
    ) then 'Tu documentación está en revisión. Aún no puedes operar.'
    else 'Tu cuenta de conductor todavía no está verificada.'
  end;
$$;

grant execute on function public.taximun_driver_can_operate(text) to authenticated, service_role;
grant execute on function public.taximun_driver_operation_message(text) to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260710123000_driver_document_storage.sql
-- ─────────────────────────────────────────────────────────────────────
-- Private Supabase Storage bucket for driver verification documents.
-- Object paths are stored as: <auth.uid>/<document-type>/<timestamp>-<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'taxi-driver-documents',
  'taxi-driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.taxi_driver_documents add column if not exists storage_bucket text;
alter table public.taxi_driver_documents add column if not exists storage_path text;
alter table public.taxi_driver_documents add column if not exists mime_type text;
alter table public.taxi_driver_documents add column if not exists file_size_bytes integer;

create index if not exists taxi_driver_documents_storage_idx
on public.taxi_driver_documents(storage_bucket, storage_path)
where storage_path is not null;

-- Reset policies so this migration is safe to re-run.
drop policy if exists "driver docs upload own folder" on storage.objects;
drop policy if exists "driver docs read own folder or admin" on storage.objects;
drop policy if exists "driver docs update own folder or admin" on storage.objects;
drop policy if exists "driver docs delete own folder or admin" on storage.objects;

create policy "driver docs upload own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'taxi-driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "driver docs read own folder or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);

create policy "driver docs update own folder or admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
)
with check (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);

create policy "driver docs delete own folder or admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);


-- ─────────────────────────────────────────────────────────────────────
-- 20260710133000_internal_notifications.sql
-- ─────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────
-- 20260710143000_transactional_ride_acceptance.sql
-- ─────────────────────────────────────────────────────────────────────
-- Transactional ride acceptance for Taximun.
-- Prevents two drivers accepting the same ride and prevents one driver accepting multiple active rides.
-- Also tracks per-driver rejections so one driver declining does not cancel the ride for everyone.

create table if not exists public.taxi_ride_rejections (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create index if not exists taxi_ride_rejections_driver_idx
on public.taxi_ride_rejections(driver_id, created_at desc);

create index if not exists taxi_ride_rejections_ride_idx
on public.taxi_ride_rejections(ride_id, created_at desc);

alter table public.taxi_ride_rejections enable row level security;

drop policy if exists "ride rejections select own or admin" on public.taxi_ride_rejections;
create policy "ride rejections select own or admin"
on public.taxi_ride_rejections
for select
to authenticated
using (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "ride rejections insert own or admin" on public.taxi_ride_rejections;
create policy "ride rejections insert own or admin"
on public.taxi_ride_rejections
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

create unique index if not exists taxi_rides_one_active_per_driver_idx
on public.taxi_rides(driver_id)
where driver_id is not null and status in ('assigned', 'in_progress');

create or replace function public.taximun_find_pending_rides_for_driver(p_driver_id text)
returns setof public.taxi_rides
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.taxi_rides r
  where r.status = 'pending'
    and r.passenger_id <> p_driver_id
    and not exists (
      select 1
      from public.taxi_ride_rejections rr
      where rr.ride_id = r.id
        and rr.driver_id = p_driver_id
    )
  order by r.requested_at asc
  limit 20;
$$;

create or replace function public.taximun_accept_ride_transactional(
  p_ride_id uuid,
  p_driver_id text,
  p_driver_name text,
  p_taxi_code text,
  p_plate text
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver_is_busy boolean := false;
  v_driver_has_active_ride boolean := false;
begin
  -- Serialize accept attempts by the same driver.
  perform pg_advisory_xact_lock(hashtext('taximun-driver-accept:' || p_driver_id));

  if not public.taximun_driver_can_operate(p_driver_id) then
    raise exception 'DRIVER_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.taxi_rides r
    where r.driver_id = p_driver_id
      and r.status in ('assigned', 'in_progress')
  ) into v_driver_has_active_ride;

  if v_driver_has_active_ride then
    raise exception 'DRIVER_ALREADY_HAS_ACTIVE_RIDE' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.driver_live_status d
    where d.driver_id = p_driver_id
      and d.status = 'busy'
  ) into v_driver_is_busy;

  if v_driver_is_busy then
    raise exception 'DRIVER_IS_BUSY' using errcode = 'P0001';
  end if;

  -- Lock this ride row so only one accept can win.
  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_ride.status <> 'pending' then
    raise exception 'RIDE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_ride.passenger_id = p_driver_id then
    raise exception 'DRIVER_CANNOT_ACCEPT_OWN_RIDE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.taxi_ride_rejections rr
    where rr.ride_id = p_ride_id
      and rr.driver_id = p_driver_id
  ) then
    raise exception 'DRIVER_ALREADY_REJECTED_RIDE' using errcode = 'P0001';
  end if;

  update public.taxi_rides
  set
    driver_id = p_driver_id,
    driver_name = coalesce(nullif(p_driver_name, ''), 'Conductor'),
    taxi_code = coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    plate = coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    status = 'assigned',
    assigned_at = now()
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    taxi_code,
    plate,
    status,
    current_zone
  ) values (
    p_driver_id,
    coalesce(nullif(p_driver_name, ''), 'Conductor'),
    coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    'busy',
    'Barcelona'
  )
  on conflict (driver_id) do update
  set
    driver_name = excluded.driver_name,
    taxi_code = excluded.taxi_code,
    plate = excluded.plate,
    status = 'busy',
    updated_at = now();

  return v_ride;
end;
$$;

grant execute on function public.taximun_find_pending_rides_for_driver(text) to authenticated, service_role;
grant execute on function public.taximun_accept_ride_transactional(uuid, text, text, text, text) to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260710203000_ride_service_fare_metadata.sql
-- ─────────────────────────────────────────────────────────────────────
-- Store passenger-selected service and fare-estimation metadata on taxi rides.
-- This keeps the request auditable for passenger, driver and admin views.

alter table public.taxi_rides
  add column if not exists service_type text not null default 'taxi',
  add column if not exists fare_range_min numeric(10,2),
  add column if not exists fare_range_max numeric(10,2),
  add column if not exists fare_breakdown jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxi_rides_service_type_check'
      and conrelid = 'public.taxi_rides'::regclass
  ) then
    alter table public.taxi_rides
      add constraint taxi_rides_service_type_check
      check (service_type in ('taxi', 'eco', 'van'));
  end if;
end $$;

create index if not exists taxi_rides_service_type_idx
on public.taxi_rides(service_type, requested_at desc);


-- ─────────────────────────────────────────────────────────────────────
-- 20260711074500_passenger_ride_ratings.sql
-- ─────────────────────────────────────────────────────────────────────
-- Passenger post-trip ratings for completed taxi rides.

alter table public.taxi_user_profiles
  add column if not exists rating numeric(3,2) not null default 5.00,
  add column if not exists rating_count integer not null default 0;

create table if not exists public.taxi_ride_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  passenger_id text not null,
  driver_id text not null,
  score integer not null check (score between 1 and 5),
  comment text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_ride_ratings_one_per_passenger unique (ride_id, passenger_id)
);

create index if not exists taxi_ride_ratings_driver_created_idx
  on public.taxi_ride_ratings(driver_id, created_at desc);

create index if not exists taxi_ride_ratings_passenger_created_idx
  on public.taxi_ride_ratings(passenger_id, created_at desc);

alter table public.taxi_ride_ratings enable row level security;

-- The application server normally writes with service_role. These policies also
-- keep direct authenticated access restricted to participants and admins.
drop policy if exists ratings_participants_select on public.taxi_ride_ratings;
create policy ratings_participants_select
  on public.taxi_ride_ratings
  for select
  to authenticated
  using (
    taxi_ride_ratings.passenger_id = 'supabase:' || auth.uid()::text
    or taxi_ride_ratings.driver_id = 'supabase:' || auth.uid()::text
    or exists (
      select 1 from public.taxi_user_profiles p
      where p.user_id = 'supabase:' || auth.uid()::text
        and p.role = 'admin'
    )
  );

drop policy if exists ratings_passenger_insert on public.taxi_ride_ratings;
create policy ratings_passenger_insert
  on public.taxi_ride_ratings
  for insert
  to authenticated
  with check (
    taxi_ride_ratings.passenger_id = 'supabase:' || auth.uid()::text
    and exists (
      select 1 from public.taxi_rides r
      where r.id = taxi_ride_ratings.ride_id
        and r.passenger_id = taxi_ride_ratings.passenger_id
        and r.driver_id = taxi_ride_ratings.driver_id
        and r.status = 'completed'
    )
  );

grant select, insert on public.taxi_ride_ratings to authenticated;
grant all on public.taxi_ride_ratings to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260714101500_driver_trip_settlement.sql
-- ─────────────────────────────────────────────────────────────────────
-- Professional trip settlement recorded by the assigned driver before completion.

alter table public.taxi_rides
  add column if not exists final_fare numeric(10,2),
  add column if not exists payment_status text not null default 'pending',
  add column if not exists settlement_notes text,
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'taxi_rides_payment_status_check'
      and conrelid = 'public.taxi_rides'::regclass
  ) then
    alter table public.taxi_rides
      add constraint taxi_rides_payment_status_check
      check (payment_status in ('pending', 'paid', 'failed', 'waived'));
  end if;
end $$;

create index if not exists taxi_rides_driver_settlement_idx
  on public.taxi_rides(driver_id, payment_status, completed_at desc);

create or replace function public.taximun_require_settlement_before_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.final_fare is null or new.final_fare < 0 then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: final fare missing';
    end if;
    if new.payment_status not in ('paid', 'waived') then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: payment not confirmed';
    end if;
    if new.settled_at is null or new.settled_by is null then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: settlement metadata missing';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_require_settlement on public.taxi_rides;
create trigger trg_taximun_require_settlement
before update of status on public.taxi_rides
for each row
execute function public.taximun_require_settlement_before_completion();


-- ─────────────────────────────────────────────────────────────────────
-- 20260715103000_smart_ride_offers.sql
-- ─────────────────────────────────────────────────────────────────────
-- Smart, auditable ride offers with 20-second expiry and nearest-driver ranking.

alter table public.driver_live_status
  add column if not exists last_offer_at timestamptz,
  add column if not exists offers_received integer not null default 0,
  add column if not exists offers_accepted integer not null default 0,
  add column if not exists offers_rejected integer not null default 0,
  add column if not exists offers_expired integer not null default 0;

create table if not exists public.taxi_ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  status text not null default 'pending',
  rank_score numeric(12,4),
  distance_to_pickup_km numeric(10,2),
  eta_to_pickup_minutes integer,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_ride_offers_status_check
    check (status in ('pending','accepted','rejected','expired','cancelled'))
);

create unique index if not exists taxi_ride_offers_one_pending_per_ride
  on public.taxi_ride_offers(ride_id)
  where status = 'pending';

create unique index if not exists taxi_ride_offers_one_pending_per_driver
  on public.taxi_ride_offers(driver_id)
  where status = 'pending';

create index if not exists taxi_ride_offers_driver_status_idx
  on public.taxi_ride_offers(driver_id, status, expires_at desc);

create index if not exists taxi_ride_offers_ride_created_idx
  on public.taxi_ride_offers(ride_id, created_at desc);

alter table public.taxi_ride_offers enable row level security;

drop policy if exists taxi_ride_offers_participant_select on public.taxi_ride_offers;
create policy taxi_ride_offers_participant_select
  on public.taxi_ride_offers
  for select
  to authenticated
  using (
    driver_id = 'supabase:' || auth.uid()::text
    or exists (
      select 1 from public.taxi_rides r
      where r.id = taxi_ride_offers.ride_id
        and r.passenger_id = 'supabase:' || auth.uid()::text
    )
    or exists (
      select 1 from public.taxi_user_profiles p
      where p.user_id = 'supabase:' || auth.uid()::text
        and p.role = 'admin'
    )
  );

grant select on public.taxi_ride_offers to authenticated;
grant all on public.taxi_ride_offers to service_role;

create or replace function public.taximun_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      )
    )
  end;
$$;

create or replace function public.taximun_expire_ride_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.taxi_ride_offers
    set status = 'expired',
        responded_at = now(),
        response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
        updated_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning driver_id
  ), aggregated as (
    select driver_id, count(*)::integer as amount
    from expired
    group by driver_id
  )
  update public.driver_live_status d
  set offers_expired = coalesce(d.offers_expired, 0) + aggregated.amount
  from aggregated
  where d.driver_id = aggregated.driver_id;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.taximun_claim_smart_offer(p_driver_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_offer record;
  candidate_ride record;
  best_driver record;
  created_offer record;
  driver_row record;
  distance_km double precision;
  eta_minutes integer;
begin
  perform public.taximun_expire_ride_offers();

  select o.*, r.pickup_address, r.dropoff_address, r.estimated_fare,
         r.estimated_duration, r.distance_km as trip_distance_km,
         r.payment_method, r.service_type, r.passenger_name,
         r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng
  into existing_offer
  from public.taxi_ride_offers o
  join public.taxi_rides r on r.id = o.ride_id
  where o.driver_id = p_driver_id
    and o.status = 'pending'
    and o.expires_at > now()
  order by o.offered_at desc
  limit 1;

  if found then
    return to_jsonb(existing_offer);
  end if;

  select d.*
  into driver_row
  from public.driver_live_status d
  join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
  where d.driver_id = p_driver_id
    and d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and d.updated_at >= now() - interval '2 minutes'
    and p.is_verified = true
    and not exists (
      select 1 from public.taxi_rides ar
      where ar.driver_id = p_driver_id
        and ar.status in ('assigned','in_progress')
    )
  limit 1;

  if not found then
    return null;
  end if;

  select r.*
  into candidate_ride
  from public.taxi_rides r
  where r.status = 'pending'
    and r.pickup_lat is not null
    and r.pickup_lng is not null
    and not exists (
      select 1 from public.taxi_ride_offers active_offer
      where active_offer.ride_id = r.id
        and active_offer.status = 'pending'
        and active_offer.expires_at > now()
    )
    and not exists (
      select 1 from public.taxi_ride_offers prior
      where prior.ride_id = r.id
        and prior.driver_id = p_driver_id
        and prior.status in ('rejected','expired')
    )
  order by r.requested_at asc
  limit 1;

  if not found then
    return null;
  end if;

  select ranked.*
  into best_driver
  from (
    select d.driver_id,
           public.taximun_distance_km(
             d.current_lat::double precision,
             d.current_lng::double precision,
             candidate_ride.pickup_lat::double precision,
             candidate_ride.pickup_lng::double precision
           ) as pickup_distance,
           (
             coalesce(public.taximun_distance_km(
               d.current_lat::double precision,
               d.current_lng::double precision,
               candidate_ride.pickup_lat::double precision,
               candidate_ride.pickup_lng::double precision
             ), 999) * 10
             - coalesce(p.rating::double precision, 5) * 0.5
             - least(extract(epoch from (now() - coalesce(d.last_offer_at, d.updated_at))) / 60, 120) * 0.03
             + case
                 when coalesce(d.offers_received, 0) = 0 then 0
                 else (1 - coalesce(d.offers_accepted, 0)::double precision / greatest(d.offers_received, 1)) * 2
               end
           ) as rank_score
    from public.driver_live_status d
    join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null
      and d.updated_at >= now() - interval '2 minutes'
      and p.is_verified = true
      and not exists (
        select 1 from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in ('assigned','in_progress')
      )
      and not exists (
        select 1 from public.taxi_ride_offers prior
        where prior.ride_id = candidate_ride.id
          and prior.driver_id = d.driver_id
          and prior.status in ('rejected','expired')
      )
  ) ranked
  where ranked.pickup_distance is null or ranked.pickup_distance <= 15
  order by ranked.rank_score asc, ranked.pickup_distance asc nulls last
  limit 1;

  if not found or best_driver.driver_id <> p_driver_id then
    return null;
  end if;

  distance_km := best_driver.pickup_distance;
  eta_minutes := case
    when distance_km is null then null
    else greatest(2, ceil((distance_km / 22.0) * 60 + 2)::integer)
  end;

  insert into public.taxi_ride_offers (
    ride_id, driver_id, status, rank_score,
    distance_to_pickup_km, eta_to_pickup_minutes,
    offered_at, expires_at, metadata
  ) values (
    candidate_ride.id,
    p_driver_id,
    'pending',
    best_driver.rank_score,
    case when distance_km is null then null else round(distance_km::numeric, 2) end,
    eta_minutes,
    now(),
    now() + interval '20 seconds',
    jsonb_build_object('engine', 'smart_v1', 'radius_km', 15)
  )
  returning * into created_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received = coalesce(offers_received, 0) + 1
  where driver_id = p_driver_id;

  return to_jsonb(created_offer) || jsonb_build_object(
    'pickup_address', candidate_ride.pickup_address,
    'dropoff_address', candidate_ride.dropoff_address,
    'estimated_fare', candidate_ride.estimated_fare,
    'estimated_duration', candidate_ride.estimated_duration,
    'trip_distance_km', candidate_ride.distance_km,
    'payment_method', candidate_ride.payment_method,
    'service_type', candidate_ride.service_type,
    'passenger_name', candidate_ride.passenger_name,
    'pickup_lat', candidate_ride.pickup_lat,
    'pickup_lng', candidate_ride.pickup_lng,
    'dropoff_lat', candidate_ride.dropoff_lat,
    'dropoff_lng', candidate_ride.dropoff_lng
  );
exception
  when unique_violation then
    return null;
end;
$$;

create or replace function public.taximun_accept_smart_offer(
  p_offer_id uuid,
  p_driver_id text,
  p_driver_name text,
  p_taxi_code text,
  p_plate text
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.taxi_ride_offers%rowtype;
  ride_row public.taxi_rides%rowtype;
begin
  perform public.taximun_expire_ride_offers();

  select * into offer_row
  from public.taxi_ride_offers
  where id = p_offer_id
  for update;

  if not found or offer_row.driver_id <> p_driver_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;
  if offer_row.status <> 'pending' or offer_row.expires_at <= now() then
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into ride_row
  from public.taxi_rides
  where id = offer_row.ride_id
  for update;

  if not found or ride_row.status <> 'pending' then
    raise exception 'RIDE_NOT_AVAILABLE';
  end if;

  update public.taxi_ride_offers
  set status = 'accepted',
      responded_at = now(),
      response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
      updated_at = now()
  where id = p_offer_id;

  update public.taxi_ride_offers
  set status = 'cancelled', updated_at = now()
  where ride_id = ride_row.id
    and id <> p_offer_id
    and status = 'pending';

  update public.taxi_rides
  set status = 'assigned',
      driver_id = p_driver_id,
      driver_name = p_driver_name,
      taxi_code = p_taxi_code,
      plate = p_plate,
      assigned_at = now()
  where id = ride_row.id
  returning * into ride_row;

  update public.driver_live_status
  set status = 'busy',
      offers_accepted = coalesce(offers_accepted, 0) + 1,
      updated_at = now()
  where driver_id = p_driver_id;

  return ride_row;
end;
$$;

create or replace function public.taximun_reject_smart_offer(
  p_offer_id uuid,
  p_driver_id text,
  p_reason text default 'driver_declined'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.taxi_ride_offers
  set status = case when expires_at <= now() then 'expired' else 'rejected' end,
      responded_at = now(),
      response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
      metadata = metadata || jsonb_build_object('reason', p_reason),
      updated_at = now()
  where id = p_offer_id
    and driver_id = p_driver_id
    and status = 'pending';

  get diagnostics changed = row_count;

  if changed > 0 then
    update public.driver_live_status
    set offers_rejected = coalesce(offers_rejected, 0) + 1,
        updated_at = now()
    where driver_id = p_driver_id;
  end if;

  return changed > 0;
end;
$$;

grant execute on function public.taximun_claim_smart_offer(text) to service_role;
grant execute on function public.taximun_accept_smart_offer(uuid,text,text,text,text) to service_role;
grant execute on function public.taximun_reject_smart_offer(uuid,text,text) to service_role;
grant execute on function public.taximun_expire_ride_offers() to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260715103500_enforce_smart_offer_assignment.sql
-- ─────────────────────────────────────────────────────────────────────
-- Prevent any legacy endpoint from assigning a ride without an accepted smart offer.

create or replace function public.taximun_require_accepted_offer_before_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'assigned' and old.status is distinct from 'assigned' then
    if new.driver_id is null or not exists (
      select 1
      from public.taxi_ride_offers o
      where o.ride_id = new.id
        and o.driver_id = new.driver_id
        and o.status = 'accepted'
    ) then
      raise exception 'SMART_OFFER_REQUIRED: ride must be accepted through an active offer';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_require_smart_offer on public.taxi_rides;
create trigger trg_taximun_require_smart_offer
before update of status on public.taxi_rides
for each row
execute function public.taximun_require_accepted_offer_before_assignment();


-- ─────────────────────────────────────────────────────────────────────
-- 20260716012000_smart_offer_recovery_audit.sql
-- ─────────────────────────────────────────────────────────────────────
-- Recovery, reconciliation and health diagnostics for smart ride offers.

create or replace function public.taximun_cancel_offers_for_unavailable_ride()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.taxi_ride_offers
    set status = case when new.status = 'assigned' then status else 'cancelled' end,
        responded_at = coalesce(responded_at, now()),
        metadata = metadata || jsonb_build_object('cancel_reason', 'ride_' || new.status),
        updated_at = now()
    where ride_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_cancel_offers_for_ride on public.taxi_rides;
create trigger trg_taximun_cancel_offers_for_ride
after update of status on public.taxi_rides
for each row
execute function public.taximun_cancel_offers_for_unavailable_ride();

create or replace function public.taximun_reconcile_dispatch_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_offers integer := 0;
  unavailable_ride_offers integer := 0;
  ineligible_driver_offers integer := 0;
  restored_drivers integer := 0;
begin
  with changed as (
    update public.taxi_ride_offers
    set status = 'expired',
        responded_at = coalesce(responded_at, now()),
        response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
        metadata = metadata || jsonb_build_object('reconciled', true, 'reason', 'expired'),
        updated_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning driver_id
  ), stats as (
    select driver_id, count(*)::integer amount
    from changed
    group by driver_id
  ), driver_updates as (
    update public.driver_live_status d
    set offers_expired = coalesce(d.offers_expired, 0) + stats.amount
    from stats
    where d.driver_id = stats.driver_id
    returning d.driver_id
  )
  select count(*) into expired_offers from changed;

  with changed as (
    update public.taxi_ride_offers o
    set status = 'cancelled',
        responded_at = coalesce(o.responded_at, now()),
        metadata = o.metadata || jsonb_build_object('reconciled', true, 'reason', 'ride_unavailable'),
        updated_at = now()
    from public.taxi_rides r
    where o.ride_id = r.id
      and o.status = 'pending'
      and r.status <> 'pending'
    returning o.id
  )
  select count(*) into unavailable_ride_offers from changed;

  with changed as (
    update public.taxi_ride_offers o
    set status = 'cancelled',
        responded_at = coalesce(o.responded_at, now()),
        metadata = o.metadata || jsonb_build_object('reconciled', true, 'reason', 'driver_ineligible'),
        updated_at = now()
    where o.status = 'pending'
      and exists (
        select 1
        from public.driver_live_status d
        where d.driver_id = o.driver_id
          and (
            d.status <> 'available'
            or d.current_lat is null
            or d.current_lng is null
            or d.updated_at < now() - interval '2 minutes'
          )
      )
    returning o.id
  )
  select count(*) into ineligible_driver_offers from changed;

  with changed as (
    update public.driver_live_status d
    set status = 'available', updated_at = now()
    where d.status = 'busy'
      and not exists (
        select 1 from public.taxi_rides r
        where r.driver_id = d.driver_id
          and r.status in ('assigned','in_progress')
      )
    returning d.driver_id
  )
  select count(*) into restored_drivers from changed;

  return jsonb_build_object(
    'expiredOffers', expired_offers,
    'unavailableRideOffers', unavailable_ride_offers,
    'ineligibleDriverOffers', ineligible_driver_offers,
    'restoredDrivers', restored_drivers,
    'reconciledAt', now()
  );
end;
$$;

create or replace function public.taximun_dispatch_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pendingRides', (select count(*) from public.taxi_rides where status = 'pending'),
    'stalePendingRides', (select count(*) from public.taxi_rides where status = 'pending' and requested_at < now() - interval '30 minutes'),
    'pendingOffers', (select count(*) from public.taxi_ride_offers where status = 'pending'),
    'expiredButPendingOffers', (select count(*) from public.taxi_ride_offers where status = 'pending' and expires_at <= now()),
    'offersForUnavailableRides', (
      select count(*) from public.taxi_ride_offers o
      join public.taxi_rides r on r.id = o.ride_id
      where o.status = 'pending' and r.status <> 'pending'
    ),
    'offersForStaleDrivers', (
      select count(*) from public.taxi_ride_offers o
      join public.driver_live_status d on d.driver_id = o.driver_id
      where o.status = 'pending'
        and (d.status <> 'available' or d.updated_at < now() - interval '2 minutes')
    ),
    'availableDrivers', (
      select count(*) from public.driver_live_status d
      join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
      where d.status = 'available'
        and d.current_lat is not null
        and d.current_lng is not null
        and d.updated_at >= now() - interval '2 minutes'
        and p.is_verified = true
    ),
    'checkedAt', now()
  );
$$;

grant execute on function public.taximun_reconcile_dispatch_state() to service_role;
grant execute on function public.taximun_dispatch_health() to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260716024500_advanced_live_trip_tracking.sql
-- ─────────────────────────────────────────────────────────────────────
-- Advanced live-trip phases and secure share token.

alter table public.taxi_rides
  add column if not exists driver_arrived_at timestamptz,
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists share_enabled boolean not null default true;

create unique index if not exists taxi_rides_share_token_uidx
  on public.taxi_rides(share_token);

create index if not exists taxi_rides_arrival_tracking_idx
  on public.taxi_rides(driver_id, driver_arrived_at, status)
  where status in ('assigned', 'in_progress');


-- ─────────────────────────────────────────────────────────────────────
-- 20260716033000_secure_trip_chat.sql
-- ─────────────────────────────────────────────────────────────────────
-- Secure driver-passenger chat scoped to a taxi ride.

create table if not exists public.taxi_trip_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('driver', 'passenger', 'admin')),
  message text not null check (char_length(message) between 1 and 500),
  message_type text not null default 'text' check (message_type in ('text', 'quick', 'system')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists taxi_trip_messages_ride_created_idx
  on public.taxi_trip_messages(ride_id, created_at);

create index if not exists taxi_trip_messages_unread_idx
  on public.taxi_trip_messages(ride_id, read_at)
  where read_at is null;

alter table public.taxi_trip_messages enable row level security;
alter table public.taxi_trip_messages force row level security;

drop policy if exists taxi_trip_messages_participants_select on public.taxi_trip_messages;
create policy taxi_trip_messages_participants_select
on public.taxi_trip_messages for select
to authenticated
using (
  exists (
    select 1 from public.taxi_rides r
    where r.id = ride_id
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
);

drop policy if exists taxi_trip_messages_participants_insert on public.taxi_trip_messages;
create policy taxi_trip_messages_participants_insert
on public.taxi_trip_messages for insert
to authenticated
with check (
  sender_id = auth.uid()::text
  and exists (
    select 1 from public.taxi_rides r
    where r.id = ride_id
      and r.status in ('assigned', 'in_progress')
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
);

drop policy if exists taxi_trip_messages_participants_update on public.taxi_trip_messages;
create policy taxi_trip_messages_participants_update
on public.taxi_trip_messages for update
to authenticated
using (
  exists (
    select 1 from public.taxi_rides r
    where r.id = ride_id
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
)
with check (
  exists (
    select 1 from public.taxi_rides r
    where r.id = ride_id
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
);

grant select, insert, update on public.taxi_trip_messages to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260717002000_secure_trip_call_requests.sql
-- ─────────────────────────────────────────────────────────────────────
-- Secure call requests between driver and passenger without exposing phone numbers.
create table if not exists public.taxi_trip_call_requests (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  requester_id text not null,
  requester_role text not null check (requester_role in ('driver','passenger')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed')),
  reason text not null default 'contact' check (reason in ('contact','pickup','delay','emergency')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '2 minutes')
);
create index if not exists taxi_trip_call_requests_ride_created_idx on public.taxi_trip_call_requests(ride_id, created_at desc);
create unique index if not exists taxi_trip_call_requests_one_pending_idx on public.taxi_trip_call_requests(ride_id) where status='pending';
alter table public.taxi_trip_call_requests enable row level security;
alter table public.taxi_trip_call_requests force row level security;
drop policy if exists taxi_trip_call_requests_participants_select on public.taxi_trip_call_requests;
create policy taxi_trip_call_requests_participants_select on public.taxi_trip_call_requests for select to authenticated using (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
drop policy if exists taxi_trip_call_requests_participants_insert on public.taxi_trip_call_requests;
create policy taxi_trip_call_requests_participants_insert on public.taxi_trip_call_requests for insert to authenticated with check (requester_id=auth.uid()::text and exists (select 1 from public.taxi_rides r where r.id=ride_id and r.status in ('assigned','in_progress') and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
drop policy if exists taxi_trip_call_requests_participants_update on public.taxi_trip_call_requests;
create policy taxi_trip_call_requests_participants_update on public.taxi_trip_call_requests for update to authenticated using (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text))) with check (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
grant select,insert,update on public.taxi_trip_call_requests to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 20260717004500_temporary_audio_rooms.sql
-- ─────────────────────────────────────────────────────────────────────
-- Temporary in-app audio rooms linked to accepted trip call requests.
create table if not exists public.taxi_trip_audio_rooms (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  call_request_id uuid not null references public.taxi_trip_call_requests(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','active','ended','expired')),
  created_by text not null,
  driver_joined_at timestamptz,
  passenger_joined_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  unique(call_request_id)
);
create index if not exists taxi_trip_audio_rooms_ride_created_idx on public.taxi_trip_audio_rooms(ride_id, created_at desc);
alter table public.taxi_trip_audio_rooms enable row level security;
alter table public.taxi_trip_audio_rooms force row level security;
drop policy if exists taxi_trip_audio_rooms_participants_select on public.taxi_trip_audio_rooms;
create policy taxi_trip_audio_rooms_participants_select on public.taxi_trip_audio_rooms for select to authenticated using (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
drop policy if exists taxi_trip_audio_rooms_participants_insert on public.taxi_trip_audio_rooms;
create policy taxi_trip_audio_rooms_participants_insert on public.taxi_trip_audio_rooms for insert to authenticated with check (created_by=auth.uid()::text and exists (select 1 from public.taxi_rides r where r.id=ride_id and r.status in ('assigned','in_progress') and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
drop policy if exists taxi_trip_audio_rooms_participants_update on public.taxi_trip_audio_rooms;
create policy taxi_trip_audio_rooms_participants_update on public.taxi_trip_audio_rooms for update to authenticated using (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text))) with check (exists (select 1 from public.taxi_rides r where r.id=ride_id and (r.passenger_id::text=auth.uid()::text or r.driver_id::text=auth.uid()::text)));
grant select,insert,update on public.taxi_trip_audio_rooms to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 20260717012000_trip_audio_webrtc_signals.sql
-- ─────────────────────────────────────────────────────────────────────
-- Private WebRTC signaling messages for temporary trip audio rooms.
create table if not exists public.taxi_trip_audio_signals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.taxi_trip_audio_rooms(id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('driver','passenger')),
  signal_type text not null check (signal_type in ('offer','answer','ice')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists taxi_trip_audio_signals_room_created_idx
  on public.taxi_trip_audio_signals(room_id, created_at asc);

alter table public.taxi_trip_audio_signals enable row level security;
alter table public.taxi_trip_audio_signals force row level security;

drop policy if exists taxi_trip_audio_signals_participants_select on public.taxi_trip_audio_signals;
create policy taxi_trip_audio_signals_participants_select
on public.taxi_trip_audio_signals
for select to authenticated
using (
  exists (
    select 1
    from public.taxi_trip_audio_rooms ar
    join public.taxi_rides r on r.id = ar.ride_id
    where ar.id = room_id
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
);

drop policy if exists taxi_trip_audio_signals_participants_insert on public.taxi_trip_audio_signals;
create policy taxi_trip_audio_signals_participants_insert
on public.taxi_trip_audio_signals
for insert to authenticated
with check (
  sender_id = auth.uid()::text
  and exists (
    select 1
    from public.taxi_trip_audio_rooms ar
    join public.taxi_rides r on r.id = ar.ride_id
    where ar.id = room_id
      and ar.status in ('waiting','active')
      and ar.expires_at > now()
      and (r.passenger_id::text = auth.uid()::text or r.driver_id::text = auth.uid()::text)
  )
);

grant select, insert on public.taxi_trip_audio_signals to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260717022000_trip_audio_reliability.sql
-- ─────────────────────────────────────────────────────────────────────
-- Reliability helpers for temporary WebRTC trip audio signaling.

-- Participants may remove stale signaling messages from their own active room
-- during an ICE restart. The API still verifies ride membership before doing it.
drop policy if exists taxi_trip_audio_signals_participants_delete
  on public.taxi_trip_audio_signals;

create policy taxi_trip_audio_signals_participants_delete
on public.taxi_trip_audio_signals
for delete
to authenticated
using (
  exists (
    select 1
    from public.taxi_trip_audio_rooms ar
    join public.taxi_rides r on r.id = ar.ride_id
    where ar.id = room_id
      and (
        r.passenger_id::text = auth.uid()::text
        or r.driver_id::text = auth.uid()::text
      )
  )
);

grant delete on public.taxi_trip_audio_signals to authenticated;

-- Remove obsolete signaling rows. Safe to run manually or from a scheduled job.
create or replace function public.cleanup_taxi_trip_audio_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  delete from public.taxi_trip_audio_signals
  where created_at < now() - interval '30 minutes'
     or room_id in (
       select id
       from public.taxi_trip_audio_rooms
       where status in ('ended', 'expired')
          or expires_at <= now()
     );

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function public.cleanup_taxi_trip_audio_signals() from public;
grant execute on function public.cleanup_taxi_trip_audio_signals() to service_role;

comment on function public.cleanup_taxi_trip_audio_signals()
is 'Deletes obsolete WebRTC signaling rows for ended, expired, or inactive taxi trip audio rooms.';

-- ─────────────────────────────────────────────────────────────────────
-- 20260717032000_trip_audio_presence.sql
-- ─────────────────────────────────────────────────────────────────────
-- Participant presence and stale-room recovery for private trip audio.

alter table public.taxi_trip_audio_rooms
  add column if not exists driver_last_seen_at timestamptz,
  add column if not exists passenger_last_seen_at timestamptz;

create index if not exists taxi_trip_audio_rooms_driver_last_seen_idx
  on public.taxi_trip_audio_rooms (driver_last_seen_at)
  where status in ('waiting', 'active');

create index if not exists taxi_trip_audio_rooms_passenger_last_seen_idx
  on public.taxi_trip_audio_rooms (passenger_last_seen_at)
  where status in ('waiting', 'active');

create or replace function public.cleanup_stale_taxi_trip_audio_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  update public.taxi_trip_audio_rooms
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      driver_joined_at = null,
      passenger_joined_at = null,
      driver_last_seen_at = null,
      passenger_last_seen_at = null
  where status in ('waiting', 'active')
    and (
      expires_at <= now()
      or (
        coalesce(driver_last_seen_at, created_at) < now() - interval '2 minutes'
        and coalesce(passenger_last_seen_at, created_at) < now() - interval '2 minutes'
      )
    );

  get diagnostics changed_count = row_count;

  delete from public.taxi_trip_audio_signals s
  using public.taxi_trip_audio_rooms r
  where s.room_id = r.id
    and r.status in ('ended', 'expired');

  return changed_count;
end;
$$;

revoke all on function public.cleanup_stale_taxi_trip_audio_rooms() from public;
grant execute on function public.cleanup_stale_taxi_trip_audio_rooms() to service_role;

comment on column public.taxi_trip_audio_rooms.driver_last_seen_at
is 'Latest heartbeat received from the driver while the private audio room is open.';

comment on column public.taxi_trip_audio_rooms.passenger_last_seen_at
is 'Latest heartbeat received from the passenger while the private audio room is open.';

comment on function public.cleanup_stale_taxi_trip_audio_rooms()
is 'Ends abandoned trip audio rooms and removes their obsolete WebRTC signaling rows.';

-- ─────────────────────────────────────────────────────────────────────
-- 20260717043000_trip_audio_quality.sql
-- ─────────────────────────────────────────────────────────────────────
-- Private trip audio quality diagnostics.

create table if not exists public.taxi_trip_audio_quality_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.taxi_trip_audio_rooms(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  participant_id text not null,
  participant_role text not null check (participant_role in ('driver', 'passenger')),
  quality text not null check (quality in ('excellent', 'good', 'poor', 'offline')),
  connection_state text not null,
  round_trip_ms numeric(10,2),
  jitter_ms numeric(10,2),
  packets_lost bigint,
  bitrate_kbps numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists taxi_trip_audio_quality_events_room_created_idx
  on public.taxi_trip_audio_quality_events (room_id, created_at desc);

create index if not exists taxi_trip_audio_quality_events_ride_created_idx
  on public.taxi_trip_audio_quality_events (ride_id, created_at desc);

create index if not exists taxi_trip_audio_quality_events_poor_idx
  on public.taxi_trip_audio_quality_events (created_at desc)
  where quality in ('poor', 'offline');

alter table public.taxi_trip_audio_quality_events enable row level security;
alter table public.taxi_trip_audio_quality_events force row level security;

revoke all on table public.taxi_trip_audio_quality_events from anon, authenticated;
grant select, insert, delete on table public.taxi_trip_audio_quality_events to service_role;

comment on table public.taxi_trip_audio_quality_events
is 'Short WebRTC network-quality samples for private taxi trip audio calls; accessed only through authenticated server procedures.';

create or replace function public.cleanup_old_taxi_trip_audio_quality_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  delete from public.taxi_trip_audio_quality_events
  where created_at < now() - interval '30 days';

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function public.cleanup_old_taxi_trip_audio_quality_events() from public;
grant execute on function public.cleanup_old_taxi_trip_audio_quality_events() to service_role;

comment on function public.cleanup_old_taxi_trip_audio_quality_events()
is 'Deletes private call quality samples older than 30 days.';

-- ─────────────────────────────────────────────────────────────────────
-- 20260718090000_system_health_audit.sql
-- ─────────────────────────────────────────────────────────────────────
-- Taximun production health audit
-- Read-only diagnostic for administrators.

create or replace function public.taximun_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  required_tables text[] := array[
    'taxi_rides','driver_live_status','taxi_ride_offers','taxi_trip_messages',
    'taxi_trip_call_requests','taxi_trip_audio_rooms','taxi_trip_audio_signals',
    'taxi_trip_audio_quality_metrics','taxi_safety_reports','taxi_notifications',
    'taxi_ride_ratings','taxi_driver_documents','taxi_activity_logs'
  ];
  required_functions text[] := array[
    'taximun_find_pending_rides_for_driver','taximun_accept_ride_transactional',
    'taximun_dispatch_health','taximun_reconcile_dispatch_state','taximun_notify_admins'
  ];
  table_items jsonb := '[]'::jsonb;
  function_items jsonb := '[]'::jsonb;
  rls_items jsonb := '[]'::jsonb;
  item text;
  present boolean;
  rls_enabled boolean;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  foreach item in array required_tables loop
    present := to_regclass('public.' || item) is not null;
    table_items := table_items || jsonb_build_array(jsonb_build_object(
      'name', item,
      'ok', present,
      'severity', case when present then 'ok' else 'error' end,
      'message', case when present then 'Tabla disponible' else 'Falta tabla o migración' end
    ));

    if present then
      select c.relrowsecurity into rls_enabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = item;
      rls_items := rls_items || jsonb_build_array(jsonb_build_object(
        'name', item,
        'ok', coalesce(rls_enabled,false),
        'severity', case when coalesce(rls_enabled,false) then 'ok' else 'warning' end,
        'message', case when coalesce(rls_enabled,false) then 'RLS activada' else 'RLS no activada' end
      ));
    end if;
  end loop;

  foreach item in array required_functions loop
    select exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = item
    ) into present;
    function_items := function_items || jsonb_build_array(jsonb_build_object(
      'name', item,
      'ok', present,
      'severity', case when present then 'ok' else 'error' end,
      'message', case when present then 'Función disponible' else 'Falta función RPC' end
    ));
  end loop;

  return jsonb_build_object(
    'checkedAt', now(),
    'database', jsonb_build_object('ok', true, 'message', 'Conexión Supabase operativa'),
    'tables', table_items,
    'functions', function_items,
    'rls', rls_items,
    'summary', jsonb_build_object(
      'tablesOk', (select count(*) from jsonb_array_elements(table_items) x where (x->>'ok')::boolean),
      'tablesTotal', jsonb_array_length(table_items),
      'functionsOk', (select count(*) from jsonb_array_elements(function_items) x where (x->>'ok')::boolean),
      'functionsTotal', jsonb_array_length(function_items),
      'rlsOk', (select count(*) from jsonb_array_elements(rls_items) x where (x->>'ok')::boolean),
      'rlsTotal', jsonb_array_length(rls_items)
    )
  );
end;
$$;

revoke all on function public.taximun_system_health() from public;
grant execute on function public.taximun_system_health() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 20260719103000_server_side_driver_assignment.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #63 · Server-side driver assignment
-- Selects the best available driver and creates one expiring offer atomically.

create or replace function public.taximun_server_dispatch(
  p_ride_id uuid,
  p_offer_seconds integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer := greatest(10, least(coalesce(p_offer_seconds, 25), 90));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ride_id::text, 0));

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RIDE_NOT_FOUND');
  end if;

  if v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'RIDE_ALREADY_PROCESSED',
      'rideId', v_ride.id,
      'status', v_ride.status,
      'driverId', v_ride.driver_id
    );
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'server_dispatch')
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at <= now();

  select * into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ACTIVE_OFFER_EXISTS',
      'rideId', p_ride_id,
      'offerId', v_offer.id,
      'driverId', v_offer.driver_id,
      'expiresAt', v_offer.expires_at
    );
  end if;

  select d.driver_id,
         d.driver_name,
         d.taxi_code,
         d.plate,
         d.current_lat,
         d.current_lng,
         (
           power(coalesce(d.current_lat, 0) - coalesce(v_ride.pickup_lat, 0), 2) +
           power(coalesce(d.current_lng, 0) - coalesce(v_ride.pickup_lng, 0), 2)
         ) as distance_score
  into v_driver
  from public.driver_live_status d
  where d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and not exists (
      select 1
      from public.taxi_rides active_ride
      where active_ride.driver_id = d.driver_id
        and active_ride.status in ('assigned', 'in_progress')
    )
    and not exists (
      select 1
      from public.taxi_ride_offers previous_offer
      where previous_offer.ride_id = p_ride_id
        and previous_offer.driver_id = d.driver_id
        and previous_offer.status in ('rejected', 'expired')
    )
  order by distance_score asc, d.updated_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_DRIVER_AVAILABLE',
      'rideId', p_ride_id
    );
  end if;

  insert into public.taxi_ride_offers (
    ride_id,
    driver_id,
    status,
    offered_at,
    expires_at,
    metadata
  ) values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'server_dispatch',
      'distanceScore', v_driver.distance_score,
      'driverName', v_driver.driver_name,
      'taxiCode', v_driver.taxi_code,
      'plate', v_driver.plate
    )
  )
  returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received = coalesce(offers_received, 0) + 1,
      updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    v_driver.driver_id,
    'system',
    'Oferta asignada automáticamente por el servidor',
    p_ride_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceScore', v_driver.distance_score
  );
end;
$$;

revoke all on function public.taximun_server_dispatch(uuid, integer) from public;
grant execute on function public.taximun_server_dispatch(uuid, integer) to authenticated;
grant execute on function public.taximun_server_dispatch(uuid, integer) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260719121000_permanent_sos_audit.sql
-- ─────────────────────────────────────────────────────────────────────
-- Permanent SOS and safety incident audit trail

create table if not exists public.taxi_safety_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.taxi_safety_reports(id) on delete restrict,
  ride_id uuid null,
  event_type text not null,
  previous_status text null,
  new_status text null,
  actor_id text null,
  actor_role text null,
  note text null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists taxi_safety_report_events_report_created_idx
  on public.taxi_safety_report_events(report_id, created_at desc);

create index if not exists taxi_safety_report_events_ride_created_idx
  on public.taxi_safety_report_events(ride_id, created_at desc)
  where ride_id is not null;

alter table public.taxi_safety_report_events enable row level security;
alter table public.taxi_safety_report_events force row level security;

revoke all on public.taxi_safety_report_events from public, anon, authenticated;
grant select on public.taxi_safety_report_events to authenticated;
grant all on public.taxi_safety_report_events to service_role;

drop policy if exists taxi_safety_events_admin_select on public.taxi_safety_report_events;
create policy taxi_safety_events_admin_select
on public.taxi_safety_report_events
for select
to authenticated
using (public.taximun_is_admin());

create or replace function public.taximun_audit_safety_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id text;
  v_actor_role text;
  v_event_type text;
begin
  v_actor_id := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_actor_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'system');

  if tg_op = 'INSERT' then
    v_event_type := case when new.category = 'sos' or new.priority = 'critical' then 'sos_created' else 'report_created' end;
    insert into public.taxi_safety_report_events(report_id, ride_id, event_type, new_status, actor_id, actor_role, note, snapshot)
    values (new.id, new.ride_id, v_event_type, new.status, coalesce(v_actor_id, new.reporter_id), coalesce(v_actor_role, new.reporter_role, 'system'), new.title, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_event_type := case
      when old.status is distinct from new.status then 'status_changed'
      when old.assigned_admin_id is distinct from new.assigned_admin_id then 'admin_assigned'
      when old.resolution_note is distinct from new.resolution_note then 'note_updated'
      else 'report_updated'
    end;
    insert into public.taxi_safety_report_events(report_id, ride_id, event_type, previous_status, new_status, actor_id, actor_role, note, snapshot)
    values (new.id, new.ride_id, v_event_type, old.status, new.status, coalesce(v_actor_id, new.assigned_admin_id), v_actor_role, new.resolution_note, jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_safety_report_audit_trigger on public.taxi_safety_reports;
create trigger taximun_safety_report_audit_trigger
after insert or update on public.taxi_safety_reports
for each row execute function public.taximun_audit_safety_report();

insert into public.taxi_safety_report_events(report_id, ride_id, event_type, new_status, actor_id, actor_role, note, snapshot, created_at)
select r.id, r.ride_id,
  case when r.category = 'sos' or r.priority = 'critical' then 'sos_imported' else 'report_imported' end,
  r.status, r.reporter_id, r.reporter_role,
  'Registro histórico importado al activar la auditoría permanente',
  to_jsonb(r), coalesce(r.created_at, now())
from public.taxi_safety_reports r
where not exists (select 1 from public.taxi_safety_report_events e where e.report_id = r.id);


-- ─────────────────────────────────────────────────────────────────────
-- 20260719133000_expo_push_notifications.sql
-- ─────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────
-- 20260719150000_webrtc_turn_signaling.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #67 · WebRTC/TURN signaling infrastructure

create table if not exists public.taxi_trip_call_sessions (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  call_request_id uuid references public.taxi_trip_call_requests(id) on delete set null,
  initiator_id text not null,
  participant_id text not null,
  status text not null default 'connecting',
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_trip_call_sessions_status_check
    check (status in ('connecting','active','ended','failed'))
);

create index if not exists taxi_trip_call_sessions_ride_idx
  on public.taxi_trip_call_sessions(ride_id, created_at desc);

create table if not exists public.taxi_trip_call_signals (
  id bigint generated by default as identity primary key,
  session_id uuid not null references public.taxi_trip_call_sessions(id) on delete cascade,
  sender_id text not null,
  signal_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint taxi_trip_call_signals_type_check
    check (signal_type in ('offer','answer','ice-candidate','hangup'))
);

create index if not exists taxi_trip_call_signals_session_idx
  on public.taxi_trip_call_signals(session_id, id);

alter table public.taxi_trip_call_sessions enable row level security;
alter table public.taxi_trip_call_sessions force row level security;
alter table public.taxi_trip_call_signals enable row level security;
alter table public.taxi_trip_call_signals force row level security;

revoke all on public.taxi_trip_call_sessions from anon, authenticated;
revoke all on public.taxi_trip_call_signals from anon, authenticated;
grant all on public.taxi_trip_call_sessions to service_role;
grant all on public.taxi_trip_call_signals to service_role;
grant usage, select on sequence public.taxi_trip_call_signals_id_seq to service_role;

create or replace function public.taximun_touch_call_session()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_trip_call_sessions_touch on public.taxi_trip_call_sessions;
create trigger taxi_trip_call_sessions_touch
before update on public.taxi_trip_call_sessions
for each row execute function public.taximun_touch_call_session();

-- ─────────────────────────────────────────────────────────────────────
-- 20260720123000_stripe_payment_lifecycle.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #68 · Stripe payment lifecycle and accounting ledger

create table if not exists public.taxi_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.taxi_rides(id) on delete cascade,
  passenger_id text not null,
  driver_id text,
  provider text not null default 'stripe',
  provider_payment_intent_id text unique,
  provider_charge_id text,
  status text not null default 'pending',
  currency text not null default 'eur',
  amount_authorized integer not null default 0,
  amount_captured integer not null default 0,
  amount_refunded integer not null default 0,
  platform_fee integer not null default 0,
  driver_net integer not null default 0,
  client_secret text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_payments_status_check check (status in ('pending','authorized','captured','partially_refunded','refunded','cancelled','failed')),
  constraint taxi_payments_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint taxi_payments_amounts_check check (
    amount_authorized >= 0 and amount_captured >= 0 and amount_refunded >= 0 and
    platform_fee >= 0 and driver_net >= 0 and amount_refunded <= amount_captured
  )
);

create index if not exists taxi_payments_passenger_idx on public.taxi_payments(passenger_id, created_at desc);
create index if not exists taxi_payments_driver_idx on public.taxi_payments(driver_id, created_at desc);
create index if not exists taxi_payments_status_idx on public.taxi_payments(status, created_at desc);

create table if not exists public.taxi_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.taxi_payments(id) on delete cascade,
  provider_refund_id text not null unique,
  amount integer not null check (amount > 0),
  reason text not null,
  status text not null default 'pending',
  requested_by text not null,
  created_at timestamptz not null default now(),
  constraint taxi_payment_refunds_reason_check check (reason in ('duplicate','fraudulent','requested_by_customer')),
  constraint taxi_payment_refunds_status_check check (status in ('pending','succeeded','failed','cancelled'))
);

create index if not exists taxi_payment_refunds_payment_idx on public.taxi_payment_refunds(payment_id, created_at desc);

alter table public.taxi_payments enable row level security;
alter table public.taxi_payments force row level security;
alter table public.taxi_payment_refunds enable row level security;
alter table public.taxi_payment_refunds force row level security;

revoke all on public.taxi_payments from anon, authenticated;
revoke all on public.taxi_payment_refunds from anon, authenticated;
grant all on public.taxi_payments to service_role;
grant all on public.taxi_payment_refunds to service_role;

create or replace function public.taximun_touch_payment()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_payments_touch on public.taxi_payments;
create trigger taxi_payments_touch
before update on public.taxi_payments
for each row execute function public.taximun_touch_payment();


-- ─────────────────────────────────────────────────────────────────────
-- 20260720173000_stripe_webhook_audit.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #69 · Stripe webhook audit and idempotency

create table if not exists public.taxi_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  api_version text,
  livemode boolean not null default false,
  payload jsonb not null,
  status text not null default 'received',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint taxi_stripe_webhook_events_status_check
    check (status in ('received','processing','processed','failed')),
  constraint taxi_stripe_webhook_events_attempts_check
    check (attempts >= 0)
);

create index if not exists taxi_stripe_webhook_events_type_idx
  on public.taxi_stripe_webhook_events(event_type, received_at desc);

create index if not exists taxi_stripe_webhook_events_status_idx
  on public.taxi_stripe_webhook_events(status, received_at desc);

alter table public.taxi_stripe_webhook_events enable row level security;
alter table public.taxi_stripe_webhook_events force row level security;

revoke all on public.taxi_stripe_webhook_events from anon, authenticated;
grant all on public.taxi_stripe_webhook_events to service_role;

create or replace function public.taximun_touch_stripe_webhook_event()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_stripe_webhook_events_touch
  on public.taxi_stripe_webhook_events;

create trigger taxi_stripe_webhook_events_touch
before update on public.taxi_stripe_webhook_events
for each row execute function public.taximun_touch_stripe_webhook_event();


-- ─────────────────────────────────────────────────────────────────────
-- 20260721023000_stripe_connect_driver_payouts.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #70 · Stripe Connect driver onboarding and payouts

create table if not exists public.taxi_driver_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null unique,
  stripe_account_id text not null unique,
  country text not null default 'ES',
  status text not null default 'onboarding',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_driver_connect_accounts_status_check
    check (status in ('onboarding','enabled','restricted','disabled')),
  constraint taxi_driver_connect_accounts_country_check
    check (country ~ '^[A-Z]{2}$')
);

create index if not exists taxi_driver_connect_accounts_status_idx
  on public.taxi_driver_connect_accounts(status, updated_at desc);

create table if not exists public.taxi_driver_transfers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.taxi_payments(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  stripe_account_id text not null,
  stripe_transfer_id text not null unique,
  amount integer not null check (amount > 0),
  currency text not null default 'eur',
  status text not null default 'pending',
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_driver_transfers_status_check
    check (status in ('pending','paid','failed','reversed')),
  constraint taxi_driver_transfers_currency_check
    check (currency ~ '^[a-z]{3}$')
);

create index if not exists taxi_driver_transfers_driver_idx
  on public.taxi_driver_transfers(driver_id, created_at desc);
create index if not exists taxi_driver_transfers_status_idx
  on public.taxi_driver_transfers(status, created_at desc);

alter table public.taxi_driver_connect_accounts enable row level security;
alter table public.taxi_driver_connect_accounts force row level security;
alter table public.taxi_driver_transfers enable row level security;
alter table public.taxi_driver_transfers force row level security;

revoke all on public.taxi_driver_connect_accounts from anon, authenticated;
revoke all on public.taxi_driver_transfers from anon, authenticated;
grant all on public.taxi_driver_connect_accounts to service_role;
grant all on public.taxi_driver_transfers to service_role;

create or replace function public.taximun_touch_connect_account()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.taximun_touch_driver_transfer()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_driver_connect_accounts_touch on public.taxi_driver_connect_accounts;
create trigger taxi_driver_connect_accounts_touch
before update on public.taxi_driver_connect_accounts
for each row execute function public.taximun_touch_connect_account();

drop trigger if exists taxi_driver_transfers_touch on public.taxi_driver_transfers;
create trigger taxi_driver_transfers_touch
before update on public.taxi_driver_transfers
for each row execute function public.taximun_touch_driver_transfer();


-- ─────────────────────────────────────────────────────────────────────
-- 20260722013000_stripe_disputes_and_payout_holds.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #72 · Stripe disputes, chargebacks and payout protection

create table if not exists public.taxi_payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.taxi_payments(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text,
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  amount integer not null check (amount > 0),
  currency text not null default 'eur',
  reason text,
  status text not null default 'warning_needs_response',
  evidence_due_at timestamptz,
  is_charge_refundable boolean,
  balance_transaction_id text,
  payout_action text not null default 'hold',
  last_stripe_event_id text,
  payload jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_payment_disputes_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint taxi_payment_disputes_payout_action_check check (payout_action in ('none','hold','reverse','released'))
);

create index if not exists taxi_payment_disputes_payment_idx
  on public.taxi_payment_disputes(payment_id, created_at desc);
create index if not exists taxi_payment_disputes_status_idx
  on public.taxi_payment_disputes(status, created_at desc);
create index if not exists taxi_payment_disputes_driver_idx
  on public.taxi_payment_disputes(driver_id, created_at desc);

alter table public.taxi_payment_disputes enable row level security;
alter table public.taxi_payment_disputes force row level security;
revoke all on public.taxi_payment_disputes from anon, authenticated;
grant all on public.taxi_payment_disputes to service_role;

alter table public.taxi_driver_transfers
  add column if not exists dispute_hold boolean not null default false,
  add column if not exists dispute_id uuid references public.taxi_payment_disputes(id) on delete set null,
  add column if not exists payout_blocked_reason text;

create index if not exists taxi_driver_transfers_dispute_hold_idx
  on public.taxi_driver_transfers(dispute_hold, created_at desc)
  where dispute_hold = true;

create or replace function public.taximun_touch_payment_dispute()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_payment_disputes_touch on public.taxi_payment_disputes;
create trigger taxi_payment_disputes_touch
before update on public.taxi_payment_disputes
for each row execute function public.taximun_touch_payment_dispute();


-- ─────────────────────────────────────────────────────────────────────
-- 20260722070000_smart_dispatch_scoring.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #74 · Smart Dispatch scoring, fairness and audit metrics

create table if not exists public.taxi_dispatch_decisions (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text,
  offer_id uuid references public.taxi_ride_offers(id) on delete set null,
  result_code text not null,
  distance_km numeric(10,3),
  estimated_eta_minutes integer,
  driver_rating numeric(4,2),
  freshness_seconds integer,
  fairness_penalty numeric(10,3),
  rejection_penalty numeric(10,3),
  final_score numeric(12,4),
  candidate_count integer not null default 0,
  algorithm_version text not null default 'smart_dispatch_v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists taxi_dispatch_decisions_ride_idx
  on public.taxi_dispatch_decisions(ride_id, created_at desc);
create index if not exists taxi_dispatch_decisions_driver_idx
  on public.taxi_dispatch_decisions(driver_id, created_at desc)
  where driver_id is not null;
create index if not exists taxi_dispatch_decisions_result_idx
  on public.taxi_dispatch_decisions(result_code, created_at desc);

alter table public.taxi_dispatch_decisions enable row level security;
alter table public.taxi_dispatch_decisions force row level security;
revoke all on public.taxi_dispatch_decisions from anon, authenticated;
grant all on public.taxi_dispatch_decisions to service_role;

create or replace function public.taximun_server_dispatch(
  p_ride_id uuid,
  p_offer_seconds integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer := greatest(10, least(coalesce(p_offer_seconds, 25), 90));
  v_candidate_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ride_id::text, 0));

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RIDE_NOT_FOUND');
  end if;

  if v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return jsonb_build_object('ok', true, 'code', 'RIDE_ALREADY_PROCESSED', 'rideId', v_ride.id, 'status', v_ride.status, 'driverId', v_ride.driver_id);
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'smart_dispatch')
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();

  select * into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id and status = 'pending' and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'code', 'ACTIVE_OFFER_EXISTS', 'rideId', p_ride_id, 'offerId', v_offer.id, 'driverId', v_offer.driver_id, 'expiresAt', v_offer.expires_at);
  end if;

  with candidates as (
    select
      d.driver_id,
      d.driver_name,
      d.taxi_code,
      d.plate,
      d.current_lat,
      d.current_lng,
      d.updated_at,
      coalesce(d.offers_received, 0) as offers_received,
      coalesce(p.rating, 5.0) as driver_rating,
      6371 * 2 * asin(sqrt(
        power(sin(radians((d.current_lat - v_ride.pickup_lat) / 2)), 2) +
        cos(radians(v_ride.pickup_lat)) * cos(radians(d.current_lat)) *
        power(sin(radians((d.current_lng - v_ride.pickup_lng) / 2)), 2)
      )) as distance_km,
      greatest(0, extract(epoch from (now() - d.updated_at)))::integer as freshness_seconds,
      (select count(*) from public.taxi_ride_offers ro where ro.ride_id = p_ride_id and ro.driver_id = d.driver_id and ro.status in ('rejected','expired')) as rejection_count
    from public.driver_live_status d
    left join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null and d.current_lng is not null
      and d.updated_at >= now() - interval '3 minutes'
      and not exists (
        select 1 from public.taxi_rides ar
        where ar.driver_id = d.driver_id and ar.status in ('assigned','in_progress')
      )
  ), scored as (
    select *,
      greatest(1, ceil(distance_km / 0.45))::integer as eta_minutes,
      offers_received * 0.12 as fairness_penalty,
      rejection_count * 2.5 as rejection_penalty,
      distance_km * 10
        + greatest(0, 5 - driver_rating) * 3
        + freshness_seconds / 30.0
        + offers_received * 0.12
        + rejection_count * 2.5 as final_score
    from candidates
  )
  select *, count(*) over() into v_driver
  from scored
  order by final_score asc, updated_at desc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(ride_id, result_code, candidate_count)
    values (p_ride_id, 'NO_DRIVER_AVAILABLE', 0);
    return jsonb_build_object('ok', false, 'code', 'NO_DRIVER_AVAILABLE', 'rideId', p_ride_id);
  end if;

  v_candidate_count := coalesce(v_driver.count, 1);

  insert into public.taxi_ride_offers(ride_id, driver_id, status, offered_at, expires_at, metadata)
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch_v1',
      'distanceKm', round(v_driver.distance_km::numeric, 3),
      'etaMinutes', v_driver.eta_minutes,
      'driverRating', v_driver.driver_rating,
      'finalScore', round(v_driver.final_score::numeric, 4),
      'candidateCount', v_candidate_count
    )
  ) returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(), offers_received = coalesce(offers_received, 0) + 1, updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id, driver_id, offer_id, result_code, distance_km, estimated_eta_minutes,
    driver_rating, freshness_seconds, fairness_penalty, rejection_penalty,
    final_score, candidate_count, metadata
  ) values (
    p_ride_id, v_driver.driver_id, v_offer.id, 'OFFER_CREATED',
    round(v_driver.distance_km::numeric, 3), v_driver.eta_minutes,
    v_driver.driver_rating, v_driver.freshness_seconds,
    v_driver.fairness_penalty, v_driver.rejection_penalty,
    round(v_driver.final_score::numeric, 4), v_candidate_count,
    jsonb_build_object('offerSeconds', v_seconds)
  );

  insert into public.taxi_activity_logs(actor_id, actor_role, message, ride_id)
  values (v_driver.driver_id, 'system', 'Oferta creada por Smart Dispatch v1', p_ride_id);

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceKm', round(v_driver.distance_km::numeric, 3),
    'etaMinutes', v_driver.eta_minutes,
    'driverRating', v_driver.driver_rating,
    'finalScore', round(v_driver.final_score::numeric, 4),
    'candidateCount', v_candidate_count,
    'algorithmVersion', 'smart_dispatch_v1'
  );
end;
$$;

revoke all on function public.taximun_server_dispatch(uuid, integer) from public;
grant execute on function public.taximun_server_dispatch(uuid, integer) to authenticated;
grant execute on function public.taximun_server_dispatch(uuid, integer) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260722090000_stripe_connect_webhook_sync.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #71 · Stripe Connect webhook synchronization

alter table public.taxi_driver_connect_accounts
  add column if not exists last_stripe_event_id text,
  add column if not exists last_synced_at timestamptz;

alter table public.taxi_driver_transfers
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists reversal_id text,
  add column if not exists last_stripe_event_id text,
  add column if not exists last_synced_at timestamptz;

create index if not exists taxi_driver_connect_accounts_stripe_event_idx
  on public.taxi_driver_connect_accounts(last_stripe_event_id)
  where last_stripe_event_id is not null;

create index if not exists taxi_driver_transfers_stripe_event_idx
  on public.taxi_driver_transfers(last_stripe_event_id)
  where last_stripe_event_id is not null;


-- ─────────────────────────────────────────────────────────────────────
-- 20260723133000_trip_lifecycle_pin_guard.sql
-- ─────────────────────────────────────────────────────────────────────
-- Secure trip lifecycle: persisted pickup PIN, atomic start, and strict transitions.

alter table public.taxi_rides
  add column if not exists pickup_pin text,
  add column if not exists pin_verified_at timestamptz;

update public.taxi_rides
set pickup_pin = upper(substr(replace(id::text, '-', ''), 1, 4))
where pickup_pin is null;

alter table public.taxi_rides
  alter column pickup_pin set not null;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_pickup_pin_check;

alter table public.taxi_rides
  add constraint taxi_rides_pickup_pin_check
  check (pickup_pin ~ '^[A-F0-9]{4}$');

create or replace function public.taximun_set_pickup_pin()
returns trigger
language plpgsql
as $$
begin
  if new.pickup_pin is null then
    new.pickup_pin := upper(substr(replace(new.id::text, '-', ''), 1, 4));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_set_pickup_pin on public.taxi_rides;
create trigger trg_taximun_set_pickup_pin
before insert on public.taxi_rides
for each row execute function public.taximun_set_pickup_pin();

create or replace function public.taximun_start_ride_with_pin(
  p_ride_id uuid,
  p_driver_id text,
  p_pickup_pin text
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found or v_ride.status <> 'assigned' then
    raise exception 'RIDE_NOT_ASSIGNED';
  end if;
  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;
  if v_ride.driver_arrived_at is null then
    raise exception 'DRIVER_NOT_ARRIVED';
  end if;
  if upper(trim(p_pickup_pin)) is distinct from v_ride.pickup_pin then
    raise exception 'INVALID_PICKUP_PIN';
  end if;

  update public.taxi_rides
  set status = 'in_progress',
      started_at = now(),
      pin_verified_at = now()
  where id = p_ride_id
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke all on function public.taximun_start_ride_with_pin(uuid, text, text) from public;
grant execute on function public.taximun_start_ride_with_pin(uuid, text, text) to authenticated, service_role;

create or replace function public.taximun_enforce_trip_state_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status not in ('assigned', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: pending -> %', new.status;
  elsif old.status = 'assigned' and new.status not in ('in_progress', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: assigned -> %', new.status;
  elsif old.status = 'in_progress' and new.status not in ('completed', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: in_progress -> %', new.status;
  elsif old.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: terminal state %', old.status;
  end if;

  if new.status = 'in_progress' then
    if new.driver_arrived_at is null or new.pin_verified_at is null or new.started_at is null then
      raise exception 'RIDE_START_GUARD_REQUIRED';
    end if;
  end if;

  if new.status = 'completed' and old.status <> 'in_progress' then
    raise exception 'RIDE_MUST_BE_IN_PROGRESS_BEFORE_COMPLETION';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_trip_state_transition on public.taxi_rides;
create trigger trg_taximun_trip_state_transition
before update of status on public.taxi_rides
for each row execute function public.taximun_enforce_trip_state_transition();


-- ─────────────────────────────────────────────────────────────────────
-- 20260723170000_atomic_trip_payment_settlement.sql
-- ─────────────────────────────────────────────────────────────────────
-- Atomic trip settlement linked to real card capture and race-safe driver accounting.

create or replace function public.taximun_settle_trip_atomic(
  p_ride_id uuid,
  p_driver_id text,
  p_settled_by text,
  p_driver_name text,
  p_final_fare numeric,
  p_payment_method text,
  p_payment_status text,
  p_notes text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
begin
  if p_final_fare < 0 or p_final_fare > 9999 then
    raise exception 'INVALID_FINAL_FARE';
  end if;

  if p_payment_method not in ('cash', 'card', 'bizum') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_payment_status not in ('paid', 'waived') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.status <> 'in_progress' then
    raise exception 'RIDE_NOT_IN_PROGRESS';
  end if;

  if p_payment_method = 'card' then
    if p_payment_status <> 'paid' then
      raise exception 'CARD_PAYMENT_MUST_BE_PAID';
    end if;

    select * into v_payment
    from public.taxi_payments
    where ride_id = p_ride_id
    for update;

    if not found or v_payment.status <> 'captured' then
      raise exception 'CARD_PAYMENT_NOT_CAPTURED';
    end if;

    v_expected_cents := round(p_final_fare * 100)::integer;
    if v_payment.amount_captured <> v_expected_cents then
      raise exception 'CARD_CAPTURE_AMOUNT_MISMATCH';
    end if;
  end if;

  update public.taxi_rides
  set final_fare = p_final_fare,
      payment_method = p_payment_method,
      payment_status = p_payment_status,
      settlement_notes = nullif(trim(p_notes), ''),
      settled_at = now(),
      settled_by = p_settled_by,
      completed_at = now(),
      status = 'completed'
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    status,
    total_earnings,
    total_rides
  ) values (
    p_driver_id,
    coalesce(nullif(trim(p_driver_name), ''), 'Conductor'),
    'available',
    p_final_fare,
    1
  )
  on conflict (driver_id) do update
  set driver_name = coalesce(nullif(excluded.driver_name, ''), public.driver_live_status.driver_name),
      status = 'available',
      total_earnings = coalesce(public.driver_live_status.total_earnings, 0) + excluded.total_earnings,
      total_rides = coalesce(public.driver_live_status.total_rides, 0) + 1;

  return v_ride;
end;
$$;

revoke all on function public.taximun_settle_trip_atomic(uuid, text, text, text, numeric, text, text, text) from public;
grant execute on function public.taximun_settle_trip_atomic(uuid, text, text, text, numeric, text, text, text) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724003000_release_driver_after_ride_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- Release an assigned driver when a ride is cancelled before it starts.

create or replace function public.taximun_release_driver_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled'
     and old.status = 'assigned'
     and old.driver_id is not null then

    update public.driver_live_status as driver_status
    set status = 'available'
    where driver_status.driver_id = old.driver_id
      and not exists (
        select 1
        from public.taxi_rides as other_ride
        where other_ride.driver_id = old.driver_id
          and other_ride.id <> new.id
          and other_ride.status in ('assigned', 'in_progress')
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_release_driver_after_cancellation
on public.taxi_rides;

create trigger trg_taximun_release_driver_after_cancellation
after update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_release_driver_after_ride_cancellation();

revoke all on function public.taximun_release_driver_after_ride_cancellation() from public;
grant execute on function public.taximun_release_driver_after_ride_cancellation() to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724011000_cancellation_offer_notification_cleanup.sql
-- ─────────────────────────────────────────────────────────────────────
-- Keep dispatch offers and driver notifications consistent when a ride is cancelled.

create or replace function public.taximun_cleanup_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expiredBy', 'ride_cancellation',
        'cancelledAt', coalesce(new.cancelled_at, now())
      )
  where ride_id = new.id
    and status = 'pending';

  if old.driver_id is not null then
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
    ) values (
      old.driver_id,
      'driver',
      new.passenger_id,
      'passenger',
      'warning',
      'Viaje cancelado',
      'El pasajero ha cancelado el servicio antes de que comenzara.',
      '/driver',
      jsonb_build_object(
        'rideId', new.id,
        'event', 'ride_cancelled',
        'previousStatus', old.status,
        'cancelledAt', coalesce(new.cancelled_at, now())
      )
    );
  end if;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    coalesce(new.passenger_id, 'system'),
    case when new.passenger_id is null then 'system' else 'passenger' end,
    format(
      'Cancelación reconciliada: %s ofertas pendientes expiradas%s',
      (select count(*) from public.taxi_ride_offers where ride_id = new.id and status = 'expired' and metadata ->> 'expiredBy' = 'ride_cancellation'),
      case when old.driver_id is not null then ' y conductor notificado' else '' end
    ),
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_taximun_cleanup_after_ride_cancellation
on public.taxi_rides;

create trigger trg_taximun_cleanup_after_ride_cancellation
after update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_cleanup_after_ride_cancellation();

revoke all on function public.taximun_cleanup_after_ride_cancellation() from public;
grant execute on function public.taximun_cleanup_after_ride_cancellation() to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724020000_cancellation_provenance.sql
-- ─────────────────────────────────────────────────────────────────────
-- Structured cancellation provenance and actor-aware reconciliation.

alter table public.taxi_rides
  add column if not exists cancelled_by_id text,
  add column if not exists cancelled_by_role text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancelled_by_role_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancelled_by_role_check
  check (
    cancelled_by_role is null
    or cancelled_by_role in ('passenger', 'driver', 'admin', 'system')
  );

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_fill_cancellation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    new.cancelled_at := coalesce(new.cancelled_at, now());

    -- The current public cancellation flow belongs to the passenger. Future
    -- driver/admin/system flows can provide explicit provenance in the update.
    new.cancelled_by_role := coalesce(new.cancelled_by_role, 'passenger');
    new.cancelled_by_id := coalesce(
      new.cancelled_by_id,
      case
        when new.cancelled_by_role = 'passenger' then new.passenger_id
        when new.cancelled_by_role = 'driver' then new.driver_id
        else 'system'
      end
    );
    new.cancellation_reason := coalesce(new.cancellation_reason, 'legacy_unspecified');
    new.cancellation_note := nullif(trim(coalesce(new.cancellation_note, '')), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_fill_cancellation_provenance
on public.taxi_rides;

create trigger trg_taximun_fill_cancellation_provenance
before update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_fill_cancellation_provenance();

update public.taxi_rides
set cancelled_by_role = coalesce(cancelled_by_role, 'passenger'),
    cancelled_by_id = coalesce(cancelled_by_id, passenger_id, 'system'),
    cancellation_reason = coalesce(cancellation_reason, 'legacy_unspecified')
where status = 'cancelled';

create or replace function public.taximun_cleanup_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_role text := coalesce(new.cancelled_by_role, 'system');
  v_actor_id text := coalesce(new.cancelled_by_id, 'system');
  v_notification_body text;
  v_expired_count integer := 0;
begin
  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expiredBy', 'ride_cancellation',
        'cancelledAt', coalesce(new.cancelled_at, now()),
        'cancelledByRole', v_actor_role,
        'cancellationReason', new.cancellation_reason
      )
  where ride_id = new.id
    and status = 'pending';

  get diagnostics v_expired_count = row_count;

  v_notification_body := case v_actor_role
    when 'passenger' then 'El pasajero ha cancelado el servicio antes de que comenzara.'
    when 'driver' then 'El servicio ha sido cancelado por el conductor.'
    when 'admin' then 'Administración ha cancelado este servicio.'
    else 'El servicio ha sido cancelado por el sistema.'
  end;

  if old.driver_id is not null and v_actor_role <> 'driver' then
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
    ) values (
      old.driver_id,
      'driver',
      v_actor_id,
      v_actor_role,
      'warning',
      'Viaje cancelado',
      v_notification_body,
      '/driver',
      jsonb_build_object(
        'rideId', new.id,
        'event', 'ride_cancelled',
        'previousStatus', old.status,
        'cancelledAt', coalesce(new.cancelled_at, now()),
        'cancelledByRole', v_actor_role,
        'cancellationReason', new.cancellation_reason,
        'cancellationNote', new.cancellation_note
      )
    );
  end if;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    v_actor_id,
    v_actor_role,
    format(
      'Cancelación reconciliada por %s (%s): %s ofertas pendientes expiradas',
      v_actor_role,
      coalesce(new.cancellation_reason, 'sin_motivo'),
      v_expired_count
    ),
    new.id
  );

  return new;
end;
$$;

revoke all on function public.taximun_fill_cancellation_provenance() from public;
grant execute on function public.taximun_fill_cancellation_provenance() to service_role;

revoke all on function public.taximun_cleanup_after_ride_cancellation() from public;
grant execute on function public.taximun_cleanup_after_ride_cancellation() to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724024500_passenger_no_show_guard.sql
-- ─────────────────────────────────────────────────────────────────────
-- Guarded passenger no-show flow after a verified driver arrival and minimum wait.

alter table public.taxi_rides
  add column if not exists no_show_reported_at timestamptz,
  add column if not exists no_show_wait_seconds integer;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'passenger_no_show',
      'other',
      'legacy_unspecified'
    )
  );

alter table public.taxi_rides
  drop constraint if exists taxi_rides_no_show_wait_seconds_check;

alter table public.taxi_rides
  add constraint taxi_rides_no_show_wait_seconds_check
  check (no_show_wait_seconds is null or no_show_wait_seconds >= 300);

create or replace function public.taximun_cancel_passenger_no_show(
  p_ride_id uuid,
  p_driver_id text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_wait_seconds integer;
begin
  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.status <> 'assigned' then
    raise exception 'RIDE_NOT_ASSIGNED';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.driver_arrived_at is null then
    raise exception 'DRIVER_NOT_ARRIVED';
  end if;

  v_wait_seconds := floor(extract(epoch from (now() - v_ride.driver_arrived_at)))::integer;

  if v_wait_seconds < 300 then
    raise exception 'NO_SHOW_WAIT_REQUIRED:%', 300 - v_wait_seconds;
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_driver_id,
      cancelled_by_role = 'driver',
      cancellation_reason = 'passenger_no_show',
      cancellation_note = nullif(trim(coalesce(p_note, '')), ''),
      no_show_reported_at = now(),
      no_show_wait_seconds = v_wait_seconds
  where id = p_ride_id
  returning * into v_ride;

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
  ) values (
    v_ride.passenger_id,
    'passenger',
    p_driver_id,
    'driver',
    'warning',
    'Servicio cancelado por ausencia',
    'El conductor registró que no te encontrabas en el punto de recogida tras esperar al menos 5 minutos.',
    '/passenger/rides',
    jsonb_build_object(
      'rideId', v_ride.id,
      'event', 'passenger_no_show',
      'driverArrivedAt', v_ride.driver_arrived_at,
      'reportedAt', v_ride.no_show_reported_at,
      'waitSeconds', v_ride.no_show_wait_seconds
    )
  );

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_driver_id,
    'driver',
    format('Pasajero ausente registrado tras %s segundos de espera', v_wait_seconds),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_passenger_no_show(uuid, text, text) from public;
grant execute on function public.taximun_cancel_passenger_no_show(uuid, text, text) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724033000_driver_operational_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- Guarded driver cancellation before trip start with structured provenance.

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'passenger_no_show',
      'vehicle_breakdown',
      'driver_emergency',
      'unsafe_pickup',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_cancel_ride_by_driver(
  p_ride_id uuid,
  p_driver_id text,
  p_reason text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  if p_reason not in ('vehicle_breakdown', 'driver_emergency', 'unsafe_pickup', 'operational', 'other') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.status <> 'assigned' then
    raise exception 'RIDE_NOT_ASSIGNED';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_driver_id,
      cancelled_by_role = 'driver',
      cancellation_reason = p_reason,
      cancellation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_ride_id
  returning * into v_ride;

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
  ) values (
    v_ride.passenger_id,
    'passenger',
    p_driver_id,
    'driver',
    'warning',
    'El conductor canceló el servicio',
    case p_reason
      when 'vehicle_breakdown' then 'El conductor ha cancelado el servicio por una avería del vehículo.'
      when 'driver_emergency' then 'El conductor ha cancelado el servicio por una emergencia.'
      when 'unsafe_pickup' then 'El conductor ha cancelado el servicio por una incidencia de seguridad en la recogida.'
      else 'El conductor no puede continuar con este servicio.'
    end,
    '/passenger/rides',
    jsonb_build_object(
      'rideId', v_ride.id,
      'event', 'driver_cancelled_ride',
      'reason', p_reason,
      'note', v_ride.cancellation_note,
      'cancelledAt', v_ride.cancelled_at
    )
  );

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_driver_id,
    'driver',
    format('Viaje cancelado por conductor (%s)', p_reason),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_ride_by_driver(uuid, text, text, text) from public;
grant execute on function public.taximun_cancel_ride_by_driver(uuid, text, text, text) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724043000_passenger_structured_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- Structured passenger cancellation with atomic ownership/state checks.

create or replace function public.taximun_cancel_ride_by_passenger(
  p_ride_id uuid,
  p_passenger_id text,
  p_reason text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  if p_reason not in ('changed_mind', 'wait_too_long', 'wrong_pickup', 'driver_delay', 'duplicate_request', 'other') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.passenger_id is distinct from p_passenger_id then
    raise exception 'PASSENGER_MISMATCH';
  end if;

  if v_ride.status not in ('pending', 'assigned') then
    raise exception 'RIDE_NOT_CANCELLABLE';
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_passenger_id,
      cancelled_by_role = 'passenger',
      cancellation_reason = p_reason,
      cancellation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_ride_id
  returning * into v_ride;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_passenger_id,
    'passenger',
    format('Viaje cancelado por pasajero (%s)', p_reason),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_ride_by_passenger(uuid, text, text, text) from public;
grant execute on function public.taximun_cancel_ride_by_passenger(uuid, text, text, text) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260724210000_strict_trip_completion_guard.sql
-- ─────────────────────────────────────────────────────────────────────
-- Enforce professional settlement before any ride can become completed.
-- This protects Supabase even if an obsolete API client attempts a direct update.

create or replace function public.taximun_enforce_trip_state_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_expected_cents integer;
  v_card_capture_exists boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status not in ('assigned', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: pending -> %', new.status;
  elsif old.status = 'assigned' and new.status not in ('in_progress', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: assigned -> %', new.status;
  elsif old.status = 'in_progress' and new.status not in ('completed', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: in_progress -> %', new.status;
  elsif old.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: terminal state %', old.status;
  end if;

  if new.status = 'in_progress' then
    if new.driver_arrived_at is null or new.pin_verified_at is null or new.started_at is null then
      raise exception 'RIDE_START_GUARD_REQUIRED';
    end if;
  end if;

  if new.status = 'completed' then
    if old.status <> 'in_progress' then
      raise exception 'RIDE_MUST_BE_IN_PROGRESS_BEFORE_COMPLETION';
    end if;

    if new.final_fare is null or new.final_fare < 0 or new.final_fare > 9999 then
      raise exception 'RIDE_COMPLETION_REQUIRES_FINAL_FARE';
    end if;

    if new.payment_method not in ('cash', 'card', 'bizum') then
      raise exception 'RIDE_COMPLETION_REQUIRES_PAYMENT_METHOD';
    end if;

    if new.payment_status not in ('paid', 'waived') then
      raise exception 'RIDE_COMPLETION_REQUIRES_SETTLED_PAYMENT';
    end if;

    if new.settled_at is null or nullif(trim(coalesce(new.settled_by, '')), '') is null then
      raise exception 'RIDE_COMPLETION_REQUIRES_SETTLEMENT_AUDIT';
    end if;

    if new.completed_at is null then
      raise exception 'RIDE_COMPLETION_REQUIRES_COMPLETED_AT';
    end if;

    if new.payment_method = 'card' then
      if new.payment_status <> 'paid' then
        raise exception 'CARD_PAYMENT_MUST_BE_PAID';
      end if;

      v_expected_cents := round(new.final_fare * 100)::integer;

      select exists (
        select 1
        from public.taxi_payments p
        where p.ride_id = new.id
          and p.status = 'captured'
          and p.amount_captured = v_expected_cents
      ) into v_card_capture_exists;

      if not v_card_capture_exists then
        raise exception 'CARD_PAYMENT_CAPTURE_REQUIRED_FOR_COMPLETION';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.taximun_enforce_trip_state_transition() is
  'Enforces valid ride transitions, pickup PIN verification and atomic professional settlement before completion.';


-- ─────────────────────────────────────────────────────────────────────
-- 20260725003000_require_structured_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- Require structured provenance for every new cancellation.
-- Historical rows may keep legacy_unspecified, but new transitions cannot create it.

create or replace function public.taximun_fill_cancellation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancellation_note := nullif(trim(coalesce(new.cancellation_note, '')), '');

    if new.cancelled_by_role not in ('passenger', 'driver', 'admin', 'system') then
      raise exception 'CANCELLATION_REQUIRES_ACTOR_ROLE';
    end if;

    if nullif(trim(coalesce(new.cancelled_by_id, '')), '') is null then
      raise exception 'CANCELLATION_REQUIRES_ACTOR_ID';
    end if;

    if new.cancellation_reason is null
      or new.cancellation_reason = 'legacy_unspecified'
    then
      raise exception 'CANCELLATION_REQUIRES_STRUCTURED_REASON';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.taximun_fill_cancellation_provenance() is
  'Requires actor and structured reason for every new ride cancellation while preserving historical legacy rows.';


-- ─────────────────────────────────────────────────────────────────────
-- 20260725012000_admin_structured_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- Atomic administrative cancellation with structured provenance.

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'safety_incident',
      'payment_issue',
      'admin_intervention',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_cancel_ride_by_admin(
  p_ride_id uuid,
  p_admin_id text,
  p_reason text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  if p_reason not in ('safety_incident', 'payment_issue', 'admin_intervention', 'duplicate_request', 'other') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

  if nullif(trim(coalesce(p_admin_id, '')), '') is null then
    raise exception 'ADMIN_ID_REQUIRED';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.status not in ('pending', 'assigned', 'in_progress') then
    raise exception 'RIDE_NOT_CANCELLABLE';
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_admin_id,
      cancelled_by_role = 'admin',
      cancellation_reason = p_reason,
      cancellation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_ride_id
  returning * into v_ride;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_admin_id,
    'admin',
    format('Viaje cancelado por administración (%s)', p_reason),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_ride_by_admin(uuid, text, text, text) from public;
grant execute on function public.taximun_cancel_ride_by_admin(uuid, text, text, text) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260730003000_driver_location_freshness.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #126 · Separate GPS freshness from general driver status updates

alter table public.driver_live_status
  add column if not exists location_updated_at timestamptz;

update public.driver_live_status
set location_updated_at = coalesce(location_updated_at, updated_at)
where current_lat is not null
  and current_lng is not null
  and location_updated_at is null;

create or replace function public.taximun_set_driver_location_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_lat is not null and new.current_lng is not null then
      new.location_updated_at := coalesce(new.location_updated_at, now());
    end if;
    return new;
  end if;

  if new.current_lat is distinct from old.current_lat
     or new.current_lng is distinct from old.current_lng then
    if new.current_lat is not null and new.current_lng is not null then
      new.location_updated_at := now();
    else
      new.location_updated_at := null;
    end if;
  else
    new.location_updated_at := old.location_updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_driver_location_freshness on public.driver_live_status;
create trigger taximun_driver_location_freshness
before insert or update on public.driver_live_status
for each row execute function public.taximun_set_driver_location_updated_at();

create index if not exists driver_live_status_location_freshness_idx
  on public.driver_live_status(status, location_updated_at desc)
  where current_lat is not null and current_lng is not null;

create or replace function public.taximun_server_dispatch(
  p_ride_id uuid,
  p_offer_seconds integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer := greatest(10, least(coalesce(p_offer_seconds, 25), 90));
  v_candidate_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ride_id::text, 0));

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RIDE_NOT_FOUND');
  end if;

  if v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return jsonb_build_object('ok', true, 'code', 'RIDE_ALREADY_PROCESSED', 'rideId', v_ride.id, 'status', v_ride.status, 'driverId', v_ride.driver_id);
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'smart_dispatch')
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();

  select * into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id and status = 'pending' and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'code', 'ACTIVE_OFFER_EXISTS', 'rideId', p_ride_id, 'offerId', v_offer.id, 'driverId', v_offer.driver_id, 'expiresAt', v_offer.expires_at);
  end if;

  with candidates as (
    select
      d.driver_id,
      d.driver_name,
      d.taxi_code,
      d.plate,
      d.current_lat,
      d.current_lng,
      d.location_updated_at as updated_at,
      coalesce(d.offers_received, 0) as offers_received,
      coalesce(p.rating, 5.0) as driver_rating,
      6371 * 2 * asin(sqrt(
        power(sin(radians((d.current_lat - v_ride.pickup_lat) / 2)), 2) +
        cos(radians(v_ride.pickup_lat)) * cos(radians(d.current_lat)) *
        power(sin(radians((d.current_lng - v_ride.pickup_lng) / 2)), 2)
      )) as distance_km,
      greatest(0, extract(epoch from (now() - d.location_updated_at)))::integer as freshness_seconds,
      (select count(*) from public.taxi_ride_offers ro where ro.ride_id = p_ride_id and ro.driver_id = d.driver_id and ro.status in ('rejected','expired')) as rejection_count
    from public.driver_live_status d
    left join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null and d.current_lng is not null
      and d.location_updated_at >= now() - interval '3 minutes'
      and not exists (
        select 1 from public.taxi_rides ar
        where ar.driver_id = d.driver_id and ar.status in ('assigned','in_progress')
      )
  ), scored as (
    select *,
      greatest(1, ceil(distance_km / 0.45))::integer as eta_minutes,
      offers_received * 0.12 as fairness_penalty,
      rejection_count * 2.5 as rejection_penalty,
      distance_km * 10
        + greatest(0, 5 - driver_rating) * 3
        + freshness_seconds / 30.0
        + offers_received * 0.12
        + rejection_count * 2.5 as final_score
    from candidates
  )
  select *, count(*) over() into v_driver
  from scored
  order by final_score asc, updated_at desc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(ride_id, result_code, candidate_count)
    values (p_ride_id, 'NO_DRIVER_AVAILABLE', 0);
    return jsonb_build_object('ok', false, 'code', 'NO_DRIVER_AVAILABLE', 'rideId', p_ride_id);
  end if;

  v_candidate_count := coalesce(v_driver.count, 1);

  insert into public.taxi_ride_offers(ride_id, driver_id, status, offered_at, expires_at, metadata)
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch_v1',
      'distanceKm', round(v_driver.distance_km::numeric, 3),
      'etaMinutes', v_driver.eta_minutes,
      'driverRating', v_driver.driver_rating,
      'finalScore', round(v_driver.final_score::numeric, 4),
      'candidateCount', v_candidate_count
    )
  ) returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(), offers_received = coalesce(offers_received, 0) + 1, updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id, driver_id, offer_id, result_code, distance_km, estimated_eta_minutes,
    driver_rating, freshness_seconds, fairness_penalty, rejection_penalty,
    final_score, candidate_count, metadata
  ) values (
    p_ride_id, v_driver.driver_id, v_offer.id, 'OFFER_CREATED',
    round(v_driver.distance_km::numeric, 3), v_driver.eta_minutes,
    v_driver.driver_rating, v_driver.freshness_seconds,
    v_driver.fairness_penalty, v_driver.rejection_penalty,
    round(v_driver.final_score::numeric, 4), v_candidate_count,
    jsonb_build_object('offerSeconds', v_seconds)
  );

  insert into public.taxi_activity_logs(actor_id, actor_role, message, ride_id)
  values (v_driver.driver_id, 'system', 'Oferta creada por Smart Dispatch v1', p_ride_id);

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceKm', round(v_driver.distance_km::numeric, 3),
    'etaMinutes', v_driver.eta_minutes,
    'driverRating', v_driver.driver_rating,
    'finalScore', round(v_driver.final_score::numeric, 4),
    'candidateCount', v_candidate_count,
    'algorithmVersion', 'smart_dispatch_v1'
  );
end;
$$;

revoke all on function public.taximun_server_dispatch(uuid, integer) from public;
grant execute on function public.taximun_server_dispatch(uuid, integer) to authenticated;
grant execute on function public.taximun_server_dispatch(uuid, integer) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260730014500_preserve_driver_verification_on_personal_updates.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #127 · Preserve driver verification when only personal fields change

create or replace function public.taximun_preserve_driver_verification_on_personal_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op <> 'UPDATE' or old.role <> 'driver' or new.role <> 'driver' then
    return new;
  end if;

  if new.driver_license_number is not distinct from old.driver_license_number
     and new.taxi_code is not distinct from old.taxi_code
     and new.plate is not distinct from old.plate
     and new.vehicle_model is not distinct from old.vehicle_model
     and new.work_zone is not distinct from old.work_zone then
    new.verification_status := old.verification_status;
    new.is_verified := old.is_verified;
    new.verification_note := old.verification_note;
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_preserve_driver_verification_personal_update
on public.taxi_user_profiles;

create trigger taximun_preserve_driver_verification_personal_update
before update on public.taxi_user_profiles
for each row
execute function public.taximun_preserve_driver_verification_on_personal_update();


-- ─────────────────────────────────────────────────────────────────────
-- 20260730070000_enforce_driver_document_requirements.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #128 corrected · Enforce complete and current driver documentation before approval

create or replace function public.taximun_driver_document_requirements(
  p_driver_id text
)
returns table (
  document_type text,
  label text,
  requirement_status text,
  document_id uuid,
  document_status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with required(document_type, label, sort_order) as (
    values
      ('identity'::text, 'Identidad / DNI / NIE'::text, 1),
      ('driver_license'::text, 'Permiso de conducir'::text, 2),
      ('taxi_license'::text, 'Licencia taxi'::text, 3),
      ('insurance'::text, 'Seguro'::text, 4),
      ('vehicle_inspection'::text, 'Inspección / ITV'::text, 5)
  ), latest as (
    select distinct on (d.document_type)
      d.id,
      d.document_type,
      d.status,
      d.expires_at,
      d.created_at
    from public.taxi_driver_documents d
    where d.driver_id = p_driver_id
      and d.document_type in ('identity', 'driver_license', 'taxi_license', 'insurance', 'vehicle_inspection')
    order by d.document_type, d.created_at desc, d.id desc
  )
  select
    r.document_type,
    r.label,
    case
      when l.id is null then 'missing'
      when l.status = 'rejected' then 'rejected'
      when l.status = 'expired' then 'expired'
      when l.expires_at is not null and l.expires_at < now() then 'expired'
      when l.status = 'approved' then 'approved'
      else 'pending'
    end as requirement_status,
    l.id as document_id,
    l.status::text as document_status,
    l.expires_at
  from required r
  left join latest l on l.document_type = r.document_type
  order by r.sort_order;
$$;

revoke all on function public.taximun_driver_document_requirements(text) from public;
revoke all on function public.taximun_driver_document_requirements(text) from anon;
revoke all on function public.taximun_driver_document_requirements(text) from authenticated;
grant execute on function public.taximun_driver_document_requirements(text) to service_role;

create or replace function public.taximun_enforce_driver_documents_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_missing_labels text;
begin
  if new.role is distinct from 'driver' then
    return new;
  end if;

  if coalesce(new.is_verified, false) = true
     or new.verification_status = 'approved' then
    select string_agg(label || ' (' || requirement_status || ')', ', ' order by label)
    into v_missing_labels
    from public.taximun_driver_document_requirements(new.user_id)
    where requirement_status <> 'approved';

    if v_missing_labels is not null then
      raise exception using
        errcode = 'P0001',
        message = 'DRIVER_DOCUMENTS_INCOMPLETE: ' || v_missing_labels,
        hint = 'Revisa y aprueba el envío más reciente de cada documento obligatorio antes de aprobar al conductor.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_enforce_driver_documents_before_approval
on public.taxi_user_profiles;

create trigger taximun_enforce_driver_documents_before_approval
before insert or update of role, is_verified, verification_status
on public.taxi_user_profiles
for each row
execute function public.taximun_enforce_driver_documents_before_approval();

create index if not exists taxi_driver_documents_latest_requirement_idx
  on public.taxi_driver_documents(driver_id, document_type, created_at desc)
  where document_type in ('identity', 'driver_license', 'taxi_license', 'insurance', 'vehicle_inspection');


-- ─────────────────────────────────────────────────────────────────────
-- 20260730210000_passenger_advanced_booking.sql
-- ─────────────────────────────────────────────────────────────────────
-- Passenger advanced booking, saved places and trip requirements

create table if not exists public.taxi_saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  place_type text not null default 'favorite' check (place_type in ('home', 'work', 'favorite')),
  label text not null,
  address text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, place_type, label)
);

create index if not exists taxi_saved_places_user_idx
  on public.taxi_saved_places(user_id, place_type, updated_at desc);

create table if not exists public.taxi_scheduled_bookings (
  id uuid primary key default gen_random_uuid(),
  passenger_id text not null,
  passenger_name text,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  scheduled_at timestamptz not null,
  service_category text not null default 'standard' check (service_category in ('standard', 'comfort', 'van', 'accessible')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'bizum')),
  intermediate_stops jsonb not null default '[]'::jsonb,
  passenger_requirements jsonb not null default '{}'::jsonb,
  fare_breakdown jsonb not null default '{}'::jsonb,
  estimated_fare numeric(10,2) not null default 0,
  fare_range_min numeric(10,2),
  fare_range_max numeric(10,2),
  estimated_duration integer not null default 0,
  distance_km numeric(10,2) not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'dispatched', 'completed')),
  reminder_24h_at timestamptz,
  reminder_2h_at timestamptz,
  reminder_30m_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  reminder_30m_sent_at timestamptz,
  dispatched_ride_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint taxi_scheduled_booking_future check (scheduled_at > created_at - interval '5 minutes')
);

create index if not exists taxi_scheduled_bookings_passenger_idx
  on public.taxi_scheduled_bookings(passenger_id, scheduled_at desc);

create index if not exists taxi_scheduled_bookings_due_idx
  on public.taxi_scheduled_bookings(status, scheduled_at)
  where status = 'scheduled';

alter table public.taxi_rides
  add column if not exists service_category text not null default 'standard',
  add column if not exists intermediate_stops jsonb not null default '[]'::jsonb,
  add column if not exists passenger_requirements jsonb not null default '{}'::jsonb,
  add column if not exists scheduled_booking_id uuid,
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(10,2) not null default 0;

create or replace function public.taximun_set_booking_reminders()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  new.reminder_24h_at := case when new.scheduled_at > now() + interval '24 hours' then new.scheduled_at - interval '24 hours' else null end;
  new.reminder_2h_at := case when new.scheduled_at > now() + interval '2 hours' then new.scheduled_at - interval '2 hours' else null end;
  new.reminder_30m_at := case when new.scheduled_at > now() + interval '30 minutes' then new.scheduled_at - interval '30 minutes' else null end;
  return new;
end;
$$;

drop trigger if exists taximun_scheduled_booking_reminders on public.taxi_scheduled_bookings;
create trigger taximun_scheduled_booking_reminders
before insert or update of scheduled_at on public.taxi_scheduled_bookings
for each row execute function public.taximun_set_booking_reminders();

-- The application server uses the service role; keep direct table access closed by default.
alter table public.taxi_saved_places enable row level security;
alter table public.taxi_scheduled_bookings enable row level security;

revoke all on table public.taxi_saved_places from anon, authenticated;
revoke all on table public.taxi_scheduled_bookings from anon, authenticated;
grant all on table public.taxi_saved_places to service_role;
grant all on table public.taxi_scheduled_bookings to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260731013000_process_scheduled_bookings.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #130 · Scheduled booking reminders and idempotent dispatch

alter table public.taxi_scheduled_bookings
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists last_processing_attempt_at timestamptz,
  add column if not exists last_processing_error text;

create unique index if not exists taxi_rides_scheduled_booking_unique_idx
  on public.taxi_rides(scheduled_booking_id)
  where scheduled_booking_id is not null;

create index if not exists taxi_scheduled_bookings_reminder_24h_due_idx
  on public.taxi_scheduled_bookings(reminder_24h_at)
  where status = 'scheduled' and reminder_24h_sent_at is null and reminder_24h_at is not null;

create index if not exists taxi_scheduled_bookings_reminder_2h_due_idx
  on public.taxi_scheduled_bookings(reminder_2h_at)
  where status = 'scheduled' and reminder_2h_sent_at is null and reminder_2h_at is not null;

create index if not exists taxi_scheduled_bookings_reminder_30m_due_idx
  on public.taxi_scheduled_bookings(reminder_30m_at)
  where status = 'scheduled' and reminder_30m_sent_at is null and reminder_30m_at is not null;

create or replace function public.taximun_process_scheduled_bookings(
  p_now timestamptz default now()
)
returns table (
  reminders_24h integer,
  reminders_2h integer,
  reminders_30m integer,
  rides_dispatched integer,
  rides_deferred integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_booking public.taxi_scheduled_bookings%rowtype;
  v_ride_id uuid;
  v_active_ride boolean;
  v_24h integer := 0;
  v_2h integer := 0;
  v_30m integer := 0;
  v_dispatched integer := 0;
  v_deferred integer := 0;
begin
  -- 24-hour reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_24h_at is not null
      and b.reminder_24h_at <= p_now
      and b.reminder_24h_sent_at is null
    order by b.reminder_24h_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'info',
      'Tu reserva es mañana',
      'Recuerda tu viaje de ' || v_booking.pickup_address || ' a ' || v_booking.dropoff_address || '.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '24h'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_24h_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_24h := v_24h + 1;
  end loop;

  -- 2-hour reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_2h_at is not null
      and b.reminder_2h_at <= p_now
      and b.reminder_2h_sent_at is null
    order by b.reminder_2h_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'info',
      'Tu reserva sale en 2 horas',
      'Comprueba el origen, el destino y las necesidades especiales antes del despacho.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '2h'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_2h_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_2h := v_2h + 1;
  end loop;

  -- 30-minute reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_30m_at is not null
      and b.reminder_30m_at <= p_now
      and b.reminder_30m_sent_at is null
    order by b.reminder_30m_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'warning',
      'Tu taxi se buscará en breve',
      'En aproximadamente 15 minutos comenzaremos a buscar un conductor verificado.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '30m'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_30m_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_30m := v_30m + 1;
  end loop;

  -- Convert reservations into normal pending rides 15 minutes before pickup.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.scheduled_at <= p_now + interval '15 minutes'
    order by b.scheduled_at
    for update skip locked
  loop
    update public.taxi_scheduled_bookings
    set dispatch_attempts = dispatch_attempts + 1,
        last_processing_attempt_at = p_now
    where id = v_booking.id;

    if v_booking.dispatched_ride_id is not null then
      update public.taxi_scheduled_bookings
      set status = 'dispatched',
          last_processing_error = null
      where id = v_booking.id;
      continue;
    end if;

    select exists (
      select 1
      from public.taxi_rides r
      where r.passenger_id = v_booking.passenger_id
        and r.status in ('pending', 'assigned', 'in_progress')
    ) into v_active_ride;

    if v_active_ride then
      update public.taxi_scheduled_bookings
      set last_processing_error = 'PASSENGER_HAS_ACTIVE_RIDE'
      where id = v_booking.id;
      v_deferred := v_deferred + 1;
      continue;
    end if;

    begin
      insert into public.taxi_rides (
        passenger_id,
        passenger_name,
        pickup_address,
        dropoff_address,
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        estimated_fare,
        estimated_duration,
        distance_km,
        payment_method,
        service_type,
        service_category,
        fare_range_min,
        fare_range_max,
        fare_breakdown,
        intermediate_stops,
        passenger_requirements,
        scheduled_booking_id,
        status
      ) values (
        v_booking.passenger_id,
        coalesce(v_booking.passenger_name, 'Pasajero'),
        v_booking.pickup_address,
        v_booking.dropoff_address,
        v_booking.pickup_lat,
        v_booking.pickup_lng,
        v_booking.dropoff_lat,
        v_booking.dropoff_lng,
        v_booking.estimated_fare,
        v_booking.estimated_duration,
        v_booking.distance_km,
        v_booking.payment_method,
        case
          when v_booking.service_category = 'comfort' then 'eco'
          when v_booking.service_category in ('van', 'accessible') then 'van'
          else 'taxi'
        end,
        v_booking.service_category,
        v_booking.fare_range_min,
        v_booking.fare_range_max,
        v_booking.fare_breakdown,
        v_booking.intermediate_stops,
        v_booking.passenger_requirements,
        v_booking.id,
        'pending'
      )
      returning id into v_ride_id;
    exception
      when unique_violation then
        select r.id
        into v_ride_id
        from public.taxi_rides r
        where r.scheduled_booking_id = v_booking.id
        limit 1;
    end;

    if v_ride_id is null then
      update public.taxi_scheduled_bookings
      set last_processing_error = 'RIDE_CREATION_FAILED'
      where id = v_booking.id;
      v_deferred := v_deferred + 1;
      continue;
    end if;

    update public.taxi_scheduled_bookings
    set status = 'dispatched',
        dispatched_ride_id = v_ride_id,
        last_processing_error = null
    where id = v_booking.id;

    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'success',
      'Estamos buscando tu taxi reservado',
      'Tu reserva ya ha entrado en el despacho. Puedes seguirla desde Mis viajes.',
      '/passenger/rides',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'ride_id', v_ride_id,
        'scheduled_at', v_booking.scheduled_at
      )
    );

    insert into public.taxi_activity_logs (
      actor_id,
      actor_role,
      message,
      ride_id
    ) values (
      v_booking.passenger_id,
      'system',
      'Reserva programada activada automáticamente',
      v_ride_id
    );

    v_dispatched := v_dispatched + 1;
  end loop;

  return query
  select v_24h, v_2h, v_30m, v_dispatched, v_deferred;
end;
$$;

revoke all on function public.taximun_process_scheduled_bookings(timestamptz) from public, anon, authenticated;
grant execute on function public.taximun_process_scheduled_bookings(timestamptz) to service_role;

-- Supabase supports pg_cron. Keep one deterministic five-minute job.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'taximun-process-scheduled-bookings'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'taximun-process-scheduled-bookings',
    '*/5 * * * *',
    $cron$select public.taximun_process_scheduled_bookings();$cron$
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 20260731170000_fix_booking_concurrency_and_reminders.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #131 · Serialize active rides and reset reminders after rescheduling

create or replace function public.taximun_prevent_multiple_active_rides()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.passenger_id is null
     or new.status not in ('pending', 'assigned', 'in_progress') then
    return new;
  end if;

  -- Serialize every active-ride creation or transition for the same passenger,
  -- including immediate requests and scheduled-booking dispatches.
  perform pg_advisory_xact_lock(
    hashtextextended('taximun-active-ride:' || new.passenger_id, 0)
  );

  if exists (
    select 1
    from public.taxi_rides r
    where r.passenger_id = new.passenger_id
      and r.status in ('pending', 'assigned', 'in_progress')
      and (tg_op = 'INSERT' or r.id is distinct from new.id)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PASSENGER_ALREADY_HAS_ACTIVE_RIDE',
      hint = 'Finaliza o cancela el viaje activo antes de crear otro.';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_prevent_multiple_active_rides
on public.taxi_rides;

create trigger taximun_prevent_multiple_active_rides
before insert or update of passenger_id, status
on public.taxi_rides
for each row
execute function public.taximun_prevent_multiple_active_rides();


create or replace function public.taximun_set_booking_reminders()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_reminder_24h_at timestamptz;
  v_reminder_2h_at timestamptz;
  v_reminder_30m_at timestamptz;
begin
  new.updated_at := now();

  v_reminder_24h_at := case
    when new.scheduled_at > now() + interval '24 hours'
      then new.scheduled_at - interval '24 hours'
    else null
  end;

  v_reminder_2h_at := case
    when new.scheduled_at > now() + interval '2 hours'
      then new.scheduled_at - interval '2 hours'
    else null
  end;

  v_reminder_30m_at := case
    when new.scheduled_at > now() + interval '30 minutes'
      then new.scheduled_at - interval '30 minutes'
    else null
  end;

  if tg_op = 'INSERT' then
    new.reminder_24h_sent_at := null;
    new.reminder_2h_sent_at := null;
    new.reminder_30m_sent_at := null;
  elsif new.scheduled_at is distinct from old.scheduled_at then
    if v_reminder_24h_at is distinct from old.reminder_24h_at then
      new.reminder_24h_sent_at := null;
    end if;

    if v_reminder_2h_at is distinct from old.reminder_2h_at then
      new.reminder_2h_sent_at := null;
    end if;

    if v_reminder_30m_at is distinct from old.reminder_30m_at then
      new.reminder_30m_sent_at := null;
    end if;
  end if;

  new.reminder_24h_at := v_reminder_24h_at;
  new.reminder_2h_at := v_reminder_2h_at;
  new.reminder_30m_at := v_reminder_30m_at;

  return new;
end;
$$;

drop trigger if exists taximun_scheduled_booking_reminders
on public.taxi_scheduled_bookings;

create trigger taximun_scheduled_booking_reminders
before insert or update of scheduled_at
on public.taxi_scheduled_bookings
for each row
execute function public.taximun_set_booking_reminders();


-- ─────────────────────────────────────────────────────────────────────
-- 20260731171500_sync_active_ride_constraint.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #132 · Keep repository migrations aligned with the production-safe active ride constraint

-- Remove the trigger-based guard introduced by PR #131. Its exception can abort
-- the whole scheduled-booking batch when an immediate ride wins the race.
drop trigger if exists taximun_prevent_multiple_active_rides
on public.taxi_rides;

drop function if exists public.taximun_prevent_multiple_active_rides();

-- Refuse the migration with an actionable report when a legacy database already
-- contains more than one active ride for the same passenger. Do not silently
-- cancel or alter real trips during a schema migration.
do $$
declare
  v_duplicates text;
begin
  select string_agg(passenger_id || ' (' || active_count || ' viajes)', ', ' order by passenger_id)
  into v_duplicates
  from (
    select passenger_id, count(*) as active_count
    from public.taxi_rides
    where passenger_id is not null
      and status in ('pending', 'assigned', 'in_progress')
    group by passenger_id
    having count(*) > 1
  ) duplicates;

  if v_duplicates is not null then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_ACTIVE_RIDES: ' || v_duplicates,
      hint = 'Revisa y resuelve los viajes activos duplicados indicados antes de volver a ejecutar esta migración.';
  end if;
end;
$$;

-- Enforce one active ride per passenger atomically at the database level.
-- This covers immediate requests, scheduled dispatches and future entry points.
create unique index if not exists taxi_rides_one_active_per_passenger_idx
  on public.taxi_rides(passenger_id)
  where passenger_id is not null
    and status in ('pending', 'assigned', 'in_progress');


-- ─────────────────────────────────────────────────────────────────────
-- 20260802003000_ride_tips_and_aftercare.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #136 · Real ride tips and aftercare traceability

create table if not exists public.taxi_ride_tips (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  passenger_id text not null,
  driver_id text not null,
  amount_cents integer not null check (amount_cents between 50 and 50000),
  currency text not null default 'eur' check (currency = 'eur'),
  method text not null check (method in ('card', 'cash', 'bizum')),
  status text not null check (status in ('checkout_pending', 'pending_confirmation', 'paid', 'cancelled', 'failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  declared_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ride_id)
);

create index if not exists taxi_ride_tips_driver_pending_idx
  on public.taxi_ride_tips(driver_id, created_at desc)
  where status = 'pending_confirmation';

create index if not exists taxi_ride_tips_passenger_idx
  on public.taxi_ride_tips(passenger_id, created_at desc);

alter table public.taxi_ride_tips enable row level security;
revoke all on table public.taxi_ride_tips from anon, authenticated;
grant all on table public.taxi_ride_tips to service_role;

create or replace function public.taximun_touch_ride_tip()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists taximun_touch_ride_tip on public.taxi_ride_tips;
create trigger taximun_touch_ride_tip
before update on public.taxi_ride_tips
for each row execute function public.taximun_touch_ride_tip();


-- ─────────────────────────────────────────────────────────────────────
-- 20260802220000_fix_card_tip_settlement.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #137 · Reconcile and route card tips through Stripe Connect

alter table public.taxi_ride_tips
  add column if not exists stripe_destination_account_id text,
  add column if not exists payout_status text,
  add column if not exists last_stripe_event_id text,
  add column if not exists last_stripe_event_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxi_ride_tips_payout_status_check'
      and conrelid = 'public.taxi_ride_tips'::regclass
  ) then
    alter table public.taxi_ride_tips
      add constraint taxi_ride_tips_payout_status_check
      check (
        payout_status is null
        or payout_status in ('pending', 'destination_configured', 'paid', 'failed', 'cancelled')
      );
  end if;
end;
$$;

create unique index if not exists taxi_ride_tips_checkout_session_unique_idx
  on public.taxi_ride_tips(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists taxi_ride_tips_card_pending_idx
  on public.taxi_ride_tips(updated_at)
  where method = 'card' and status = 'checkout_pending';


-- ─────────────────────────────────────────────────────────────────────
-- 20260803160000_server_pricing_and_promotions.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #140 · Server-authoritative pricing, promotions and quote traceability

create table if not exists public.taxi_promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2),
  minimum_subtotal numeric(10,2) not null default 0 check (minimum_subtotal >= 0),
  eligible_categories text[] not null default array['standard','comfort','van','accessible']::text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_total_uses integer,
  max_uses_per_user integer not null default 1 check (max_uses_per_user > 0),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_promotions_code_uppercase check (code = upper(code)),
  constraint taxi_promotions_percent_valid check (discount_type <> 'percent' or discount_value <= 100),
  constraint taxi_promotions_dates_valid check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.taxi_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.taxi_promotions(id) on delete restrict,
  passenger_id text not null,
  ride_id uuid references public.taxi_rides(id) on delete cascade,
  scheduled_booking_id uuid references public.taxi_scheduled_bookings(id) on delete cascade,
  subtotal numeric(10,2) not null,
  discount_amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  constraint taxi_promotion_redemption_target check (
    (ride_id is not null and scheduled_booking_id is null)
    or (ride_id is null and scheduled_booking_id is not null)
  )
);

create unique index if not exists taxi_promotion_redemptions_ride_unique_idx
  on public.taxi_promotion_redemptions(ride_id)
  where ride_id is not null;

create unique index if not exists taxi_promotion_redemptions_booking_unique_idx
  on public.taxi_promotion_redemptions(scheduled_booking_id)
  where scheduled_booking_id is not null;

create index if not exists taxi_promotion_redemptions_usage_idx
  on public.taxi_promotion_redemptions(promotion_id, passenger_id, created_at desc);

create index if not exists taxi_promotions_active_window_idx
  on public.taxi_promotions(active, starts_at, ends_at);

alter table public.taxi_scheduled_bookings
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(10,2) not null default 0,
  add column if not exists fare_subtotal numeric(10,2),
  add column if not exists quote_version text,
  add column if not exists quoted_at timestamptz;

alter table public.taxi_rides
  add column if not exists fare_subtotal numeric(10,2),
  add column if not exists quote_version text,
  add column if not exists quoted_at timestamptz;

create or replace function public.taximun_touch_promotion()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.code := upper(trim(new.code));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists taximun_touch_promotion on public.taxi_promotions;
create trigger taximun_touch_promotion
before insert or update on public.taxi_promotions
for each row execute function public.taximun_touch_promotion();

alter table public.taxi_promotions enable row level security;
alter table public.taxi_promotion_redemptions enable row level security;
revoke all on table public.taxi_promotions from anon, authenticated;
revoke all on table public.taxi_promotion_redemptions from anon, authenticated;
grant all on table public.taxi_promotions to service_role;
grant all on table public.taxi_promotion_redemptions to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260803223000_promotion_integrity_and_madrid_time.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #141 · Atomic promotion redemption integrity

create or replace function public.taximun_reserve_promotion_redemption(
  p_promotion_id uuid,
  p_passenger_id text,
  p_ride_id uuid default null,
  p_scheduled_booking_id uuid default null,
  p_category text default 'standard',
  p_subtotal numeric default 0
)
returns table (
  redemption_id uuid,
  promotion_code text,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_promotion public.taxi_promotions%rowtype;
  v_total_uses integer;
  v_user_uses integer;
  v_raw_discount numeric;
  v_discount numeric;
  v_redemption_id uuid;
begin
  if (p_ride_id is null) = (p_scheduled_booking_id is null) then
    raise exception 'PROMOTION_TARGET_INVALID';
  end if;

  -- Serialize definitive redemption checks. This deliberately favors correctness
  -- over throughput because promotion redemption volume is low and financial.
  perform pg_advisory_xact_lock(839201, 141);

  if p_ride_id is not null and not exists (
    select 1 from public.taxi_rides
    where id = p_ride_id and passenger_id = p_passenger_id
  ) then
    raise exception 'PROMOTION_TARGET_NOT_OWNED';
  end if;

  if p_scheduled_booking_id is not null and not exists (
    select 1 from public.taxi_scheduled_bookings
    where id = p_scheduled_booking_id
      and passenger_id = p_passenger_id
      and status = 'scheduled'
  ) then
    raise exception 'PROMOTION_TARGET_NOT_OWNED';
  end if;

  select * into v_promotion
  from public.taxi_promotions
  where id = p_promotion_id
  for update;

  if not found
     or not v_promotion.active
     or v_promotion.starts_at > now()
     or (v_promotion.ends_at is not null and v_promotion.ends_at <= now()) then
    raise exception 'PROMOTION_NOT_ACTIVE';
  end if;

  if not (p_category = any(v_promotion.eligible_categories)) then
    raise exception 'PROMOTION_CATEGORY_NOT_ELIGIBLE';
  end if;

  if p_subtotal < v_promotion.minimum_subtotal then
    raise exception 'PROMOTION_MINIMUM_NOT_MET';
  end if;

  -- A booking being edited replaces its own redemption inside this transaction.
  if p_ride_id is not null then
    delete from public.taxi_promotion_redemptions where ride_id = p_ride_id;
  else
    delete from public.taxi_promotion_redemptions where scheduled_booking_id = p_scheduled_booking_id;
  end if;

  select count(*) into v_total_uses
  from public.taxi_promotion_redemptions
  where promotion_id = p_promotion_id;

  select count(*) into v_user_uses
  from public.taxi_promotion_redemptions
  where promotion_id = p_promotion_id
    and passenger_id = p_passenger_id;

  if v_promotion.max_total_uses is not null
     and v_total_uses >= v_promotion.max_total_uses then
    raise exception 'PROMOTION_TOTAL_LIMIT_REACHED';
  end if;

  if v_user_uses >= v_promotion.max_uses_per_user then
    raise exception 'PROMOTION_USER_LIMIT_REACHED';
  end if;

  v_raw_discount := case
    when v_promotion.discount_type = 'percent'
      then p_subtotal * v_promotion.discount_value / 100
    else v_promotion.discount_value
  end;

  v_discount := least(
    p_subtotal,
    greatest(
      0,
      case
        when v_promotion.max_discount is null then v_raw_discount
        else least(v_raw_discount, v_promotion.max_discount)
      end
    )
  );

  insert into public.taxi_promotion_redemptions (
    promotion_id,
    passenger_id,
    ride_id,
    scheduled_booking_id,
    subtotal,
    discount_amount
  ) values (
    p_promotion_id,
    p_passenger_id,
    p_ride_id,
    p_scheduled_booking_id,
    round(p_subtotal, 2),
    round(v_discount, 2)
  )
  returning id into v_redemption_id;

  return query select v_redemption_id, v_promotion.code, round(v_discount, 2);
end;
$$;

revoke all on function public.taximun_reserve_promotion_redemption(
  uuid, text, uuid, uuid, text, numeric
) from public, anon, authenticated;

grant execute on function public.taximun_reserve_promotion_redemption(
  uuid, text, uuid, uuid, text, numeric
) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260806223000_atomic_booking_promotion_integrity.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #143 · Atomic booking, promotion and verification integrity

-- Keep repository migrations aligned with the manual production safety cleanup.
drop trigger if exists taximun_preserve_driver_verification_personal_update
  on public.taxi_user_profiles;

drop function if exists public.taximun_preserve_driver_verification_on_personal_update();

create or replace function public.taximun_commit_priced_booking(
  p_operation text,
  p_payload jsonb,
  p_promotion_id uuid default null,
  p_target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_passenger_id text := nullif(trim(p_payload->>'passenger_id'), '');
  v_category text := coalesce(nullif(trim(p_payload->>'service_category'), ''), 'standard');
  v_subtotal numeric := coalesce((p_payload->>'fare_subtotal')::numeric, 0);
  v_discount numeric := 0;
  v_promo_code text := null;
  v_total numeric;
  v_ride public.taxi_rides%rowtype;
  v_booking public.taxi_scheduled_bookings%rowtype;
  v_redemption record;
begin
  if p_operation not in ('create_immediate', 'create_scheduled', 'update_scheduled') then
    raise exception 'BOOKING_OPERATION_INVALID';
  end if;

  if v_passenger_id is null then
    raise exception 'BOOKING_PASSENGER_REQUIRED';
  end if;

  if v_subtotal < 0 then
    raise exception 'BOOKING_SUBTOTAL_INVALID';
  end if;

  -- Serialize operations for the same passenger, including concurrent double taps.
  perform pg_advisory_xact_lock(hashtextextended(v_passenger_id, 143));

  if p_operation = 'create_immediate' then
    if exists (
      select 1
      from public.taxi_rides
      where passenger_id = v_passenger_id
        and status in ('pending', 'assigned', 'in_progress')
    ) then
      raise exception 'ACTIVE_RIDE_EXISTS';
    end if;

    insert into public.taxi_rides (
      passenger_id,
      passenger_name,
      pickup_address,
      dropoff_address,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      estimated_fare,
      fare_subtotal,
      fare_range_min,
      fare_range_max,
      estimated_duration,
      distance_km,
      payment_method,
      service_type,
      service_category,
      intermediate_stops,
      passenger_requirements,
      fare_breakdown,
      promo_code,
      promo_discount,
      quote_version,
      quoted_at,
      status
    ) values (
      v_passenger_id,
      coalesce(nullif(p_payload->>'passenger_name', ''), 'Pasajero'),
      p_payload->>'pickup_address',
      p_payload->>'dropoff_address',
      nullif(p_payload->>'pickup_lat', '')::double precision,
      nullif(p_payload->>'pickup_lng', '')::double precision,
      nullif(p_payload->>'dropoff_lat', '')::double precision,
      nullif(p_payload->>'dropoff_lng', '')::double precision,
      v_subtotal,
      v_subtotal,
      round(v_subtotal * 0.90, 2),
      round(v_subtotal * 1.12, 2),
      coalesce((p_payload->>'estimated_duration')::integer, 0),
      coalesce((p_payload->>'distance_km')::numeric, 0),
      p_payload->>'payment_method',
      p_payload->>'service_type',
      v_category,
      coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
      coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
      coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
      null,
      0,
      p_payload->>'quote_version',
      coalesce((p_payload->>'quoted_at')::timestamptz, now()),
      'pending'
    )
    returning * into v_ride;

  elsif p_operation = 'create_scheduled' then
    if (p_payload->>'scheduled_at')::timestamptz < now() + interval '15 minutes' then
      raise exception 'SCHEDULED_TOO_SOON';
    end if;

    insert into public.taxi_scheduled_bookings (
      passenger_id,
      passenger_name,
      pickup_address,
      dropoff_address,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      scheduled_at,
      service_category,
      payment_method,
      intermediate_stops,
      passenger_requirements,
      fare_breakdown,
      estimated_fare,
      fare_subtotal,
      fare_range_min,
      fare_range_max,
      estimated_duration,
      distance_km,
      promo_code,
      promo_discount,
      quote_version,
      quoted_at,
      status
    ) values (
      v_passenger_id,
      coalesce(nullif(p_payload->>'passenger_name', ''), 'Pasajero'),
      p_payload->>'pickup_address',
      p_payload->>'dropoff_address',
      nullif(p_payload->>'pickup_lat', '')::double precision,
      nullif(p_payload->>'pickup_lng', '')::double precision,
      nullif(p_payload->>'dropoff_lat', '')::double precision,
      nullif(p_payload->>'dropoff_lng', '')::double precision,
      (p_payload->>'scheduled_at')::timestamptz,
      v_category,
      p_payload->>'payment_method',
      coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
      coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
      coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
      v_subtotal,
      v_subtotal,
      round(v_subtotal * 0.90, 2),
      round(v_subtotal * 1.12, 2),
      coalesce((p_payload->>'estimated_duration')::integer, 0),
      coalesce((p_payload->>'distance_km')::numeric, 0),
      null,
      0,
      p_payload->>'quote_version',
      coalesce((p_payload->>'quoted_at')::timestamptz, now()),
      'scheduled'
    )
    returning * into v_booking;

  else
    if p_target_id is null then
      raise exception 'BOOKING_TARGET_REQUIRED';
    end if;

    if (p_payload->>'scheduled_at')::timestamptz < now() + interval '15 minutes' then
      raise exception 'SCHEDULED_TOO_SOON';
    end if;

    select * into v_booking
    from public.taxi_scheduled_bookings
    where id = p_target_id
      and passenger_id = v_passenger_id
      and status = 'scheduled'
    for update;

    if not found then
      raise exception 'BOOKING_NOT_EDITABLE';
    end if;

    update public.taxi_scheduled_bookings
    set pickup_address = p_payload->>'pickup_address',
        dropoff_address = p_payload->>'dropoff_address',
        pickup_lat = nullif(p_payload->>'pickup_lat', '')::double precision,
        pickup_lng = nullif(p_payload->>'pickup_lng', '')::double precision,
        dropoff_lat = nullif(p_payload->>'dropoff_lat', '')::double precision,
        dropoff_lng = nullif(p_payload->>'dropoff_lng', '')::double precision,
        scheduled_at = (p_payload->>'scheduled_at')::timestamptz,
        service_category = v_category,
        payment_method = p_payload->>'payment_method',
        intermediate_stops = coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
        passenger_requirements = coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
        fare_breakdown = coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
        estimated_fare = v_subtotal,
        fare_subtotal = v_subtotal,
        fare_range_min = round(v_subtotal * 0.90, 2),
        fare_range_max = round(v_subtotal * 1.12, 2),
        estimated_duration = coalesce((p_payload->>'estimated_duration')::integer, 0),
        distance_km = coalesce((p_payload->>'distance_km')::numeric, 0),
        promo_code = null,
        promo_discount = 0,
        quote_version = p_payload->>'quote_version',
        quoted_at = coalesce((p_payload->>'quoted_at')::timestamptz, now()),
        updated_at = now()
    where id = p_target_id
    returning * into v_booking;
  end if;

  if p_promotion_id is not null then
    if p_operation = 'create_immediate' then
      select * into v_redemption
      from public.taximun_reserve_promotion_redemption(
        p_promotion_id,
        v_passenger_id,
        v_ride.id,
        null,
        v_category,
        v_subtotal
      );
    else
      select * into v_redemption
      from public.taximun_reserve_promotion_redemption(
        p_promotion_id,
        v_passenger_id,
        null,
        v_booking.id,
        v_category,
        v_subtotal
      );
    end if;

    v_discount := coalesce(v_redemption.discount_amount, 0);
    v_promo_code := v_redemption.promotion_code;
  elsif p_operation = 'update_scheduled' then
    delete from public.taxi_promotion_redemptions
    where scheduled_booking_id = v_booking.id;
  end if;

  v_total := round(greatest(0, v_subtotal - v_discount), 2);

  if p_operation = 'create_immediate' then
    update public.taxi_rides
    set estimated_fare = v_total,
        fare_range_min = round(v_total * 0.90, 2),
        fare_range_max = round(v_total * 1.12, 2),
        promo_code = v_promo_code,
        promo_discount = v_discount,
        fare_breakdown = coalesce(fare_breakdown, '{}'::jsonb)
          || jsonb_build_object('discount', v_discount)
    where id = v_ride.id
    returning * into v_ride;

    return to_jsonb(v_ride);
  end if;

  update public.taxi_scheduled_bookings
  set estimated_fare = v_total,
      fare_range_min = round(v_total * 0.90, 2),
      fare_range_max = round(v_total * 1.12, 2),
      promo_code = v_promo_code,
      promo_discount = v_discount,
      fare_breakdown = coalesce(fare_breakdown, '{}'::jsonb)
        || jsonb_build_object('discount', v_discount),
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return to_jsonb(v_booking);
exception
  when unique_violation then
    if p_operation = 'create_immediate' then
      raise exception 'ACTIVE_RIDE_EXISTS';
    end if;
    raise;
end;
$$;

revoke all on function public.taximun_commit_priced_booking(text, jsonb, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.taximun_commit_priced_booking(text, jsonb, uuid, uuid)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260806223500_atomic_scheduled_cancellation.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #143 · Atomic scheduled cancellation and promotion release

create or replace function public.taximun_cancel_scheduled_booking(
  p_booking_id uuid,
  p_passenger_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_booking_id uuid;
begin
  select id into v_booking_id
  from public.taxi_scheduled_bookings
  where id = p_booking_id
    and passenger_id = p_passenger_id
    and status = 'scheduled'
  for update;

  if not found then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;

  update public.taxi_scheduled_bookings
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = v_booking_id;

  delete from public.taxi_promotion_redemptions
  where scheduled_booking_id = v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.taximun_cancel_scheduled_booking(uuid, text)
  from public, anon, authenticated;

grant execute on function public.taximun_cancel_scheduled_booking(uuid, text)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260807013000_atomic_driver_profile_verification.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #145 · Atomic driver profile verification saves

create or replace function public.taximun_upsert_user_profile_atomic(
  p_user_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.taxi_user_profiles%rowtype;
  v_saved public.taxi_user_profiles%rowtype;
  v_role text := coalesce(nullif(trim(p_payload->>'role'), ''), 'passenger');
  v_full_name text := nullif(trim(p_payload->>'full_name'), '');
  v_professional_changed boolean := false;
  v_next_status text;
  v_next_verified boolean;
begin
  if v_full_name is null then
    raise exception 'PROFILE_FULL_NAME_REQUIRED';
  end if;

  select *
  into v_existing
  from public.taxi_user_profiles
  where user_id = p_user_id
  for update;

  if found and v_role = 'driver' and v_existing.role = 'driver' then
    v_professional_changed :=
      coalesce(trim(v_existing.driver_license_number), '') is distinct from coalesce(trim(p_payload->>'driver_license_number'), '')
      or coalesce(trim(v_existing.taxi_code), '') is distinct from coalesce(trim(p_payload->>'taxi_code'), '')
      or coalesce(trim(v_existing.plate), '') is distinct from coalesce(trim(p_payload->>'plate'), '')
      or coalesce(trim(v_existing.vehicle_model), '') is distinct from coalesce(trim(p_payload->>'vehicle_model'), '')
      or coalesce(trim(v_existing.work_zone), '') is distinct from coalesce(trim(p_payload->>'work_zone'), '');
  end if;

  if v_role <> 'driver' then
    v_next_status := 'approved';
    v_next_verified := true;
  elsif not found then
    v_next_status := 'in_review';
    v_next_verified := false;
  elsif v_existing.role <> 'driver' or v_professional_changed then
    v_next_status := 'in_review';
    v_next_verified := false;
  else
    v_next_status := v_existing.verification_status;
    v_next_verified := v_existing.is_verified;
  end if;

  insert into public.taxi_user_profiles (
    user_id,
    role,
    full_name,
    phone,
    avatar_url,
    preferred_payment_method,
    favorite_address,
    emergency_contact_name,
    emergency_contact_phone,
    driver_license_number,
    taxi_code,
    plate,
    vehicle_model,
    work_zone,
    verification_status,
    is_verified
  )
  values (
    p_user_id,
    v_role,
    v_full_name,
    nullif(trim(p_payload->>'phone'), ''),
    nullif(trim(p_payload->>'avatar_url'), ''),
    coalesce(nullif(trim(p_payload->>'preferred_payment_method'), ''), 'cash'),
    nullif(trim(p_payload->>'favorite_address'), ''),
    nullif(trim(p_payload->>'emergency_contact_name'), ''),
    nullif(trim(p_payload->>'emergency_contact_phone'), ''),
    nullif(trim(p_payload->>'driver_license_number'), ''),
    nullif(trim(p_payload->>'taxi_code'), ''),
    nullif(trim(p_payload->>'plate'), ''),
    nullif(trim(p_payload->>'vehicle_model'), ''),
    nullif(trim(p_payload->>'work_zone'), ''),
    v_next_status,
    v_next_verified
  )
  on conflict (user_id) do update
  set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    avatar_url = excluded.avatar_url,
    preferred_payment_method = excluded.preferred_payment_method,
    favorite_address = excluded.favorite_address,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    driver_license_number = excluded.driver_license_number,
    taxi_code = excluded.taxi_code,
    plate = excluded.plate,
    vehicle_model = excluded.vehicle_model,
    work_zone = excluded.work_zone,
    verification_status = excluded.verification_status,
    is_verified = excluded.is_verified,
    updated_at = now()
  returning * into v_saved;

  return to_jsonb(v_saved);
end;
$$;

revoke all
on function public.taximun_upsert_user_profile_atomic(text, jsonb)
from public, anon, authenticated;

grant execute
on function public.taximun_upsert_user_profile_atomic(text, jsonb)
to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260807193000_authoritative_booking_payment_guard.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #147 · Authoritative booking and payment-method integrity

create or replace function public.taximun_guard_authoritative_ride_insert()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_booking public.taxi_scheduled_bookings%rowtype;
begin
  if new.scheduled_booking_id is not null then
    select *
    into v_booking
    from public.taxi_scheduled_bookings
    where id = new.scheduled_booking_id;

    if not found then
      raise exception 'SCHEDULED_BOOKING_NOT_FOUND';
    end if;

    new.fare_subtotal := coalesce(new.fare_subtotal, v_booking.fare_subtotal, v_booking.estimated_fare);
    new.promo_code := coalesce(new.promo_code, v_booking.promo_code);
    new.promo_discount := coalesce(new.promo_discount, v_booking.promo_discount, 0);
    new.quote_version := coalesce(new.quote_version, v_booking.quote_version);
    new.quoted_at := coalesce(new.quoted_at, v_booking.quoted_at);
  end if;

  if new.status = 'pending'
     and new.scheduled_booking_id is null
     and nullif(trim(new.quote_version), '') is null then
    raise exception 'SERVER_PRICING_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_guard_authoritative_ride_insert
  on public.taxi_rides;

create trigger taximun_guard_authoritative_ride_insert
before insert
on public.taxi_rides
for each row
execute function public.taximun_guard_authoritative_ride_insert();

create or replace function public.taximun_lock_active_ride_payment_method()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if old.status in ('pending', 'assigned', 'in_progress')
     and new.payment_method is distinct from old.payment_method then
    raise exception 'PAYMENT_METHOD_LOCKED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_lock_active_ride_payment_method
  on public.taxi_rides;

create trigger taximun_lock_active_ride_payment_method
before update
on public.taxi_rides
for each row
execute function public.taximun_lock_active_ride_payment_method();


-- ─────────────────────────────────────────────────────────────────────
-- 20260810114500_zero_fare_payment_ledger_integrity.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #153 · Zero-fare Stripe ledger integrity and idempotent refunds

create or replace function public.taximun_record_payment_refund_atomic(
  p_payment_id uuid,
  p_provider_refund_id text,
  p_amount integer,
  p_reason text,
  p_status text,
  p_requested_by text
)
returns public.taxi_payments
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_payment public.taxi_payments%rowtype;
  v_existing_refund public.taxi_payment_refunds%rowtype;
  v_next_refunded integer;
  v_should_apply_amount boolean := false;
  v_refund_status text := coalesce(nullif(trim(p_status), ''), 'pending');
begin
  if p_amount <= 0 then
    raise exception 'REFUND_AMOUNT_INVALID';
  end if;

  if nullif(trim(p_provider_refund_id), '') is null then
    raise exception 'REFUND_PROVIDER_ID_REQUIRED';
  end if;

  if p_reason not in ('duplicate', 'fraudulent', 'requested_by_customer') then
    raise exception 'REFUND_REASON_INVALID';
  end if;

  if v_refund_status = 'canceled' then
    v_refund_status := 'cancelled';
  end if;

  if v_refund_status not in ('pending', 'succeeded', 'failed', 'cancelled') then
    v_refund_status := 'pending';
  end if;

  select *
  into v_payment
  from public.taxi_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  select *
  into v_existing_refund
  from public.taxi_payment_refunds
  where provider_refund_id = p_provider_refund_id;

  if found then
    if v_existing_refund.payment_id is distinct from p_payment_id then
      raise exception 'REFUND_PAYMENT_MISMATCH';
    end if;

    if v_existing_refund.amount is distinct from p_amount then
      raise exception 'REFUND_AMOUNT_MISMATCH';
    end if;

    -- Stripe refund terminal states must never move backwards on a stale retry.
    if v_existing_refund.status in ('succeeded', 'failed', 'cancelled') then
      v_refund_status := v_existing_refund.status;
    elsif v_refund_status = 'succeeded' then
      v_should_apply_amount := true;
    end if;

    update public.taxi_payment_refunds
    set status = v_refund_status
    where id = v_existing_refund.id;
  else
    insert into public.taxi_payment_refunds (
      payment_id,
      provider_refund_id,
      amount,
      reason,
      status,
      requested_by
    ) values (
      p_payment_id,
      p_provider_refund_id,
      p_amount,
      p_reason,
      v_refund_status,
      p_requested_by
    );

    v_should_apply_amount := v_refund_status = 'succeeded';
  end if;

  if v_should_apply_amount then
    v_next_refunded := coalesce(v_payment.amount_refunded, 0) + p_amount;

    if v_next_refunded > v_payment.amount_captured then
      raise exception 'REFUND_EXCEEDS_CAPTURE';
    end if;

    update public.taxi_payments
    set amount_refunded = v_next_refunded,
        status = case
          when v_next_refunded = amount_captured then 'refunded'
          else 'partially_refunded'
        end,
        updated_at = now()
    where id = p_payment_id
    returning * into v_payment;
  end if;

  return v_payment;
end;
$$;

revoke all on function public.taximun_record_payment_refund_atomic(
  uuid, text, integer, text, text, text
) from public, anon, authenticated;

grant execute on function public.taximun_record_payment_refund_atomic(
  uuid, text, integer, text, text, text
) to service_role;


create or replace function public.taximun_settle_trip_atomic(
  p_ride_id uuid,
  p_driver_id text,
  p_settled_by text,
  p_driver_name text,
  p_final_fare numeric,
  p_payment_method text,
  p_payment_status text,
  p_notes text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
  v_net_paid_cents integer;
begin
  if p_final_fare < 0 or p_final_fare > 9999 then
    raise exception 'INVALID_FINAL_FARE';
  end if;

  if p_payment_method not in ('cash', 'card', 'bizum') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_payment_status not in ('paid', 'waived') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.status <> 'in_progress' then
    raise exception 'RIDE_NOT_IN_PROGRESS';
  end if;

  if p_payment_method = 'card' then
    if p_payment_status <> 'paid' then
      raise exception 'CARD_PAYMENT_MUST_BE_PAID';
    end if;

    select * into v_payment
    from public.taxi_payments
    where ride_id = p_ride_id
    for update;

    if not found then
      raise exception 'CARD_PAYMENT_LEDGER_MISSING';
    end if;

    v_expected_cents := round(p_final_fare * 100)::integer;
    v_net_paid_cents := coalesce(v_payment.amount_captured, 0) - coalesce(v_payment.amount_refunded, 0);

    if v_net_paid_cents < 0 then
      raise exception 'CARD_PAYMENT_LEDGER_INVALID';
    end if;

    if v_expected_cents = 0 then
      if v_payment.status not in ('captured', 'cancelled', 'failed', 'partially_refunded', 'refunded') then
        raise exception 'CARD_ZERO_BALANCE_NOT_READY';
      end if;
    else
      if v_payment.status not in ('captured', 'partially_refunded') then
        raise exception 'CARD_PAYMENT_NOT_CAPTURED';
      end if;
    end if;

    if v_net_paid_cents <> v_expected_cents then
      raise exception 'CARD_NET_AMOUNT_MISMATCH';
    end if;
  end if;

  update public.taxi_rides
  set final_fare = p_final_fare,
      payment_method = p_payment_method,
      payment_status = p_payment_status,
      settlement_notes = nullif(trim(p_notes), ''),
      settled_at = now(),
      settled_by = p_settled_by,
      completed_at = now(),
      status = 'completed'
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    status,
    total_earnings,
    total_rides
  ) values (
    p_driver_id,
    coalesce(nullif(trim(p_driver_name), ''), 'Conductor'),
    'available',
    p_final_fare,
    1
  )
  on conflict (driver_id) do update
  set driver_name = coalesce(nullif(excluded.driver_name, ''), public.driver_live_status.driver_name),
      status = 'available',
      total_earnings = coalesce(public.driver_live_status.total_earnings, 0) + excluded.total_earnings,
      total_rides = coalesce(public.driver_live_status.total_rides, 0) + 1;

  return v_ride;
end;
$$;

revoke all on function public.taximun_settle_trip_atomic(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;

grant execute on function public.taximun_settle_trip_atomic(
  uuid, text, text, text, numeric, text, text, text
) to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- 20260810193000_require_card_authorization_before_start.sql
-- ─────────────────────────────────────────────────────────────────────
-- PR #154 · Require real card authorization before trip start

create or replace function public.taximun_require_card_authorization_before_start()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
begin
  if new.status <> 'in_progress' or old.status = 'in_progress' then
    return new;
  end if;

  if new.payment_method <> 'card' then
    return new;
  end if;

  v_expected_cents := ceil(
    greatest(
      coalesce(new.fare_range_max, 0),
      coalesce(new.estimated_fare, 0)
    ) * 100
  )::integer;

  -- A 0 € ride does not need a Stripe hold. The existing capture(0) path
  -- records the internal zero-fare ledger before final settlement.
  if v_expected_cents = 0 then
    return new;
  end if;

  select *
  into v_payment
  from public.taxi_payments
  where ride_id = new.id
  for update;

  if not found
     or v_payment.provider <> 'stripe'
     or nullif(trim(v_payment.provider_payment_intent_id), '') is null
     or v_payment.status <> 'authorized'
     or coalesce(v_payment.amount_authorized, 0) < v_expected_cents then
    raise exception 'CARD_AUTHORIZATION_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_require_card_authorization_before_start
  on public.taxi_rides;

create trigger taximun_require_card_authorization_before_start
before update of status
on public.taxi_rides
for each row
execute function public.taximun_require_card_authorization_before_start();


-- ─────────────────────────────────────────────────────────────────────
-- 20261021120000_zone_fifo_queues.sql
-- ─────────────────────────────────────────────────────────────────────
-- Taximun — Colas FIFO por zona (aeropuerto, Sants, puerto, centro).
-- Las colas se reconcilian desde driver_live_status: entra quien está
-- disponible + verificado + sin viaje activo y con current_zone igual al
-- nombre de la zona; la posición se ordena por joined_at (FIFO). Al aceptar
-- un viaje el conductor sale de la cola y reentra por el final al quedar
-- libre, como en la cola física del aeropuerto.
-- Nota: en el servidor real el reconciliado lo ejecuta el planificador
-- (pg_cron / worker); estas tablas son el estado persistente compartido
-- con el panel de operaciones y la app del conductor.

create table if not exists public.queue_zones (
  id text primary key,
  name text not null unique,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null default 500,
  city text,
  country text default 'Spain',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_queues (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  zone_id text not null references public.queue_zones (id) on delete cascade,
  position integer not null default 0,
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un conductor solo puede estar una vez activo por zona.
create unique index if not exists driver_queues_zone_driver_active_uidx
  on public.driver_queues (zone_id, driver_id)
  where is_active;

create index if not exists driver_queues_zone_position_idx
  on public.driver_queues (zone_id, position)
  where is_active;

create index if not exists driver_queues_driver_idx
  on public.driver_queues (driver_id)
  where is_active;

alter table public.queue_zones enable row level security;
alter table public.driver_queues enable row level security;

drop policy if exists "queue zones readable by authenticated" on public.queue_zones;
create policy "queue zones readable by authenticated"
  on public.queue_zones
  for select
  to authenticated
  using (true);

drop policy if exists "queue zones admin manage" on public.queue_zones;
create policy "queue zones admin manage"
  on public.queue_zones
  for all
  to authenticated
  using (public.taximun_is_admin())
  with check (public.taximun_is_admin());

drop policy if exists "driver queues readable by authenticated" on public.driver_queues;
create policy "driver queues readable by authenticated"
  on public.driver_queues
  for select
  to authenticated
  using (true);

drop policy if exists "driver queues admin manage" on public.driver_queues;
create policy "driver queues admin manage"
  on public.driver_queues
  for all
  to authenticated
  using (public.taximun_is_admin())
  with check (public.taximun_is_admin());

-- Zonas iniciales del mercado de Barcelona (idempotente).
insert into public.queue_zones (id, name, center_lat, center_lng, radius_meters, city)
values
  ('bcn-airport-t1', 'Aeroport T1', 41.2974, 2.0833, 1500, 'Barcelona'),
  ('bcn-airport-t2', 'Aeroport T2', 41.3007, 2.0746, 1200, 'Barcelona'),
  ('bcn-sants', 'Sants Estació', 41.3795, 2.1335, 800, 'Barcelona'),
  ('bcn-port', 'Port / Cruise', 41.3535, 2.1875, 900, 'Barcelona'),
  ('bcn-centre', 'Centre', 41.3874, 2.1686, 900, 'Barcelona')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sincronización de colas: entra quien está disponible, verificado, sin viaje
-- activo y situado en la zona; sale quien deja de cumplir las condiciones.
-- La posición se ordena por joined_at (FIFO): quien vuelve a quedar libre
-- reentra por el final, como en la cola física del aeropuerto.
-- ---------------------------------------------------------------------------
create or replace function public.taximun_sync_zone_queues()
returns integer
language plpgsql
security definer
as $$
declare
  v_deactivated integer;
  v_inserted integer;
begin
  -- 1) Desactivar filas cuyo conductor ya no cumple las condiciones.
  update public.driver_queues dq
     set is_active = false,
         updated_at = now()
   where dq.is_active
     and not exists (
       select 1
         from public.driver_live_status dls
         join public.queue_zones qz on qz.id = dq.zone_id and qz.is_active
         join public.taxi_user_profiles p
           on p.user_id = dls.driver_id
          and p.role = 'driver'
          and p.verification_status = 'approved'
          and p.is_verified
        where dls.driver_id = dq.driver_id
          and dls.status = 'available'
          and trim(dls.current_zone) = qz.name
          and not exists (
            select 1 from public.taxi_rides r
             where r.driver_id = dls.driver_id
               and r.status in ('assigned', 'in_progress')
          )
     );
  get diagnostics v_deactivated = row_count;

  -- 2) Incorporar a los conductores que aplican y no tienen fila activa.
  insert into public.driver_queues (driver_id, zone_id, position, joined_at, is_active)
  select distinct dls.driver_id, qz.id, 0, now(), true
    from public.driver_live_status dls
    join public.queue_zones qz
      on qz.is_active
     and trim(dls.current_zone) = qz.name
    join public.taxi_user_profiles p
      on p.user_id = dls.driver_id
     and p.role = 'driver'
     and p.verification_status = 'approved'
     and p.is_verified
   where dls.status = 'available'
     and not exists (
       select 1 from public.taxi_rides r
        where r.driver_id = dls.driver_id
          and r.status in ('assigned', 'in_progress')
     )
     and not exists (
       select 1 from public.driver_queues dq
        where dq.driver_id = dls.driver_id
          and dq.zone_id = qz.id
          and dq.is_active
     );
  get diagnostics v_inserted = row_count;

  -- 3) Recalcular posiciones por zona (FIFO por joined_at).
  with ordered as (
    select dq.id,
           row_number() over (partition by dq.zone_id order by dq.joined_at, dq.id) as pos
      from public.driver_queues dq
      join public.queue_zones qz on qz.id = dq.zone_id and qz.is_active
     where dq.is_active
  )
  update public.driver_queues dq
     set position = ordered.pos,
         updated_at = now()
    from ordered
   where dq.id = ordered.id
     and dq.position is distinct from ordered.pos;

  return v_deactivated + v_inserted;
end;
$$;

revoke all on function public.taximun_sync_zone_queues() from public, anon, authenticated;
grant execute on function public.taximun_sync_zone_queues() to service_role;

-- Job determinista de un minuto (pg_cron), igual que el de reservas.
do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'taximun-sync-zone-queues'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'taximun-sync-zone-queues',
    '* * * * *',
    $cron$select public.taximun_sync_zone_queues();$cron$
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 20261024000000_queue_fifo_dispatch_and_atomic_exit.sql
-- ─────────────────────────────────────────────────────────────────────
-- Taximun — Paridad colas FIFO en despacho real + salida atómica de cola.
--
-- Cierra dos brechas del modo real frente al modo local:
--  1. FIFO: si el punto de recogida cae dentro de una zona con cola oficial,
--     los conductores en cola (por posición) pasan delante del resto.
--  2. Liveness/salida atómica: al aceptar un viaje el conductor sale de la
--     cola al instante (antes solo lo hacía el sync por cron, ≤1 min), y el
--     despacho no re-oferta a un conductor que ya rechazó o dejó expirar la
--     oferta de ese mismo viaje (evita bucles sobre una cabeza de cola muerta).
--
-- Solo CREATE OR REPLACE FUNCTION: seguro de re-ejecutar.

CREATE OR REPLACE FUNCTION public.taximun_accept_smart_offer(p_offer_id uuid, p_driver_id text, p_driver_name text, p_taxi_code text, p_plate text)
 RETURNS taxi_rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  offer_row public.taxi_ride_offers%rowtype;
  ride_row public.taxi_rides%rowtype;
begin
  perform public.taximun_expire_ride_offers();

  select *
  into offer_row
  from public.taxi_ride_offers
  where id = p_offer_id
  for update;

  if not found
     or offer_row.driver_id <> p_driver_id
  then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'pending'
     or offer_row.expires_at <= now()
  then
    raise exception 'OFFER_EXPIRED';
  end if;


  select *
  into ride_row
  from public.taxi_rides
  where id = offer_row.ride_id
  for update;

  if not found
     or ride_row.status <> 'pending'
  then
    raise exception 'RIDE_NOT_AVAILABLE';
  end if;


  update public.taxi_ride_offers
  set
    status = 'accepted',
    responded_at = now(),
    response_ms = greatest(
      0,
      floor(
        extract(
          epoch from (now() - offered_at)
        ) * 1000
      )::integer
    ),
    updated_at = now()
  where id = p_offer_id;


  update public.taxi_ride_offers
  set
    status = 'cancelled',
    updated_at = now()
  where ride_id = ride_row.id
    and id <> p_offer_id
    and status = 'pending';


  update public.taxi_rides
  set
    status = 'assigned',
    driver_id = p_driver_id,
    driver_name = p_driver_name,
    taxi_code = p_taxi_code,
    plate = p_plate,
    assigned_at = now()
  where id = ride_row.id
  returning *
  into ride_row;


  update public.driver_live_status
  set
    status = 'busy',
    offers_accepted =
      coalesce(offers_accepted, 0) + 1,
    updated_at = now()
  where driver_id = p_driver_id;



  -- Salida atómica de la cola FIFO al aceptar (paridad con el modo local).
  update public.driver_queues
  set is_active = false,
      updated_at = now()
  where driver_id = p_driver_id
    and is_active = true;

  return ride_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_accept_ride_transactional(p_ride_id uuid, p_driver_id text, p_driver_name text, p_taxi_code text, p_plate text)
 RETURNS taxi_rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver_is_busy boolean := false;
  v_driver_has_active_ride boolean := false;
begin
  -- Serialize accept attempts by the same driver.
  perform pg_advisory_xact_lock(hashtext('taximun-driver-accept:' || p_driver_id));

  if not public.taximun_driver_can_operate(p_driver_id) then
    raise exception 'DRIVER_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.taxi_rides r
    where r.driver_id = p_driver_id
      and r.status in ('assigned', 'in_progress')
  ) into v_driver_has_active_ride;

  if v_driver_has_active_ride then
    raise exception 'DRIVER_ALREADY_HAS_ACTIVE_RIDE' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.driver_live_status d
    where d.driver_id = p_driver_id
      and d.status = 'busy'
  ) into v_driver_is_busy;

  if v_driver_is_busy then
    raise exception 'DRIVER_IS_BUSY' using errcode = 'P0001';
  end if;

  -- Lock this ride row so only one accept can win.
  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_ride.status <> 'pending' then
    raise exception 'RIDE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_ride.passenger_id = p_driver_id then
    raise exception 'DRIVER_CANNOT_ACCEPT_OWN_RIDE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.taxi_ride_rejections rr
    where rr.ride_id = p_ride_id
      and rr.driver_id = p_driver_id
  ) then
    raise exception 'DRIVER_ALREADY_REJECTED_RIDE' using errcode = 'P0001';
  end if;

  update public.taxi_rides
  set
    driver_id = p_driver_id,
    driver_name = coalesce(nullif(p_driver_name, ''), 'Conductor'),
    taxi_code = coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    plate = coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    status = 'assigned',
    assigned_at = now()
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    taxi_code,
    plate,
    status,
    current_zone
  ) values (
    p_driver_id,
    coalesce(nullif(p_driver_name, ''), 'Conductor'),
    coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    'busy',
    'Barcelona'
  )
  on conflict (driver_id) do update
  set
    driver_name = excluded.driver_name,
    taxi_code = excluded.taxi_code,
    plate = excluded.plate,
    status = 'busy',
    updated_at = now();


  -- Salida atómica de la cola FIFO al aceptar (paridad con el modo local).
  update public.driver_queues
  set is_active = false,
      updated_at = now()
  where driver_id = p_driver_id
    and is_active = true;

  return v_ride;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_server_dispatch(p_ride_id uuid, p_offer_seconds integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer :=
    greatest(10, least(coalesce(p_offer_seconds, 25), 90));
  v_candidate_count integer := 0;
  v_queue_zone_id text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_ride_id::text, 0)
  );

  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'RIDE_NOT_FOUND'
    );
  end if;

  if v_ride.status <> 'pending'
     or v_ride.driver_id is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'RIDE_ALREADY_PROCESSED',
      'rideId', v_ride.id,
      'status', v_ride.status,
      'driverId', v_ride.driver_id
    );
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'expiredBy',
          'smart_dispatch'
        )
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at <= now();

  select *
  into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ACTIVE_OFFER_EXISTS',
      'rideId', p_ride_id,
      'offerId', v_offer.id,
      'driverId', v_offer.driver_id,
      'expiresAt', v_offer.expires_at
    );
  end if;


  -- Zona con cola oficial que contiene el punto de recogida (FIFO por zona).
  select id
  into v_queue_zone_id
  from (
    select
      z.id,
      z.radius_meters,
      public.taximun_distance_km(
        z.center_lat::double precision,
        z.center_lng::double precision,
        v_ride.pickup_lat::double precision,
        v_ride.pickup_lng::double precision
      ) * 1000 as dist_m
    from public.queue_zones z
    where z.is_active = true
  ) zd
  where zd.dist_m <= zd.radius_meters
  order by zd.dist_m asc
  limit 1;

  with candidates as (
    select
      d.driver_id,
      d.driver_name,
      d.taxi_code,
      d.plate,
      d.current_lat,
      d.current_lng,
      d.location_updated_at as updated_at,
      coalesce(d.offers_received, 0) as offers_received,
      coalesce(p.rating, 5.0) as driver_rating,
      (
        select dq.position
        from public.driver_queues dq
        where dq.driver_id = d.driver_id
          and dq.zone_id = v_queue_zone_id
          and dq.is_active = true
        limit 1
      ) as queue_position,
      6371 * 2 * asin(
        sqrt(
          power(
            sin(
              radians(
                (d.current_lat - v_ride.pickup_lat) / 2
              )
            ),
            2
          )
          +
          cos(radians(v_ride.pickup_lat))
          * cos(radians(d.current_lat))
          * power(
              sin(
                radians(
                  (d.current_lng - v_ride.pickup_lng) / 2
                )
              ),
              2
            )
        )
      ) as distance_km,
      greatest(
        0,
        extract(
          epoch from (
            now() - d.location_updated_at
          )
        )
      )::integer as freshness_seconds,
      (
        select count(*)
        from public.taxi_ride_offers ro
        where ro.ride_id = p_ride_id
          and ro.driver_id = d.driver_id
          and ro.status in ('rejected', 'expired')
      ) as rejection_count
    from public.driver_live_status d
    left join public.taxi_user_profiles p
      on p.user_id = d.driver_id
     and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null
      and d.location_updated_at >= now() - interval '3 minutes'
      and not exists (
        select 1
        from public.taxi_ride_offers ro
        where ro.ride_id = p_ride_id
          and ro.driver_id = d.driver_id
          and ro.status in ('rejected', 'expired')
      )
      and not exists (
        select 1
        from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in ('assigned', 'in_progress')
      )
  ),
  scored as (
    select
      *,
      coalesce(queue_position, 999999) as queue_rank,
      greatest(
        1,
        ceil(distance_km / 0.45)
      )::integer as eta_minutes,
      offers_received * 0.12 as fairness_penalty,
      rejection_count * 2.5 as rejection_penalty,
      distance_km * 10
        + greatest(0, 5 - driver_rating) * 3
        + freshness_seconds / 30.0
        + offers_received * 0.12
        + rejection_count * 2.5 as final_score
    from candidates
  )
  select
    *,
    count(*) over()
  into v_driver
  from scored
  order by queue_rank asc, final_score asc, updated_at desc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(
      ride_id,
      result_code,
      candidate_count
    )
    values (
      p_ride_id,
      'NO_DRIVER_AVAILABLE',
      0
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'NO_DRIVER_AVAILABLE',
      'rideId', p_ride_id
    );
  end if;

  v_candidate_count := coalesce(v_driver.count, 1);

  insert into public.taxi_ride_offers(
    ride_id,
    driver_id,
    status,
    offered_at,
    expires_at,
    metadata
  )
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch_v1',
      'distanceKm',
      round(v_driver.distance_km::numeric, 3),
      'etaMinutes',
      v_driver.eta_minutes,
      'driverRating',
      v_driver.driver_rating,
      'finalScore',
      round(v_driver.final_score::numeric, 4),
      'candidateCount',
      v_candidate_count
    )
  )
  returning *
  into v_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received =
        coalesce(offers_received, 0) + 1,
      updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id,
    driver_id,
    offer_id,
    result_code,
    distance_km,
    estimated_eta_minutes,
    driver_rating,
    freshness_seconds,
    fairness_penalty,
    rejection_penalty,
    final_score,
    candidate_count,
    metadata
  )
  values (
    p_ride_id,
    v_driver.driver_id,
    v_offer.id,
    'OFFER_CREATED',
    round(v_driver.distance_km::numeric, 3),
    v_driver.eta_minutes,
    v_driver.driver_rating,
    v_driver.freshness_seconds,
    v_driver.fairness_penalty,
    v_driver.rejection_penalty,
    round(v_driver.final_score::numeric, 4),
    v_candidate_count,
    jsonb_build_object(
      'offerSeconds',
      v_seconds
    )
  );

  insert into public.taxi_activity_logs(
    actor_id,
    actor_role,
    message,
    ride_id
  )
  values (
    v_driver.driver_id,
    'system',
    'Oferta creada por Smart Dispatch v1',
    p_ride_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceKm',
    round(v_driver.distance_km::numeric, 3),
    'etaMinutes',
    v_driver.eta_minutes,
    'driverRating',
    v_driver.driver_rating,
    'finalScore',
    round(v_driver.final_score::numeric, 4),
    'candidateCount',
    v_candidate_count,
    'algorithmVersion',
    'smart_dispatch_v1'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_claim_smart_offer(p_driver_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing_offer record;
  candidate_ride record;
  best_driver record;
  created_offer record;
  driver_row record;
  distance_km double precision;
  eta_minutes integer;
  v_queue_zone_id text;
begin
  perform public.taximun_expire_ride_offers();

  select
    o.*,
    r.pickup_address,
    r.dropoff_address,
    r.estimated_fare,
    r.estimated_duration,
    r.distance_km as trip_distance_km,
    r.payment_method,
    r.service_type,
    r.passenger_name,
    r.pickup_lat,
    r.pickup_lng,
    r.dropoff_lat,
    r.dropoff_lng
  into existing_offer
  from public.taxi_ride_offers o
  join public.taxi_rides r
    on r.id = o.ride_id
  where o.driver_id = p_driver_id
    and o.status = 'pending'
    and o.expires_at > now()
  order by o.offered_at desc
  limit 1;

  if found then
    return to_jsonb(existing_offer);
  end if;


  select d.*
  into driver_row
  from public.driver_live_status d
  join public.taxi_user_profiles p
    on p.user_id = d.driver_id
   and p.role = 'driver'
  where d.driver_id = p_driver_id
    and d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and d.updated_at >=
      now() - interval '2 minutes'
    and p.is_verified = true
    and not exists (
      select 1
      from public.taxi_rides ar
      where ar.driver_id = p_driver_id
        and ar.status in (
          'assigned',
          'in_progress'
        )
    )
  limit 1;

  if not found then
    return null;
  end if;


  select r.*
  into candidate_ride
  from public.taxi_rides r
  where r.status = 'pending'
    and r.pickup_lat is not null
    and r.pickup_lng is not null

    and not exists (
      select 1
      from public.taxi_ride_offers active_offer
      where active_offer.ride_id = r.id
        and active_offer.status = 'pending'
        and active_offer.expires_at > now()
    )

    and not exists (
      select 1
      from public.taxi_ride_offers prior
      where prior.ride_id = r.id
        and prior.driver_id = p_driver_id
        and prior.status in (
          'rejected',
          'expired'
        )
    )

  order by r.requested_at asc
  limit 1;

  if not found then
    return null;
  end if;

  -- Zona con cola oficial que contiene el punto de recogida (FIFO por zona).
  select id
  into v_queue_zone_id
  from (
    select
      z.id,
      z.radius_meters,
      public.taximun_distance_km(
        z.center_lat::double precision,
        z.center_lng::double precision,
        candidate_ride.pickup_lat::double precision,
        candidate_ride.pickup_lng::double precision
      ) * 1000 as dist_m
    from public.queue_zones z
    where z.is_active = true
  ) zd
  where zd.dist_m <= zd.radius_meters
  order by zd.dist_m asc
  limit 1;


  select ranked.*
  into best_driver
  from (
    select
      d.driver_id,

      (
        select dq.position
        from public.driver_queues dq
        where dq.driver_id = d.driver_id
          and dq.zone_id = v_queue_zone_id
          and dq.is_active = true
        limit 1
      ) as queue_position,

      public.taximun_distance_km(
        d.current_lat::double precision,
        d.current_lng::double precision,
        candidate_ride.pickup_lat::double precision,
        candidate_ride.pickup_lng::double precision
      ) as pickup_distance,

      (
        coalesce(
          public.taximun_distance_km(
            d.current_lat::double precision,
            d.current_lng::double precision,
            candidate_ride.pickup_lat::double precision,
            candidate_ride.pickup_lng::double precision
          ),
          999
        ) * 10

        - coalesce(
            p.rating::double precision,
            5
          ) * 0.5

        - least(
            extract(
              epoch from (
                now()
                - coalesce(
                    d.last_offer_at,
                    d.updated_at
                  )
              )
            ) / 60,
            120
          ) * 0.03

        + case
            when coalesce(
              d.offers_received,
              0
            ) = 0
            then 0

            else (
              1
              -
              coalesce(
                d.offers_accepted,
                0
              )::double precision
              /
              greatest(
                d.offers_received,
                1
              )
            ) * 2
          end
      ) as rank_score

    from public.driver_live_status d

    join public.taxi_user_profiles p
      on p.user_id = d.driver_id
     and p.role = 'driver'

    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null

      and d.updated_at >=
        now() - interval '2 minutes'

      and p.is_verified = true

      and not exists (
        select 1
        from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in (
            'assigned',
            'in_progress'
          )
      )

      and not exists (
        select 1
        from public.taxi_ride_offers prior
        where prior.ride_id =
          candidate_ride.id
          and prior.driver_id =
            d.driver_id
          and prior.status in (
            'rejected',
            'expired'
          )
      )
  ) ranked

  where ranked.pickup_distance is null
     or ranked.pickup_distance <= 15

  order by
    case when ranked.queue_position is null then 1 else 0 end asc,
    ranked.queue_position asc nulls last,
    ranked.rank_score asc,
    ranked.pickup_distance asc nulls last

  limit 1;


  if not found
     or best_driver.driver_id <> p_driver_id
  then
    return null;
  end if;


  distance_km :=
    best_driver.pickup_distance;

  eta_minutes :=
    case
      when distance_km is null
      then null

      else greatest(
        2,
        ceil(
          (distance_km / 22.0) * 60 + 2
        )::integer
      )
    end;


  insert into public.taxi_ride_offers (
    ride_id,
    driver_id,
    status,
    rank_score,
    distance_to_pickup_km,
    eta_to_pickup_minutes,
    offered_at,
    expires_at,
    metadata
  )
  values (
    candidate_ride.id,
    p_driver_id,
    'pending',
    best_driver.rank_score,

    case
      when distance_km is null
      then null
      else round(
        distance_km::numeric,
        2
      )
    end,

    eta_minutes,
    now(),
    now() + interval '20 seconds',

    jsonb_build_object(
      'engine',
      'smart_v1',
      'radius_km',
      15
    )
  )
  returning *
  into created_offer;


  update public.driver_live_status
  set
    last_offer_at = now(),
    offers_received =
      coalesce(offers_received, 0) + 1
  where driver_id = p_driver_id;


  return
    to_jsonb(created_offer)
    ||
    jsonb_build_object(
      'pickup_address',
      candidate_ride.pickup_address,

      'dropoff_address',
      candidate_ride.dropoff_address,

      'estimated_fare',
      candidate_ride.estimated_fare,

      'estimated_duration',
      candidate_ride.estimated_duration,

      'trip_distance_km',
      candidate_ride.distance_km,

      'payment_method',
      candidate_ride.payment_method,

      'service_type',
      candidate_ride.service_type,

      'passenger_name',
      candidate_ride.passenger_name,

      'pickup_lat',
      candidate_ride.pickup_lat,

      'pickup_lng',
      candidate_ride.pickup_lng,

      'dropoff_lat',
      candidate_ride.dropoff_lat,

      'dropoff_lng',
      candidate_ride.dropoff_lng
    );

exception
  when unique_violation then
    return null;
end;
$function$;
-- Fase 5 · Tarifa oficial del taxi de Barcelona (AMB), configurable desde administración.
-- Valores por defecto = tarifa metropolitana vigente (taxi.amb.cat).
create table if not exists public.taxi_tariff_config (
  id smallint primary key default 1 check (id = 1),
  t1_flag_drop numeric(6,2) not null default 2.80,   -- Bajada de bandera T1 (laborables 08:00-20:00)
  t1_per_km numeric(6,3) not null default 1.35,      -- €/km T1
  t2_flag_drop numeric(6,2) not null default 2.80,   -- Bajada de bandera T2 (laborables 20:00-08:00 y sábado/festivo 24h)
  t2_per_km numeric(6,3) not null default 1.66,      -- €/km T2
  waiting_per_hour numeric(6,2) not null default 27.75, -- Espera/detención por hora
  sup_airport numeric(6,2) not null default 4.60,    -- Suplemento aeropuerto (origen o destino)
  sup_moll_adossat numeric(6,2) not null default 4.60, -- Suplemento Moll Adossat / cruceros
  sup_fira_origen numeric(6,2) not null default 3.30,  -- Suplemento Fira Gran Via (origen)
  sup_sants_origen numeric(6,2) not null default 2.55, -- Suplemento Estació Sants (origen)
  sup_large_vehicle numeric(6,2) not null default 4.60, -- Suplemento vehículo 5-8 plazas
  sup_special_night numeric(6,2) not null default 3.10, -- Noches especiales (Sant Joan, Nochebuena, Fin de Año)
  min_airport_total numeric(6,2) not null default 21.00, -- Mínima desde aeropuerto (incluye suplementos)
  min_app_service numeric(6,2) not null default 8.00,    -- Mínima servicio concertado por app
  max_supplements numeric(6,2) not null default 17.10,   -- Tope suma de suplementos
  t4_flat_port_airport numeric(6,2) not null default 45.00, -- T4 fijo aeropuerto <-> Moll Adossat
  service_fee numeric(6,2) not null default 0,        -- Cargo de servicio de la app (0 = taxímetro exacto)
  comfort_multiplier numeric(6,3) not null default 1.000, -- Multiplicador categoría confort
  road_factor numeric(6,3) not null default 1.280,    -- Factor recta->ruta sin OSRM
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.taxi_tariff_config (id) values (1) on conflict (id) do nothing;

alter table public.taxi_tariff_config enable row level security;

drop policy if exists "tariff_config_authenticated_read" on public.taxi_tariff_config;
create policy "tariff_config_authenticated_read"
  on public.taxi_tariff_config for select
  to authenticated
  using (true);

-- Escritura solo con service_role (procedimientos tRPC de administración), sin políticas de escritura.

grant select on public.taxi_tariff_config to authenticated;



-- Fase 5b · Zonas geográficas que activan los suplementos de la tarifa AMB,
-- editables desde /admin/tariffs (editor visual sobre mapa).
create table if not exists public.taxi_tariff_zones (
  id text primary key,
  label text not null,
  supplement_code text not null check (supplement_code in ('airport', 'moll_adossat', 'fira', 'sants')),
  applies_to text not null default 'both' check (applies_to in ('origin', 'destination', 'both')),
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null check (radius_meters between 50 and 10000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.taxi_tariff_zones (id, label, supplement_code, applies_to, center_lat, center_lng, radius_meters) values
  ('airport-t1', 'Aeroport T1', 'airport', 'both', 41.2974, 2.0833, 1500),
  ('airport-t2', 'Aeroport T2', 'airport', 'both', 41.3007, 2.0746, 1200),
  ('moll-adossat', 'Moll Adossat · cruceros', 'moll_adossat', 'both', 41.3534, 2.1763, 1500),
  ('fira-gran-via', 'Fira Barcelona · Gran Via', 'fira', 'origin', 41.3534, 2.1277, 900),
  ('sants-estacio', 'Estació de Sants', 'sants', 'origin', 41.3790, 2.1400, 320)
on conflict (id) do nothing;

alter table public.taxi_tariff_zones enable row level security;

drop policy if exists "tariff_zones_authenticated_read" on public.taxi_tariff_zones;
create policy "tariff_zones_authenticated_read"
  on public.taxi_tariff_zones for select
  to authenticated
  using (true);

-- Escritura solo con service_role (tRPC de administración).

grant select on public.taxi_tariff_zones to authenticated;


-- Fase 5c · Tarifa T3 oficial de precio cerrado por app (anexo IMET 2026)
-- y actualización de importes 2026 (noche especial 4,60 € · T4 46,00 €).
alter table public.taxi_tariff_config
  add column if not exists closed_price_mode text not null default 'T3' check (closed_price_mode in ('T3', 'T1T2')),
  add column if not exists t3_day_flag_drop numeric(7,4) not null default 4.1117,
  add column if not exists t3_day_per_km numeric(7,4) not null default 1.1148,
  add column if not exists t3_day_per_minute numeric(7,4) not null default 0.2832,
  add column if not exists t3_night_flag_drop numeric(7,4) not null default 4.4321,
  add column if not exists t3_night_per_km numeric(7,4) not null default 1.4710,
  add column if not exists t3_night_per_minute numeric(7,4) not null default 0.2226;

update public.taxi_tariff_config
set closed_price_mode = 'T3',
    t3_day_flag_drop = 4.1117, t3_day_per_km = 1.1148, t3_day_per_minute = 0.2832,
    t3_night_flag_drop = 4.4321, t3_night_per_km = 1.4710, t3_night_per_minute = 0.2226,
    sup_special_night = 4.60,
    t4_flat_port_airport = 46.00,
    updated_at = now()
where id = 1;


-- Fase 6 · Monitorización propia: registro de errores del navegador
-- (window.onerror / unhandledrejection) visible en /admin/health.
create table if not exists public.client_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_role text,
  message text not null,
  stack text,
  source_url text,
  user_agent text,
  occurred_at timestamptz not null default now(),
  resolved boolean not null default false
);

create index if not exists client_error_logs_occurred_idx on public.client_error_logs(occurred_at desc);
create index if not exists client_error_logs_unresolved_idx on public.client_error_logs(resolved) where resolved = false;

alter table public.client_error_logs enable row level security;

-- Escritura y lectura solo vía service_role (tRPC autenticado / admin).
grant select on public.client_error_logs to authenticated;
