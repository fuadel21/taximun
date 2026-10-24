-- Taximun — Paridad colas FIFO en despacho real + salida atómica de cola.
--
-- Cierra dos brechas del modo real frente al modo local:
--  1. FIFO: si el punto de recogida cae dentro de una zona con cola oficial,
--     los conductores en cola (por posición) pasan delante del resto.
--  2. Liveness/salida atómica: al aceptar un viaje el conductor sale de la
--     cola al instante (antes solo lo hacía el sync por cron, ≤1 min), y el
--     despacho no re-oferta a un conductor que ya rechazó o dejó expirar la
--     oferta de ese mismo viaje (evita bucles sobre una cabeza de cola muerta).
--
-- Solo CREATE OR REPLACE FUNCTION: seguro de re-ejecutar.

CREATE OR REPLACE FUNCTION public.taximun_accept_smart_offer(p_offer_id uuid, p_driver_id text, p_driver_name text, p_taxi_code text, p_plate text)
 RETURNS taxi_rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  offer_row public.taxi_ride_offers%rowtype;
  ride_row public.taxi_rides%rowtype;
begin
  perform public.taximun_expire_ride_offers();

  select *
  into offer_row
  from public.taxi_ride_offers
  where id = p_offer_id
  for update;

  if not found
     or offer_row.driver_id <> p_driver_id
  then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if offer_row.status <> 'pending'
     or offer_row.expires_at <= now()
  then
    raise exception 'OFFER_EXPIRED';
  end if;


  select *
  into ride_row
  from public.taxi_rides
  where id = offer_row.ride_id
  for update;

  if not found
     or ride_row.status <> 'pending'
  then
    raise exception 'RIDE_NOT_AVAILABLE';
  end if;


  update public.taxi_ride_offers
  set
    status = 'accepted',
    responded_at = now(),
    response_ms = greatest(
      0,
      floor(
        extract(
          epoch from (now() - offered_at)
        ) * 1000
      )::integer
    ),
    updated_at = now()
  where id = p_offer_id;


  update public.taxi_ride_offers
  set
    status = 'cancelled',
    updated_at = now()
  where ride_id = ride_row.id
    and id <> p_offer_id
    and status = 'pending';


  update public.taxi_rides
  set
    status = 'assigned',
    driver_id = p_driver_id,
    driver_name = p_driver_name,
    taxi_code = p_taxi_code,
    plate = p_plate,
    assigned_at = now()
  where id = ride_row.id
  returning *
  into ride_row;


  update public.driver_live_status
  set
    status = 'busy',
    offers_accepted =
      coalesce(offers_accepted, 0) + 1,
    updated_at = now()
  where driver_id = p_driver_id;



  -- Salida atómica de la cola FIFO al aceptar (paridad con el modo local).
  update public.driver_queues
  set is_active = false,
      updated_at = now()
  where driver_id = p_driver_id
    and is_active = true;

  return ride_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_accept_ride_transactional(p_ride_id uuid, p_driver_id text, p_driver_name text, p_taxi_code text, p_plate text)
 RETURNS taxi_rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver_is_busy boolean := false;
  v_driver_has_active_ride boolean := false;
begin
  -- Serialize accept attempts by the same driver.
  perform pg_advisory_xact_lock(hashtext('taximun-driver-accept:' || p_driver_id));

  if not public.taximun_driver_can_operate(p_driver_id) then
    raise exception 'DRIVER_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.taxi_rides r
    where r.driver_id = p_driver_id
      and r.status in ('assigned', 'in_progress')
  ) into v_driver_has_active_ride;

  if v_driver_has_active_ride then
    raise exception 'DRIVER_ALREADY_HAS_ACTIVE_RIDE' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.driver_live_status d
    where d.driver_id = p_driver_id
      and d.status = 'busy'
  ) into v_driver_is_busy;

  if v_driver_is_busy then
    raise exception 'DRIVER_IS_BUSY' using errcode = 'P0001';
  end if;

  -- Lock this ride row so only one accept can win.
  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_ride.status <> 'pending' then
    raise exception 'RIDE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_ride.passenger_id = p_driver_id then
    raise exception 'DRIVER_CANNOT_ACCEPT_OWN_RIDE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.taxi_ride_rejections rr
    where rr.ride_id = p_ride_id
      and rr.driver_id = p_driver_id
  ) then
    raise exception 'DRIVER_ALREADY_REJECTED_RIDE' using errcode = 'P0001';
  end if;

  update public.taxi_rides
  set
    driver_id = p_driver_id,
    driver_name = coalesce(nullif(p_driver_name, ''), 'Conductor'),
    taxi_code = coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    plate = coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    status = 'assigned',
    assigned_at = now()
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    taxi_code,
    plate,
    status,
    current_zone
  ) values (
    p_driver_id,
    coalesce(nullif(p_driver_name, ''), 'Conductor'),
    coalesce(nullif(p_taxi_code, ''), 'TX-000'),
    coalesce(nullif(p_plate, ''), 'SIN-MAT'),
    'busy',
    'Barcelona'
  )
  on conflict (driver_id) do update
  set
    driver_name = excluded.driver_name,
    taxi_code = excluded.taxi_code,
    plate = excluded.plate,
    status = 'busy',
    updated_at = now();


  -- Salida atómica de la cola FIFO al aceptar (paridad con el modo local).
  update public.driver_queues
  set is_active = false,
      updated_at = now()
  where driver_id = p_driver_id
    and is_active = true;

  return v_ride;
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_server_dispatch(p_ride_id uuid, p_offer_seconds integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_ride public.taxi_rides%rowtype;
  v_driver record;
  v_offer public.taxi_ride_offers%rowtype;
  v_seconds integer :=
    greatest(10, least(coalesce(p_offer_seconds, 25), 90));
  v_candidate_count integer := 0;
  v_queue_zone_id text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_ride_id::text, 0)
  );

  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'RIDE_NOT_FOUND'
    );
  end if;

  if v_ride.status <> 'pending'
     or v_ride.driver_id is not null then
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
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'expiredBy',
          'smart_dispatch'
        )
  where ride_id = p_ride_id
    and status = 'pending'
    and expires_at <= now();

  select *
  into v_offer
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


  -- Zona con cola oficial que contiene el punto de recogida (FIFO por zona).
  select id
  into v_queue_zone_id
  from (
    select
      z.id,
      z.radius_meters,
      public.taximun_distance_km(
        z.center_lat::double precision,
        z.center_lng::double precision,
        v_ride.pickup_lat::double precision,
        v_ride.pickup_lng::double precision
      ) * 1000 as dist_m
    from public.queue_zones z
    where z.is_active = true
  ) zd
  where zd.dist_m <= zd.radius_meters
  order by zd.dist_m asc
  limit 1;

  with candidates as (
    select
      d.driver_id,
      d.driver_name,
      d.taxi_code,
      d.plate,
      d.current_lat,
      d.current_lng,
      d.location_updated_at as updated_at,
      coalesce(d.offers_received, 0) as offers_received,
      coalesce(p.rating, 5.0) as driver_rating,
      (
        select dq.position
        from public.driver_queues dq
        where dq.driver_id = d.driver_id
          and dq.zone_id = v_queue_zone_id
          and dq.is_active = true
        limit 1
      ) as queue_position,
      6371 * 2 * asin(
        sqrt(
          power(
            sin(
              radians(
                (d.current_lat - v_ride.pickup_lat) / 2
              )
            ),
            2
          )
          +
          cos(radians(v_ride.pickup_lat))
          * cos(radians(d.current_lat))
          * power(
              sin(
                radians(
                  (d.current_lng - v_ride.pickup_lng) / 2
                )
              ),
              2
            )
        )
      ) as distance_km,
      greatest(
        0,
        extract(
          epoch from (
            now() - d.location_updated_at
          )
        )
      )::integer as freshness_seconds,
      (
        select count(*)
        from public.taxi_ride_offers ro
        where ro.ride_id = p_ride_id
          and ro.driver_id = d.driver_id
          and ro.status in ('rejected', 'expired')
      ) as rejection_count
    from public.driver_live_status d
    left join public.taxi_user_profiles p
      on p.user_id = d.driver_id
     and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null
      and d.location_updated_at >= now() - interval '3 minutes'
      and not exists (
        select 1
        from public.taxi_ride_offers ro
        where ro.ride_id = p_ride_id
          and ro.driver_id = d.driver_id
          and ro.status in ('rejected', 'expired')
      )
      and not exists (
        select 1
        from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in ('assigned', 'in_progress')
      )
  ),
  scored as (
    select
      *,
      coalesce(queue_position, 999999) as queue_rank,
      greatest(
        1,
        ceil(distance_km / 0.45)
      )::integer as eta_minutes,
      offers_received * 0.12 as fairness_penalty,
      rejection_count * 2.5 as rejection_penalty,
      distance_km * 10
        + greatest(0, 5 - driver_rating) * 3
        + freshness_seconds / 30.0
        + offers_received * 0.12
        + rejection_count * 2.5 as final_score
    from candidates
  )
  select
    *,
    count(*) over()
  into v_driver
  from scored
  order by queue_rank asc, final_score asc, updated_at desc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(
      ride_id,
      result_code,
      candidate_count
    )
    values (
      p_ride_id,
      'NO_DRIVER_AVAILABLE',
      0
    );

    return jsonb_build_object(
      'ok', false,
      'code', 'NO_DRIVER_AVAILABLE',
      'rideId', p_ride_id
    );
  end if;

  v_candidate_count := coalesce(v_driver.count, 1);

  insert into public.taxi_ride_offers(
    ride_id,
    driver_id,
    status,
    offered_at,
    expires_at,
    metadata
  )
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch_v1',
      'distanceKm',
      round(v_driver.distance_km::numeric, 3),
      'etaMinutes',
      v_driver.eta_minutes,
      'driverRating',
      v_driver.driver_rating,
      'finalScore',
      round(v_driver.final_score::numeric, 4),
      'candidateCount',
      v_candidate_count
    )
  )
  returning *
  into v_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received =
        coalesce(offers_received, 0) + 1,
      updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id,
    driver_id,
    offer_id,
    result_code,
    distance_km,
    estimated_eta_minutes,
    driver_rating,
    freshness_seconds,
    fairness_penalty,
    rejection_penalty,
    final_score,
    candidate_count,
    metadata
  )
  values (
    p_ride_id,
    v_driver.driver_id,
    v_offer.id,
    'OFFER_CREATED',
    round(v_driver.distance_km::numeric, 3),
    v_driver.eta_minutes,
    v_driver.driver_rating,
    v_driver.freshness_seconds,
    v_driver.fairness_penalty,
    v_driver.rejection_penalty,
    round(v_driver.final_score::numeric, 4),
    v_candidate_count,
    jsonb_build_object(
      'offerSeconds',
      v_seconds
    )
  );

  insert into public.taxi_activity_logs(
    actor_id,
    actor_role,
    message,
    ride_id
  )
  values (
    v_driver.driver_id,
    'system',
    'Oferta creada por Smart Dispatch v1',
    p_ride_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceKm',
    round(v_driver.distance_km::numeric, 3),
    'etaMinutes',
    v_driver.eta_minutes,
    'driverRating',
    v_driver.driver_rating,
    'finalScore',
    round(v_driver.final_score::numeric, 4),
    'candidateCount',
    v_candidate_count,
    'algorithmVersion',
    'smart_dispatch_v1'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.taximun_claim_smart_offer(p_driver_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing_offer record;
  candidate_ride record;
  best_driver record;
  created_offer record;
  driver_row record;
  distance_km double precision;
  eta_minutes integer;
  v_queue_zone_id text;
begin
  perform public.taximun_expire_ride_offers();

  select
    o.*,
    r.pickup_address,
    r.dropoff_address,
    r.estimated_fare,
    r.estimated_duration,
    r.distance_km as trip_distance_km,
    r.payment_method,
    r.service_type,
    r.passenger_name,
    r.pickup_lat,
    r.pickup_lng,
    r.dropoff_lat,
    r.dropoff_lng
  into existing_offer
  from public.taxi_ride_offers o
  join public.taxi_rides r
    on r.id = o.ride_id
  where o.driver_id = p_driver_id
    and o.status = 'pending'
    and o.expires_at > now()
  order by o.offered_at desc
  limit 1;

  if found then
    return to_jsonb(existing_offer);
  end if;


  select d.*
  into driver_row
  from public.driver_live_status d
  join public.taxi_user_profiles p
    on p.user_id = d.driver_id
   and p.role = 'driver'
  where d.driver_id = p_driver_id
    and d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and d.updated_at >=
      now() - interval '2 minutes'
    and p.is_verified = true
    and not exists (
      select 1
      from public.taxi_rides ar
      where ar.driver_id = p_driver_id
        and ar.status in (
          'assigned',
          'in_progress'
        )
    )
  limit 1;

  if not found then
    return null;
  end if;


  select r.*
  into candidate_ride
  from public.taxi_rides r
  where r.status = 'pending'
    and r.pickup_lat is not null
    and r.pickup_lng is not null

    and not exists (
      select 1
      from public.taxi_ride_offers active_offer
      where active_offer.ride_id = r.id
        and active_offer.status = 'pending'
        and active_offer.expires_at > now()
    )

    and not exists (
      select 1
      from public.taxi_ride_offers prior
      where prior.ride_id = r.id
        and prior.driver_id = p_driver_id
        and prior.status in (
          'rejected',
          'expired'
        )
    )

  order by r.requested_at asc
  limit 1;

  if not found then
    return null;
  end if;

  -- Zona con cola oficial que contiene el punto de recogida (FIFO por zona).
  select id
  into v_queue_zone_id
  from (
    select
      z.id,
      z.radius_meters,
      public.taximun_distance_km(
        z.center_lat::double precision,
        z.center_lng::double precision,
        candidate_ride.pickup_lat::double precision,
        candidate_ride.pickup_lng::double precision
      ) * 1000 as dist_m
    from public.queue_zones z
    where z.is_active = true
  ) zd
  where zd.dist_m <= zd.radius_meters
  order by zd.dist_m asc
  limit 1;


  select ranked.*
  into best_driver
  from (
    select
      d.driver_id,

      (
        select dq.position
        from public.driver_queues dq
        where dq.driver_id = d.driver_id
          and dq.zone_id = v_queue_zone_id
          and dq.is_active = true
        limit 1
      ) as queue_position,

      public.taximun_distance_km(
        d.current_lat::double precision,
        d.current_lng::double precision,
        candidate_ride.pickup_lat::double precision,
        candidate_ride.pickup_lng::double precision
      ) as pickup_distance,

      (
        coalesce(
          public.taximun_distance_km(
            d.current_lat::double precision,
            d.current_lng::double precision,
            candidate_ride.pickup_lat::double precision,
            candidate_ride.pickup_lng::double precision
          ),
          999
        ) * 10

        - coalesce(
            p.rating::double precision,
            5
          ) * 0.5

        - least(
            extract(
              epoch from (
                now()
                - coalesce(
                    d.last_offer_at,
                    d.updated_at
                  )
              )
            ) / 60,
            120
          ) * 0.03

        + case
            when coalesce(
              d.offers_received,
              0
            ) = 0
            then 0

            else (
              1
              -
              coalesce(
                d.offers_accepted,
                0
              )::double precision
              /
              greatest(
                d.offers_received,
                1
              )
            ) * 2
          end
      ) as rank_score

    from public.driver_live_status d

    join public.taxi_user_profiles p
      on p.user_id = d.driver_id
     and p.role = 'driver'

    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null

      and d.updated_at >=
        now() - interval '2 minutes'

      and p.is_verified = true

      and not exists (
        select 1
        from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in (
            'assigned',
            'in_progress'
          )
      )

      and not exists (
        select 1
        from public.taxi_ride_offers prior
        where prior.ride_id =
          candidate_ride.id
          and prior.driver_id =
            d.driver_id
          and prior.status in (
            'rejected',
            'expired'
          )
      )
  ) ranked

  where ranked.pickup_distance is null
     or ranked.pickup_distance <= 15

  order by
    case when ranked.queue_position is null then 1 else 0 end asc,
    ranked.queue_position asc nulls last,
    ranked.rank_score asc,
    ranked.pickup_distance asc nulls last

  limit 1;


  if not found
     or best_driver.driver_id <> p_driver_id
  then
    return null;
  end if;


  distance_km :=
    best_driver.pickup_distance;

  eta_minutes :=
    case
      when distance_km is null
      then null

      else greatest(
        2,
        ceil(
          (distance_km / 22.0) * 60 + 2
        )::integer
      )
    end;


  insert into public.taxi_ride_offers (
    ride_id,
    driver_id,
    status,
    rank_score,
    distance_to_pickup_km,
    eta_to_pickup_minutes,
    offered_at,
    expires_at,
    metadata
  )
  values (
    candidate_ride.id,
    p_driver_id,
    'pending',
    best_driver.rank_score,

    case
      when distance_km is null
      then null
      else round(
        distance_km::numeric,
        2
      )
    end,

    eta_minutes,
    now(),
    now() + interval '20 seconds',

    jsonb_build_object(
      'engine',
      'smart_v1',
      'radius_km',
      15
    )
  )
  returning *
  into created_offer;


  update public.driver_live_status
  set
    last_offer_at = now(),
    offers_received =
      coalesce(offers_received, 0) + 1
  where driver_id = p_driver_id;


  return
    to_jsonb(created_offer)
    ||
    jsonb_build_object(
      'pickup_address',
      candidate_ride.pickup_address,

      'dropoff_address',
      candidate_ride.dropoff_address,

      'estimated_fare',
      candidate_ride.estimated_fare,

      'estimated_duration',
      candidate_ride.estimated_duration,

      'trip_distance_km',
      candidate_ride.distance_km,

      'payment_method',
      candidate_ride.payment_method,

      'service_type',
      candidate_ride.service_type,

      'passenger_name',
      candidate_ride.passenger_name,

      'pickup_lat',
      candidate_ride.pickup_lat,

      'pickup_lng',
      candidate_ride.pickup_lng,

      'dropoff_lat',
      candidate_ride.dropoff_lat,

      'dropoff_lng',
      candidate_ride.dropoff_lng
    );

exception
  when unique_violation then
    return null;
end;
$function$;