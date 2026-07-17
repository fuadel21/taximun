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