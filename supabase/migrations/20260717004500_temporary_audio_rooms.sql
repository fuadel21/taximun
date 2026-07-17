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