-- Atomic trip settlement linked to real card capture and race-safe driver accounting.

create or replace function public.taximun_settle_trip_atomic(
  p_ride_id uuid,
  p_driver_id text,
  p_settled_by text,
  p_driver_name text,
  p_final_fare numeric,
  p_payment_method text,
  p_payment_status text,
  p_notes text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
begin
  if p_final_fare < 0 or p_final_fare > 9999 then
    raise exception 'INVALID_FINAL_FARE';
  end if;

  if p_payment_method not in ('cash', 'card', 'bizum') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_payment_status not in ('paid', 'waived') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.status <> 'in_progress' then
    raise exception 'RIDE_NOT_IN_PROGRESS';
  end if;

  if p_payment_method = 'card' then
    if p_payment_status <> 'paid' then
      raise exception 'CARD_PAYMENT_MUST_BE_PAID';
    end if;

    select * into v_payment
    from public.taxi_payments
    where ride_id = p_ride_id
    for update;

    if not found or v_payment.status <> 'captured' then
      raise exception 'CARD_PAYMENT_NOT_CAPTURED';
    end if;

    v_expected_cents := round(p_final_fare * 100)::integer;
    if v_payment.amount_captured <> v_expected_cents then
      raise exception 'CARD_CAPTURE_AMOUNT_MISMATCH';
    end if;
  end if;

  update public.taxi_rides
  set final_fare = p_final_fare,
      payment_method = p_payment_method,
      payment_status = p_payment_status,
      settlement_notes = nullif(trim(p_notes), ''),
      settled_at = now(),
      settled_by = p_settled_by,
      completed_at = now(),
      status = 'completed'
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    status,
    total_earnings,
    total_rides
  ) values (
    p_driver_id,
    coalesce(nullif(trim(p_driver_name), ''), 'Conductor'),
    'available',
    p_final_fare,
    1
  )
  on conflict (driver_id) do update
  set driver_name = coalesce(nullif(excluded.driver_name, ''), public.driver_live_status.driver_name),
      status = 'available',
      total_earnings = coalesce(public.driver_live_status.total_earnings, 0) + excluded.total_earnings,
      total_rides = coalesce(public.driver_live_status.total_rides, 0) + 1;

  return v_ride;
end;
$$;

revoke all on function public.taximun_settle_trip_atomic(uuid, text, text, text, numeric, text, text, text) from public;
grant execute on function public.taximun_settle_trip_atomic(uuid, text, text, text, numeric, text, text, text) to service_role;
