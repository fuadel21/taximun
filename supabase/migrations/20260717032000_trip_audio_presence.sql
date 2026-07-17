-- Participant presence and stale-room recovery for private trip audio.

alter table public.taxi_trip_audio_rooms
  add column if not exists driver_last_seen_at timestamptz,
  add column if not exists passenger_last_seen_at timestamptz;

create index if not exists taxi_trip_audio_rooms_driver_last_seen_idx
  on public.taxi_trip_audio_rooms (driver_last_seen_at)
  where status in ('waiting', 'active');

create index if not exists taxi_trip_audio_rooms_passenger_last_seen_idx
  on public.taxi_trip_audio_rooms (passenger_last_seen_at)
  where status in ('waiting', 'active');

create or replace function public.cleanup_stale_taxi_trip_audio_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  update public.taxi_trip_audio_rooms
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      driver_joined_at = null,
      passenger_joined_at = null,
      driver_last_seen_at = null,
      passenger_last_seen_at = null
  where status in ('waiting', 'active')
    and (
      expires_at <= now()
      or (
        coalesce(driver_last_seen_at, created_at) < now() - interval '2 minutes'
        and coalesce(passenger_last_seen_at, created_at) < now() - interval '2 minutes'
      )
    );

  get diagnostics changed_count = row_count;

  delete from public.taxi_trip_audio_signals s
  using public.taxi_trip_audio_rooms r
  where s.room_id = r.id
    and r.status in ('ended', 'expired');

  return changed_count;
end;
$$;

revoke all on function public.cleanup_stale_taxi_trip_audio_rooms() from public;
grant execute on function public.cleanup_stale_taxi_trip_audio_rooms() to service_role;

comment on column public.taxi_trip_audio_rooms.driver_last_seen_at
is 'Latest heartbeat received from the driver while the private audio room is open.';

comment on column public.taxi_trip_audio_rooms.passenger_last_seen_at
is 'Latest heartbeat received from the passenger while the private audio room is open.';

comment on function public.cleanup_stale_taxi_trip_audio_rooms()
is 'Ends abandoned trip audio rooms and removes their obsolete WebRTC signaling rows.';