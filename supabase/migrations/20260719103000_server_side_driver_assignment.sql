-- PR #63 · Server-side driver assignment
-- Selects the best available driver and creates one expiring offer atomically.

create or replace function public.taximun_server_dispatch(
  p_ride_id uuid,
  p_offer_seconds integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer := greatest(10, least(coalesce(p_offer_seconds, 25), 90));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ride_id::text, 0));

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'RIDE_NOT_FOUND');
  end if;

  if v_ride.status <> 'pending' or v_ride.driver_id is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'RIDE_ALREADY_PROCESSED',
      'rideId', v_ride.id,
      'status', v_ride.status,
      'driverId', v_ride.driver_id
    );
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'server_dispatch')
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at <= now();

  select * into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ACTIVE_OFFER_EXISTS',
      'rideId', p_ride_id,
      'offerId', v_offer.id,
      'driverId', v_offer.driver_id,
      'expiresAt', v_offer.expires_at
    );
  end if;

  select d.driver_id,
         d.driver_name,
         d.taxi_code,
         d.plate,
         d.current_lat,
         d.current_lng,
         (
           power(coalesce(d.current_lat, 0) - coalesce(v_ride.pickup_lat, 0), 2) +
           power(coalesce(d.current_lng, 0) - coalesce(v_ride.pickup_lng, 0), 2)
         ) as distance_score
  into v_driver
  from public.driver_live_status d
  where d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and not exists (
      select 1
      from public.taxi_rides active_ride
      where active_ride.driver_id = d.driver_id
        and active_ride.status in ('assigned', 'in_progress')
    )
    and not exists (
      select 1
      from public.taxi_ride_offers previous_offer
      where previous_offer.ride_id = p_ride_id
        and previous_offer.driver_id = d.driver_id
        and previous_offer.status in ('rejected', 'expired')
    )
  order by distance_score asc, d.updated_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_DRIVER_AVAILABLE',
      'rideId', p_ride_id
    );
  end if;

  insert into public.taxi_ride_offers (
    ride_id,
    driver_id,
    status,
    offered_at,
    expires_at,
    metadata
  ) values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'server_dispatch',
      'distanceScore', v_driver.distance_score,
      'driverName', v_driver.driver_name,
      'taxiCode', v_driver.taxi_code,
      'plate', v_driver.plate
    )
  )
  returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received = coalesce(offers_received, 0) + 1,
      updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    v_driver.driver_id,
    'system',
    'Oferta asignada automáticamente por el servidor',
    p_ride_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceScore', v_driver.distance_score
  );
end;
$$;

revoke all on function public.taximun_server_dispatch(uuid, integer) from public;
grant execute on function public.taximun_server_dispatch(uuid, integer) to authenticated;
grant execute on function public.taximun_server_dispatch(uuid, integer) to service_role;
