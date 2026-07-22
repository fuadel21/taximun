-- PR #74 · Smart dispatch scoring, fairness and audit

create table if not exists public.taxi_dispatch_decisions (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text,
  offer_id uuid references public.taxi_ride_offers(id) on delete set null,
  decision_code text not null,
  distance_score numeric,
  freshness_score numeric,
  fairness_score numeric,
  total_score numeric,
  candidates_considered integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists taxi_dispatch_decisions_ride_idx
  on public.taxi_dispatch_decisions(ride_id, created_at desc);
create index if not exists taxi_dispatch_decisions_driver_idx
  on public.taxi_dispatch_decisions(driver_id, created_at desc)
  where driver_id is not null;
create index if not exists taxi_dispatch_decisions_code_idx
  on public.taxi_dispatch_decisions(decision_code, created_at desc);

alter table public.taxi_dispatch_decisions enable row level security;
alter table public.taxi_dispatch_decisions force row level security;
revoke all on public.taxi_dispatch_decisions from anon, authenticated;
grant all on public.taxi_dispatch_decisions to service_role;

create or replace function public.taximun_smart_dispatch(
  p_ride_id uuid,
  p_offer_seconds integer default 25,
  p_stale_seconds integer default 120
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
  v_stale integer := greatest(30, least(coalesce(p_stale_seconds, 120), 900));
  v_candidates integer := 0;
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
    return jsonb_build_object('ok', true, 'code', 'RIDE_ALREADY_PROCESSED', 'rideId', v_ride.id);
  end if;

  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expiredBy', 'smart_dispatch')
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

  select count(*) into v_candidates
  from public.driver_live_status d
  where d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and d.updated_at >= now() - make_interval(secs => v_stale)
    and not exists (
      select 1 from public.taxi_rides r
      where r.driver_id = d.driver_id and r.status in ('assigned','in_progress')
    )
    and not exists (
      select 1 from public.taxi_ride_offers o
      where o.ride_id = p_ride_id
        and o.driver_id = d.driver_id
        and o.status in ('rejected','expired')
    );

  select ranked.* into v_driver
  from (
    select
      d.driver_id,
      d.driver_name,
      d.taxi_code,
      d.plate,
      d.current_lat,
      d.current_lng,
      sqrt(
        power(coalesce(d.current_lat, 0) - coalesce(v_ride.pickup_lat, 0), 2) +
        power(coalesce(d.current_lng, 0) - coalesce(v_ride.pickup_lng, 0), 2)
      ) as distance_score,
      least(1.0, extract(epoch from (now() - d.updated_at)) / greatest(v_stale, 1)) as freshness_score,
      least(1.0, extract(epoch from (now() - coalesce(d.last_offer_at, d.updated_at))) / 1800.0) as fairness_score,
      (
        sqrt(
          power(coalesce(d.current_lat, 0) - coalesce(v_ride.pickup_lat, 0), 2) +
          power(coalesce(d.current_lng, 0) - coalesce(v_ride.pickup_lng, 0), 2)
        ) * 0.72
        + least(1.0, extract(epoch from (now() - d.updated_at)) / greatest(v_stale, 1)) * 0.18
        - least(1.0, extract(epoch from (now() - coalesce(d.last_offer_at, d.updated_at))) / 1800.0) * 0.10
      ) as total_score
    from public.driver_live_status d
    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null
      and d.updated_at >= now() - make_interval(secs => v_stale)
      and not exists (
        select 1 from public.taxi_rides r
        where r.driver_id = d.driver_id and r.status in ('assigned','in_progress')
      )
      and not exists (
        select 1 from public.taxi_ride_offers o
        where o.ride_id = p_ride_id
          and o.driver_id = d.driver_id
          and o.status in ('rejected','expired')
      )
  ) ranked
  order by ranked.total_score asc, ranked.driver_id asc
  limit 1;

  if not found then
    insert into public.taxi_dispatch_decisions(ride_id, decision_code, candidates_considered, details)
    values (p_ride_id, 'NO_DRIVER_AVAILABLE', v_candidates, jsonb_build_object('staleSeconds', v_stale));
    return jsonb_build_object('ok', false, 'code', 'NO_DRIVER_AVAILABLE', 'rideId', p_ride_id);
  end if;

  insert into public.taxi_ride_offers(ride_id, driver_id, status, offered_at, expires_at, metadata)
  values (
    p_ride_id,
    v_driver.driver_id,
    'pending',
    now(),
    now() + make_interval(secs => v_seconds),
    jsonb_build_object(
      'source', 'smart_dispatch',
      'distanceScore', v_driver.distance_score,
      'freshnessScore', v_driver.freshness_score,
      'fairnessScore', v_driver.fairness_score,
      'totalScore', v_driver.total_score,
      'candidatesConsidered', v_candidates
    )
  ) returning * into v_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received = coalesce(offers_received, 0) + 1,
      updated_at = now()
  where driver_id = v_driver.driver_id;

  insert into public.taxi_dispatch_decisions(
    ride_id, driver_id, offer_id, decision_code,
    distance_score, freshness_score, fairness_score, total_score,
    candidates_considered, details
  ) values (
    p_ride_id, v_driver.driver_id, v_offer.id, 'OFFER_CREATED',
    v_driver.distance_score, v_driver.freshness_score, v_driver.fairness_score, v_driver.total_score,
    v_candidates,
    jsonb_build_object('offerSeconds', v_seconds, 'staleSeconds', v_stale)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OFFER_CREATED',
    'rideId', p_ride_id,
    'offerId', v_offer.id,
    'driverId', v_driver.driver_id,
    'expiresAt', v_offer.expires_at,
    'score', v_driver.total_score,
    'candidatesConsidered', v_candidates
  );
end;
$$;

revoke all on function public.taximun_smart_dispatch(uuid, integer, integer) from public;
grant execute on function public.taximun_smart_dispatch(uuid, integer, integer) to authenticated;
grant execute on function public.taximun_smart_dispatch(uuid, integer, integer) to service_role;