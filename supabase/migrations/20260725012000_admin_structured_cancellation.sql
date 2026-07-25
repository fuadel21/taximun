-- Atomic administrative cancellation with structured provenance.

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
      'safety_incident',
      'payment_issue',
      'admin_intervention',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_cancel_ride_by_admin(
  p_ride_id uuid,
  p_admin_id text,
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
  if p_reason not in ('safety_incident', 'payment_issue', 'admin_intervention', 'duplicate_request', 'other') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

  if nullif(trim(coalesce(p_admin_id, '')), '') is null then
    raise exception 'ADMIN_ID_REQUIRED';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.status not in ('pending', 'assigned', 'in_progress') then
    raise exception 'RIDE_NOT_CANCELLABLE';
  end if;

  update public.taxi_rides
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_id = p_admin_id,
      cancelled_by_role = 'admin',
      cancellation_reason = p_reason,
      cancellation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_ride_id
  returning * into v_ride;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    p_admin_id,
    'admin',
    format('Viaje cancelado por administración (%s)', p_reason),
    v_ride.id
  );

  return v_ride;
end;
$$;

revoke all on function public.taximun_cancel_ride_by_admin(uuid, text, text, text) from public;
grant execute on function public.taximun_cancel_ride_by_admin(uuid, text, text, text) to service_role;
