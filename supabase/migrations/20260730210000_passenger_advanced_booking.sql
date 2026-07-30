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
