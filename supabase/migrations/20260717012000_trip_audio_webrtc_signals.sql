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
