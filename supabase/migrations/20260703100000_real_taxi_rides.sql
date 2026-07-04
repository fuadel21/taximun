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
