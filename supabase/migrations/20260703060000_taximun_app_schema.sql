-- Taximun Supabase schema aligned with server/routers.ts
-- This migration uses snake_case columns because the operational backend
-- reads and writes Supabase tables with snake_case names.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id bigint primary key,
  phone_number text,
  role text not null default 'passenger' check (role in ('passenger', 'driver', 'admin')),
  language text not null default 'es' check (language in ('es', 'ca', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.passengers (
  id bigint primary key references public.users(id) on delete cascade,
  rating numeric(3,2) not null default 5.00,
  home_address text,
  work_address text,
  favorite_locations jsonb,
  total_rides integer not null default 0,
  preferred_payment_method text not null default 'cash' check (preferred_payment_method in ('cash', 'card', 'wallet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id bigint primary key references public.users(id) on delete cascade,
  license_number text,
  license_expiry timestamptz,
  taxi_license text,
  taxi_license_expiry timestamptz,
  rating numeric(3,2) not null default 5.00,
  total_rides integer not null default 0,
  total_earnings numeric(10,2) not null default 0,
  is_verified boolean not null default false,
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  current_lat double precision,
  current_lng double precision,
  current_zone_id text,
  last_location_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxis (
  id uuid primary key default gen_random_uuid(),
  driver_id bigint references public.drivers(id) on delete set null,
  license_plate text unique,
  vehicle_model text,
  make text,
  model text,
  year integer,
  color text,
  capacity integer not null default 4,
  status text not null default 'available' check (status in ('available', 'maintenance', 'retired')),
  insurance_expiry timestamptz,
  inspection_expiry timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.queue_zones (
  id text primary key,
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null default 500,
  city text not null,
  country text not null default 'Spain',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_queues (
  id uuid primary key default gen_random_uuid(),
  driver_id bigint not null references public.drivers(id) on delete cascade,
  zone_id text not null references public.queue_zones(id) on delete cascade,
  position integer not null,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, zone_id)
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id bigint not null references public.passengers(id) on delete cascade,
  driver_id bigint references public.drivers(id) on delete set null,
  taxi_id uuid references public.taxis(id) on delete set null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_address text,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_address text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  estimated_fare numeric(10,2),
  actual_fare numeric(10,2),
  estimated_duration integer,
  actual_duration integer,
  distance numeric(10,2),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'wallet')),
  is_paid boolean not null default false,
  cancelled_by text check (cancelled_by in ('passenger', 'driver', 'admin')),
  cancellation_reason text,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  rater_id bigint not null references public.users(id) on delete cascade,
  rated_id bigint not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  categories jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drivers_status on public.drivers(status);
create index if not exists idx_drivers_location on public.drivers(current_lat, current_lng);
create index if not exists idx_rides_passenger_status on public.rides(passenger_id, status);
create index if not exists idx_rides_driver_status on public.rides(driver_id, status);
create index if not exists idx_rides_created_at on public.rides(created_at desc);
create index if not exists idx_driver_queues_zone on public.driver_queues(zone_id, is_active, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists passengers_set_updated_at on public.passengers;
create trigger passengers_set_updated_at before update on public.passengers
for each row execute function public.set_updated_at();

drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at before update on public.drivers
for each row execute function public.set_updated_at();

drop trigger if exists taxis_set_updated_at on public.taxis;
create trigger taxis_set_updated_at before update on public.taxis
for each row execute function public.set_updated_at();

drop trigger if exists rides_set_updated_at on public.rides;
create trigger rides_set_updated_at before update on public.rides
for each row execute function public.set_updated_at();

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at before update on public.ratings
for each row execute function public.set_updated_at();

create or replace function public.find_nearest_drivers(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision default 5
)
returns table (
  driver_id bigint,
  current_lat double precision,
  current_lng double precision,
  rating numeric,
  distance_km double precision
)
language sql
stable
as $$
  select
    d.id as driver_id,
    d.current_lat,
    d.current_lng,
    d.rating,
    (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(user_lat)) * cos(radians(d.current_lat)) *
          cos(radians(d.current_lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(d.current_lat))
        ))
      )
    ) as distance_km
  from public.drivers d
  where d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(user_lat)) * cos(radians(d.current_lat)) *
          cos(radians(d.current_lng) - radians(user_lng)) +
          sin(radians(user_lat)) * sin(radians(d.current_lat))
        ))
      )
    ) <= radius_km
  order by distance_km asc
  limit 20;
$$;
