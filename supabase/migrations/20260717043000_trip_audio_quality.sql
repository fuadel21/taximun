-- Private trip audio quality diagnostics.

create table if not exists public.taxi_trip_audio_quality_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.taxi_trip_audio_rooms(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  participant_id text not null,
  participant_role text not null check (participant_role in ('driver', 'passenger')),
  quality text not null check (quality in ('excellent', 'good', 'poor', 'offline')),
  connection_state text not null,
  round_trip_ms numeric(10,2),
  jitter_ms numeric(10,2),
  packets_lost bigint,
  bitrate_kbps numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists taxi_trip_audio_quality_events_room_created_idx
  on public.taxi_trip_audio_quality_events (room_id, created_at desc);

create index if not exists taxi_trip_audio_quality_events_ride_created_idx
  on public.taxi_trip_audio_quality_events (ride_id, created_at desc);

create index if not exists taxi_trip_audio_quality_events_poor_idx
  on public.taxi_trip_audio_quality_events (created_at desc)
  where quality in ('poor', 'offline');

alter table public.taxi_trip_audio_quality_events enable row level security;
alter table public.taxi_trip_audio_quality_events force row level security;

revoke all on table public.taxi_trip_audio_quality_events from anon, authenticated;
grant select, insert, delete on table public.taxi_trip_audio_quality_events to service_role;

comment on table public.taxi_trip_audio_quality_events
is 'Short WebRTC network-quality samples for private taxi trip audio calls; accessed only through authenticated server procedures.';

create or replace function public.cleanup_old_taxi_trip_audio_quality_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  delete from public.taxi_trip_audio_quality_events
  where created_at < now() - interval '30 days';

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function public.cleanup_old_taxi_trip_audio_quality_events() from public;
grant execute on function public.cleanup_old_taxi_trip_audio_quality_events() to service_role;

comment on function public.cleanup_old_taxi_trip_audio_quality_events()
is 'Deletes private call quality samples older than 30 days.';