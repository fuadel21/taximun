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
