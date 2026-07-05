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
