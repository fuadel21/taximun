-- PR #126 · Separate GPS freshness from general driver status updates

alter table public.driver_live_status
  add column if not exists location_updated_at timestamptz;

update public.driver_live_status
set location_updated_at = coalesce(location_updated_at, updated_at)
where current_lat is not null
  and current_lng is not null
  and location_updated_at is null;

create or replace function public.taximun_set_driver_location_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_lat is not null and new.current_lng is not null then
      new.location_updated_at := coalesce(new.location_updated_at, now());
    end if;
    return new;
  end if;

  if new.current_lat is distinct from old.current_lat
     or new.current_lng is distinct from old.current_lng then
    if new.current_lat is not null and new.current_lng is not null then
      new.location_updated_at := now();
    else
      new.location_updated_at := null;
    end if;
  else
    new.location_updated_at := old.location_updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_driver_location_freshness on public.driver_live_status;
create trigger taximun_driver_location_freshness
before insert or update on public.driver_live_status
for each row execute function public.taximun_set_driver_location_updated_at();

create index if not exists driver_live_status_location_freshness_idx
  on public.driver_live_status(status, location_updated_at desc)
  where current_lat is not null and current_lng is not null;

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
  v_candidate_count integer := 0;
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
    return jsonb_build_object('ok', true, 'code', 'RIDE_ALREADY_PROCESSED', 'rideId', v_ride.id, 'status', v_ride.status, 'driverId', v_ride.driver_id);
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'smart_dispatch')
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();

  select * into v_offer
  from public.taxi_ride_offers
  where ride_id = p_ride_id and status = 'pending' and expires_at > now()
  order by offered_at desc
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'code', 'ACTIVE_OFFER_EXISTS', 'rideId', p_ride_id, 'offerId', v_offer.id, 'driverId', v_offer.driver_id, 'expiresAt', v_offer.expires_at);
  end if;

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
      6371 * 2 * asin(sqrt(
        power(sin(radians((d.current_lat - v_ride.pickup_lat) / 2)), 2) +
        cos(radians(v_ride.pickup_lat)) * cos(radians(d.current_lat)) *
        power(sin(radians((d.current_lng - v_ride.pickup_lng) / 2)), 2)
      )) as distance_km,
      greatest(0, extract(epoch from (now() - d.location_updated_at)))::integer as freshness_seconds,
      (select count(*) from public.taxi_ride_offers ro where ro.ride_id = p_ride_id and ro.driver_id = d.driver_id and ro.status in ('rejected','expired')) as rejection_count
    from public.driver_live_status d
    left join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null and d.current_lng is not null
      and d.location_updated_at >= now() - interval '3 minutes'
      and not exists (
        select 1 from public.taxi_rides ar
        where ar.driver_id = d.driver_id and ar.status in ('assigned','in_progress')
      )
  ), scored as (
    select *,
      greatest(1, ceil(distance_km / 0.45))::integer as eta_minutes,
      offers_received * 0.12 as fairness_penalty,
      rejection_count * 2.5 as rejection_penalty,
      distance_km * 10
        + greatest(0, 5 - driver_rating) * 3
        + freshness_seconds / 30.0
        + offers_received * 0.12
        + rejection_count * 2.5 as final_score
    from candidates
  )
  select *, count(*) over() into v_driver
  from scored
  order by final_score asc, updated_at desc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(ride_id, result_code, candidate_count)
    values (p_ride_id, 'NO_DRIVER_AVAILABLE', 0);
    return jsonb_build_object('ok', false, 'code', 'NO_DRIVER_AVAILABLE', 'rideId', p_ride_id);
  end if;

  v_candidate_count := coalesce(v_driver.count, 1);

  insert into public.taxi_ride_offers(ride_id, driver_id, status, offered_at, expires_at, metadata)
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch_v1',
      'distanceKm', round(v_driver.distance_km::numeric, 3),
      'etaMinutes', v_driver.eta_minutes,
      'driverRating', v_driver.driver_rating,
      'finalScore', round(v_driver.final_score::numeric, 4),
      'candidateCount', v_candidate_count
    )
  ) returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(), offers_received = coalesce(offers_received, 0) + 1, updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id, driver_id, offer_id, result_code, distance_km, estimated_eta_minutes,
    driver_rating, freshness_seconds, fairness_penalty, rejection_penalty,
    final_score, candidate_count, metadata
  ) values (
    p_ride_id, v_driver.driver_id, v_offer.id, 'OFFER_CREATED',
    round(v_driver.distance_km::numeric, 3), v_driver.eta_minutes,
    v_driver.driver_rating, v_driver.freshness_seconds,
    v_driver.fairness_penalty, v_driver.rejection_penalty,
    round(v_driver.final_score::numeric, 4), v_candidate_count,
    jsonb_build_object('offerSeconds', v_seconds)
  );

  insert into public.taxi_activity_logs(actor_id, actor_role, message, ride_id)
  values (v_driver.driver_id, 'system', 'Oferta creada por Smart Dispatch v1', p_ride_id);

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'distanceKm', round(v_driver.distance_km::numeric, 3),
    'etaMinutes', v_driver.eta_minutes,
    'driverRating', v_driver.driver_rating,
    'finalScore', round(v_driver.final_score::numeric, 4),
    'candidateCount', v_candidate_count,
    'algorithmVersion', 'smart_dispatch_v1'
  );
end;
$$;

revoke all on function public.taximun_server_dispatch(uuid, integer) from public;
grant execute on function public.taximun_server_dispatch(uuid, integer) to authenticated;
grant execute on function public.taximun_server_dispatch(uuid, integer) to service_role;
