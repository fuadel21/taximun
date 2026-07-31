-- PR #132 · Keep repository migrations aligned with the production-safe active ride constraint

-- Remove the trigger-based guard introduced by PR #131. Its exception can abort
-- the whole scheduled-booking batch when an immediate ride wins the race.
drop trigger if exists taximun_prevent_multiple_active_rides
on public.taxi_rides;

drop function if exists public.taximun_prevent_multiple_active_rides();

-- Refuse the migration with an actionable report when a legacy database already
-- contains more than one active ride for the same passenger. Do not silently
-- cancel or alter real trips during a schema migration.
do $$
declare
  v_duplicates text;
begin
  select string_agg(passenger_id || ' (' || active_count || ' viajes)', ', ' order by passenger_id)
  into v_duplicates
  from (
    select passenger_id, count(*) as active_count
    from public.taxi_rides
    where passenger_id is not null
      and status in ('pending', 'assigned', 'in_progress')
    group by passenger_id
    having count(*) > 1
  ) duplicates;

  if v_duplicates is not null then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_ACTIVE_RIDES: ' || v_duplicates,
      hint = 'Revisa y resuelve los viajes activos duplicados indicados antes de volver a ejecutar esta migración.';
  end if;
end;
$$;

-- Enforce one active ride per passenger atomically at the database level.
-- This covers immediate requests, scheduled dispatches and future entry points.
create unique index if not exists taxi_rides_one_active_per_passenger_idx
  on public.taxi_rides(passenger_id)
  where passenger_id is not null
    and status in ('pending', 'assigned', 'in_progress');
