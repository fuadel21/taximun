-- PR #143 · Atomic booking, promotion and verification integrity

-- Keep repository migrations aligned with the manual production safety cleanup.
drop trigger if exists taximun_preserve_driver_verification_personal_update
  on public.taxi_user_profiles;

drop function if exists public.taximun_preserve_driver_verification_on_personal_update();

create or replace function public.taximun_commit_priced_booking(
  p_operation text,
  p_payload jsonb,
  p_promotion_id uuid default null,
  p_target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_passenger_id text := nullif(trim(p_payload->>'passenger_id'), '');
  v_category text := coalesce(nullif(trim(p_payload->>'service_category'), ''), 'standard');
  v_subtotal numeric := coalesce((p_payload->>'fare_subtotal')::numeric, 0);
  v_discount numeric := 0;
  v_promo_code text := null;
  v_total numeric;
  v_ride public.taxi_rides%rowtype;
  v_booking public.taxi_scheduled_bookings%rowtype;
  v_redemption record;
begin
  if p_operation not in ('create_immediate', 'create_scheduled', 'update_scheduled') then
    raise exception 'BOOKING_OPERATION_INVALID';
  end if;

  if v_passenger_id is null then
    raise exception 'BOOKING_PASSENGER_REQUIRED';
  end if;

  if v_subtotal < 0 then
    raise exception 'BOOKING_SUBTOTAL_INVALID';
  end if;

  -- Serialize operations for the same passenger, including concurrent double taps.
  perform pg_advisory_xact_lock(hashtextextended(v_passenger_id, 143));

  if p_operation = 'create_immediate' then
    if exists (
      select 1
      from public.taxi_rides
      where passenger_id = v_passenger_id
        and status in ('pending', 'assigned', 'in_progress')
    ) then
      raise exception 'ACTIVE_RIDE_EXISTS';
    end if;

    insert into public.taxi_rides (
      passenger_id,
      passenger_name,
      pickup_address,
      dropoff_address,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      estimated_fare,
      fare_subtotal,
      fare_range_min,
      fare_range_max,
      estimated_duration,
      distance_km,
      payment_method,
      service_type,
      service_category,
      intermediate_stops,
      passenger_requirements,
      fare_breakdown,
      promo_code,
      promo_discount,
      quote_version,
      quoted_at,
      status
    ) values (
      v_passenger_id,
      coalesce(nullif(p_payload->>'passenger_name', ''), 'Pasajero'),
      p_payload->>'pickup_address',
      p_payload->>'dropoff_address',
      nullif(p_payload->>'pickup_lat', '')::double precision,
      nullif(p_payload->>'pickup_lng', '')::double precision,
      nullif(p_payload->>'dropoff_lat', '')::double precision,
      nullif(p_payload->>'dropoff_lng', '')::double precision,
      v_subtotal,
      v_subtotal,
      round(v_subtotal * 0.90, 2),
      round(v_subtotal * 1.12, 2),
      coalesce((p_payload->>'estimated_duration')::integer, 0),
      coalesce((p_payload->>'distance_km')::numeric, 0),
      p_payload->>'payment_method',
      p_payload->>'service_type',
      v_category,
      coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
      coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
      coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
      null,
      0,
      p_payload->>'quote_version',
      coalesce((p_payload->>'quoted_at')::timestamptz, now()),
      'pending'
    )
    returning * into v_ride;

  elsif p_operation = 'create_scheduled' then
    if (p_payload->>'scheduled_at')::timestamptz < now() + interval '15 minutes' then
      raise exception 'SCHEDULED_TOO_SOON';
    end if;

    insert into public.taxi_scheduled_bookings (
      passenger_id,
      passenger_name,
      pickup_address,
      dropoff_address,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      scheduled_at,
      service_category,
      payment_method,
      intermediate_stops,
      passenger_requirements,
      fare_breakdown,
      estimated_fare,
      fare_subtotal,
      fare_range_min,
      fare_range_max,
      estimated_duration,
      distance_km,
      promo_code,
      promo_discount,
      quote_version,
      quoted_at,
      status
    ) values (
      v_passenger_id,
      coalesce(nullif(p_payload->>'passenger_name', ''), 'Pasajero'),
      p_payload->>'pickup_address',
      p_payload->>'dropoff_address',
      nullif(p_payload->>'pickup_lat', '')::double precision,
      nullif(p_payload->>'pickup_lng', '')::double precision,
      nullif(p_payload->>'dropoff_lat', '')::double precision,
      nullif(p_payload->>'dropoff_lng', '')::double precision,
      (p_payload->>'scheduled_at')::timestamptz,
      v_category,
      p_payload->>'payment_method',
      coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
      coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
      coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
      v_subtotal,
      v_subtotal,
      round(v_subtotal * 0.90, 2),
      round(v_subtotal * 1.12, 2),
      coalesce((p_payload->>'estimated_duration')::integer, 0),
      coalesce((p_payload->>'distance_km')::numeric, 0),
      null,
      0,
      p_payload->>'quote_version',
      coalesce((p_payload->>'quoted_at')::timestamptz, now()),
      'scheduled'
    )
    returning * into v_booking;

  else
    if p_target_id is null then
      raise exception 'BOOKING_TARGET_REQUIRED';
    end if;

    if (p_payload->>'scheduled_at')::timestamptz < now() + interval '15 minutes' then
      raise exception 'SCHEDULED_TOO_SOON';
    end if;

    select * into v_booking
    from public.taxi_scheduled_bookings
    where id = p_target_id
      and passenger_id = v_passenger_id
      and status = 'scheduled'
    for update;

    if not found then
      raise exception 'BOOKING_NOT_EDITABLE';
    end if;

    update public.taxi_scheduled_bookings
    set pickup_address = p_payload->>'pickup_address',
        dropoff_address = p_payload->>'dropoff_address',
        pickup_lat = nullif(p_payload->>'pickup_lat', '')::double precision,
        pickup_lng = nullif(p_payload->>'pickup_lng', '')::double precision,
        dropoff_lat = nullif(p_payload->>'dropoff_lat', '')::double precision,
        dropoff_lng = nullif(p_payload->>'dropoff_lng', '')::double precision,
        scheduled_at = (p_payload->>'scheduled_at')::timestamptz,
        service_category = v_category,
        payment_method = p_payload->>'payment_method',
        intermediate_stops = coalesce(p_payload->'intermediate_stops', '[]'::jsonb),
        passenger_requirements = coalesce(p_payload->'passenger_requirements', '{}'::jsonb),
        fare_breakdown = coalesce(p_payload->'fare_breakdown', '{}'::jsonb),
        estimated_fare = v_subtotal,
        fare_subtotal = v_subtotal,
        fare_range_min = round(v_subtotal * 0.90, 2),
        fare_range_max = round(v_subtotal * 1.12, 2),
        estimated_duration = coalesce((p_payload->>'estimated_duration')::integer, 0),
        distance_km = coalesce((p_payload->>'distance_km')::numeric, 0),
        promo_code = null,
        promo_discount = 0,
        quote_version = p_payload->>'quote_version',
        quoted_at = coalesce((p_payload->>'quoted_at')::timestamptz, now()),
        updated_at = now()
    where id = p_target_id
    returning * into v_booking;
  end if;

  if p_promotion_id is not null then
    if p_operation = 'create_immediate' then
      select * into v_redemption
      from public.taximun_reserve_promotion_redemption(
        p_promotion_id,
        v_passenger_id,
        v_ride.id,
        null,
        v_category,
        v_subtotal
      );
    else
      select * into v_redemption
      from public.taximun_reserve_promotion_redemption(
        p_promotion_id,
        v_passenger_id,
        null,
        v_booking.id,
        v_category,
        v_subtotal
      );
    end if;

    v_discount := coalesce(v_redemption.discount_amount, 0);
    v_promo_code := v_redemption.promotion_code;
  elsif p_operation = 'update_scheduled' then
    delete from public.taxi_promotion_redemptions
    where scheduled_booking_id = v_booking.id;
  end if;

  v_total := round(greatest(0, v_subtotal - v_discount), 2);

  if p_operation = 'create_immediate' then
    update public.taxi_rides
    set estimated_fare = v_total,
        fare_range_min = round(v_total * 0.90, 2),
        fare_range_max = round(v_total * 1.12, 2),
        promo_code = v_promo_code,
        promo_discount = v_discount,
        fare_breakdown = coalesce(fare_breakdown, '{}'::jsonb)
          || jsonb_build_object('discount', v_discount)
    where id = v_ride.id
    returning * into v_ride;

    return to_jsonb(v_ride);
  end if;

  update public.taxi_scheduled_bookings
  set estimated_fare = v_total,
      fare_range_min = round(v_total * 0.90, 2),
      fare_range_max = round(v_total * 1.12, 2),
      promo_code = v_promo_code,
      promo_discount = v_discount,
      fare_breakdown = coalesce(fare_breakdown, '{}'::jsonb)
        || jsonb_build_object('discount', v_discount),
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return to_jsonb(v_booking);
exception
  when unique_violation then
    if p_operation = 'create_immediate' then
      raise exception 'ACTIVE_RIDE_EXISTS';
    end if;
    raise;
end;
$$;

revoke all on function public.taximun_commit_priced_booking(text, jsonb, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.taximun_commit_priced_booking(text, jsonb, uuid, uuid)
  to service_role;
