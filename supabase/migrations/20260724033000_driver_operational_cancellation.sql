-- Guarded driver cancellation before trip start with structured provenance.

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
      'vehicle_breakdown',
      'driver_emergency',
      'unsafe_pickup',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_cancel_ride_by_driver(
  p_ride_id uuid,
  p_driver_id text,
  p_reason text,
  p_note text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  if p_reason not in ('vehicle_breakdown', 'driver_emergency', 'unsafe_pickup', 'operational', 'other') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

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

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_driver_id,
      cancelled_by_role = 'driver',
      cancellation_reason = p_reason,
      cancellation_note = nullif(trim(coalesce(p_note, '')), '')
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
    'El conductor canceló el servicio',
    case p_reason
      when 'vehicle_breakdown' then 'El conductor ha cancelado el servicio por una avería del vehículo.'
      when 'driver_emergency' then 'El conductor ha cancelado el servicio por una emergencia.'
      when 'unsafe_pickup' then 'El conductor ha cancelado el servicio por una incidencia de seguridad en la recogida.'
      else 'El conductor no puede continuar con este servicio.'
    end,
    '/passenger/rides',
    jsonb_build_object(
      'rideId', v_ride.id,
      'event', 'driver_cancelled_ride',
      'reason', p_reason,
      'note', v_ride.cancellation_note,
      'cancelledAt', v_ride.cancelled_at
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
    format('Viaje cancelado por conductor (%s)', p_reason),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_ride_by_driver(uuid, text, text, text) from public;
grant execute on function public.taximun_cancel_ride_by_driver(uuid, text, text, text) to service_role;
