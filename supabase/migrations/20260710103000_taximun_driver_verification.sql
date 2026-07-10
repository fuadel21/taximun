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
