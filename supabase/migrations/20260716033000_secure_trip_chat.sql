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
