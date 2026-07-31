-- PR #132 · Keep repository migrations aligned with the production-safe active ride constraint

-- Remove the trigger-based guard introduced by PR #131. Its exception can abort
-- the whole scheduled-booking batch when an immediate ride wins the race.
drop trigger if exists taximun_prevent_multiple_active_rides
on public.taxi_rides;

drop function if exists public.taximun_prevent_multiple_active_rides();

-- Enforce one active ride per passenger atomically at the database level.
-- This covers immediate requests, scheduled dispatches and future entry points.
create unique index if not exists taxi_rides_one_active_per_passenger_idx
  on public.taxi_rides(passenger_id)
  where passenger_id is not null
    and status in ('pending', 'assigned', 'in_progress');
