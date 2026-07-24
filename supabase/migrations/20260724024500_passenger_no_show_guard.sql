-- Guarded passenger no-show flow after a verified driver arrival and minimum wait.

alter table public.taxi_rides
  add column if not exists no_show_reported_at timestamptz,
  add column if not exists no_show_wait_seconds integer;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'passenger_no_show',
      'other',
      'legacy_unspecified'
    )
  );

alter table public.taxi_rides
  drop constraint if exists taxi_rides_no_show_wait_seconds_check;

alter table public.taxi_rides
  add constraint taxi_rides_no_show_wait_seconds_check
  check (no_show_wait_seconds is null or no_show_wait_seconds >= 300);

create or replace function public.taximun_cancel_passenger_no_show(
  p_ride_id uuid,
  p_driver_id text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_wait_seconds integer;
begin
  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.status <> 'assigned' then
    raise exception 'RIDE_NOT_ASSIGNED';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.driver_arrived_at is null then
    raise exception 'DRIVER_NOT_ARRIVED';
  end if;

  v_wait_seconds := floor(extract(epoch from (now() - v_ride.driver_arrived_at)))::integer;

  if v_wait_seconds < 300 then
    raise exception 'NO_SHOW_WAIT_REQUIRED:%', 300 - v_wait_seconds;
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_driver_id,
      cancelled_by_role = 'driver',
      cancellation_reason = 'passenger_no_show',
      cancellation_note = nullif(trim(coalesce(p_note, '')), ''),
      no_show_reported_at = now(),
      no_show_wait_seconds = v_wait_seconds
  where id = p_ride_id
  returning * into v_ride;

  insert into public.taxi_notifications (
    recipient_id,
    recipient_role,
    actor_id,
    actor_role,
    type,
    title,
    body,
    action_url,
    metadata
  ) values (
    v_ride.passenger_id,
    'passenger',
    p_driver_id,
    'driver',
    'warning',
    'Servicio cancelado por ausencia',
    'El conductor registró que no te encontrabas en el punto de recogida tras esperar al menos 5 minutos.',
    '/passenger/rides',
    jsonb_build_object(
      'rideId', v_ride.id,
      'event', 'passenger_no_show',
      'driverArrivedAt', v_ride.driver_arrived_at,
      'reportedAt', v_ride.no_show_reported_at,
      'waitSeconds', v_ride.no_show_wait_seconds
    )
  );

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_driver_id,
    'driver',
    format('Pasajero ausente registrado tras %s segundos de espera', v_wait_seconds),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_passenger_no_show(uuid, text, text) from public;
grant execute on function public.taximun_cancel_passenger_no_show(uuid, text, text) to service_role;
