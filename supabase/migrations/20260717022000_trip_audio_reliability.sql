-- Reliability helpers for temporary WebRTC trip audio signaling.

-- Participants may remove stale signaling messages from their own active room
-- during an ICE restart. The API still verifies ride membership before doing it.
drop policy if exists taxi_trip_audio_signals_participants_delete
  on public.taxi_trip_audio_signals;

create policy taxi_trip_audio_signals_participants_delete
on public.taxi_trip_audio_signals
for delete
to authenticated
using (
  exists (
    select 1
    from public.taxi_trip_audio_rooms ar
    join public.taxi_rides r on r.id = ar.ride_id
    where ar.id = room_id
      and (
        r.passenger_id::text = auth.uid()::text
        or r.driver_id::text = auth.uid()::text
      )
  )
);

grant delete on public.taxi_trip_audio_signals to authenticated;

-- Remove obsolete signaling rows. Safe to run manually or from a scheduled job.
create or replace function public.cleanup_taxi_trip_audio_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  delete from public.taxi_trip_audio_signals
  where created_at < now() - interval '30 minutes'
     or room_id in (
       select id
       from public.taxi_trip_audio_rooms
       where status in ('ended', 'expired')
          or expires_at <= now()
     );

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function public.cleanup_taxi_trip_audio_signals() from public;
grant execute on function public.cleanup_taxi_trip_audio_signals() to service_role;

comment on function public.cleanup_taxi_trip_audio_signals()
is 'Deletes obsolete WebRTC signaling rows for ended, expired, or inactive taxi trip audio rooms.';