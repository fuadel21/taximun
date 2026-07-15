-- Smart, auditable ride offers with 20-second expiry and nearest-driver ranking.

alter table public.driver_live_status
  add column if not exists last_offer_at timestamptz,
  add column if not exists offers_received integer not null default 0,
  add column if not exists offers_accepted integer not null default 0,
  add column if not exists offers_rejected integer not null default 0,
  add column if not exists offers_expired integer not null default 0;

create table if not exists public.taxi_ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  status text not null default 'pending',
  rank_score numeric(12,4),
  distance_to_pickup_km numeric(10,2),
  eta_to_pickup_minutes integer,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_ride_offers_status_check
    check (status in ('pending','accepted','rejected','expired','cancelled'))
);

create unique index if not exists taxi_ride_offers_one_pending_per_ride
  on public.taxi_ride_offers(ride_id)
  where status = 'pending';

create unique index if not exists taxi_ride_offers_one_pending_per_driver
  on public.taxi_ride_offers(driver_id)
  where status = 'pending';

create index if not exists taxi_ride_offers_driver_status_idx
  on public.taxi_ride_offers(driver_id, status, expires_at desc);

create index if not exists taxi_ride_offers_ride_created_idx
  on public.taxi_ride_offers(ride_id, created_at desc);

alter table public.taxi_ride_offers enable row level security;

drop policy if exists taxi_ride_offers_participant_select on public.taxi_ride_offers;
create policy taxi_ride_offers_participant_select
  on public.taxi_ride_offers
  for select
  to authenticated
  using (
    driver_id = 'supabase:' || auth.uid()::text
    or exists (
      select 1 from public.taxi_rides r
      where r.id = taxi_ride_offers.ride_id
        and r.passenger_id = 'supabase:' || auth.uid()::text
    )
    or exists (
      select 1 from public.taxi_user_profiles p
      where p.user_id = 'supabase:' || auth.uid()::text
        and p.role = 'admin'
    )
  );

grant select on public.taxi_ride_offers to authenticated;
grant all on public.taxi_ride_offers to service_role;

create or replace function public.taximun_distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      )
    )
  end;
$$;

create or replace function public.taximun_expire_ride_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.taxi_ride_offers
    set status = 'expired',
        responded_at = now(),
        response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
        updated_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning driver_id
  ), aggregated as (
    select driver_id, count(*)::integer as amount
    from expired
    group by driver_id
  )
  update public.driver_live_status d
  set offers_expired = coalesce(d.offers_expired, 0) + aggregated.amount
  from aggregated
  where d.driver_id = aggregated.driver_id;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.taximun_claim_smart_offer(p_driver_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_offer record;
  candidate_ride record;
  best_driver record;
  created_offer record;
  driver_row record;
  distance_km double precision;
  eta_minutes integer;
begin
  perform public.taximun_expire_ride_offers();

  select o.*, r.pickup_address, r.dropoff_address, r.estimated_fare,
         r.estimated_duration, r.distance_km as trip_distance_km,
         r.payment_method, r.service_type, r.passenger_name,
         r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng
  into existing_offer
  from public.taxi_ride_offers o
  join public.taxi_rides r on r.id = o.ride_id
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
  join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
  where d.driver_id = p_driver_id
    and d.status = 'available'
    and d.current_lat is not null
    and d.current_lng is not null
    and d.updated_at >= now() - interval '2 minutes'
    and p.is_verified = true
    and not exists (
      select 1 from public.taxi_rides ar
      where ar.driver_id = p_driver_id
        and ar.status in ('assigned','in_progress')
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
      select 1 from public.taxi_ride_offers active_offer
      where active_offer.ride_id = r.id
        and active_offer.status = 'pending'
        and active_offer.expires_at > now()
    )
    and not exists (
      select 1 from public.taxi_ride_offers prior
      where prior.ride_id = r.id
        and prior.driver_id = p_driver_id
        and prior.status in ('rejected','expired')
    )
  order by r.requested_at asc
  limit 1;

  if not found then
    return null;
  end if;

  select ranked.*
  into best_driver
  from (
    select d.driver_id,
           public.taximun_distance_km(
             d.current_lat::double precision,
             d.current_lng::double precision,
             candidate_ride.pickup_lat::double precision,
             candidate_ride.pickup_lng::double precision
           ) as pickup_distance,
           (
             coalesce(public.taximun_distance_km(
               d.current_lat::double precision,
               d.current_lng::double precision,
               candidate_ride.pickup_lat::double precision,
               candidate_ride.pickup_lng::double precision
             ), 999) * 10
             - coalesce(p.rating::double precision, 5) * 0.5
             - least(extract(epoch from (now() - coalesce(d.last_offer_at, d.updated_at))) / 60, 120) * 0.03
             + case
                 when coalesce(d.offers_received, 0) = 0 then 0
                 else (1 - coalesce(d.offers_accepted, 0)::double precision / greatest(d.offers_received, 1)) * 2
               end
           ) as rank_score
    from public.driver_live_status d
    join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
    where d.status = 'available'
      and d.current_lat is not null
      and d.current_lng is not null
      and d.updated_at >= now() - interval '2 minutes'
      and p.is_verified = true
      and not exists (
        select 1 from public.taxi_rides ar
        where ar.driver_id = d.driver_id
          and ar.status in ('assigned','in_progress')
      )
      and not exists (
        select 1 from public.taxi_ride_offers prior
        where prior.ride_id = candidate_ride.id
          and prior.driver_id = d.driver_id
          and prior.status in ('rejected','expired')
      )
  ) ranked
  where ranked.pickup_distance is null or ranked.pickup_distance <= 15
  order by ranked.rank_score asc, ranked.pickup_distance asc nulls last
  limit 1;

  if not found or best_driver.driver_id <> p_driver_id then
    return null;
  end if;

  distance_km := best_driver.pickup_distance;
  eta_minutes := case
    when distance_km is null then null
    else greatest(2, ceil((distance_km / 22.0) * 60 + 2)::integer)
  end;

  insert into public.taxi_ride_offers (
    ride_id, driver_id, status, rank_score,
    distance_to_pickup_km, eta_to_pickup_minutes,
    offered_at, expires_at, metadata
  ) values (
    candidate_ride.id,
    p_driver_id,
    'pending',
    best_driver.rank_score,
    case when distance_km is null then null else round(distance_km::numeric, 2) end,
    eta_minutes,
    now(),
    now() + interval '20 seconds',
    jsonb_build_object('engine', 'smart_v1', 'radius_km', 15)
  )
  returning * into created_offer;

  update public.driver_live_status
  set last_offer_at = now(),
      offers_received = coalesce(offers_received, 0) + 1
  where driver_id = p_driver_id;

  return to_jsonb(created_offer) || jsonb_build_object(
    'pickup_address', candidate_ride.pickup_address,
    'dropoff_address', candidate_ride.dropoff_address,
    'estimated_fare', candidate_ride.estimated_fare,
    'estimated_duration', candidate_ride.estimated_duration,
    'trip_distance_km', candidate_ride.distance_km,
    'payment_method', candidate_ride.payment_method,
    'service_type', candidate_ride.service_type,
    'passenger_name', candidate_ride.passenger_name,
    'pickup_lat', candidate_ride.pickup_lat,
    'pickup_lng', candidate_ride.pickup_lng,
    'dropoff_lat', candidate_ride.dropoff_lat,
    'dropoff_lng', candidate_ride.dropoff_lng
  );
exception
  when unique_violation then
    return null;
end;
$$;

create or replace function public.taximun_accept_smart_offer(
  p_offer_id uuid,
  p_driver_id text,
  p_driver_name text,
  p_taxi_code text,
  p_plate text
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.taxi_ride_offers%rowtype;
  ride_row public.taxi_rides%rowtype;
begin
  perform public.taximun_expire_ride_offers();

  select * into offer_row
  from public.taxi_ride_offers
  where id = p_offer_id
  for update;

  if not found or offer_row.driver_id <> p_driver_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;
  if offer_row.status <> 'pending' or offer_row.expires_at <= now() then
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into ride_row
  from public.taxi_rides
  where id = offer_row.ride_id
  for update;

  if not found or ride_row.status <> 'pending' then
    raise exception 'RIDE_NOT_AVAILABLE';
  end if;

  update public.taxi_ride_offers
  set status = 'accepted',
      responded_at = now(),
      response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
      updated_at = now()
  where id = p_offer_id;

  update public.taxi_ride_offers
  set status = 'cancelled', updated_at = now()
  where ride_id = ride_row.id
    and id <> p_offer_id
    and status = 'pending';

  update public.taxi_rides
  set status = 'assigned',
      driver_id = p_driver_id,
      driver_name = p_driver_name,
      taxi_code = p_taxi_code,
      plate = p_plate,
      assigned_at = now()
  where id = ride_row.id
  returning * into ride_row;

  update public.driver_live_status
  set status = 'busy',
      offers_accepted = coalesce(offers_accepted, 0) + 1,
      updated_at = now()
  where driver_id = p_driver_id;

  return ride_row;
end;
$$;

create or replace function public.taximun_reject_smart_offer(
  p_offer_id uuid,
  p_driver_id text,
  p_reason text default 'driver_declined'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.taxi_ride_offers
  set status = case when expires_at <= now() then 'expired' else 'rejected' end,
      responded_at = now(),
      response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
      metadata = metadata || jsonb_build_object('reason', p_reason),
      updated_at = now()
  where id = p_offer_id
    and driver_id = p_driver_id
    and status = 'pending';

  get diagnostics changed = row_count;

  if changed > 0 then
    update public.driver_live_status
    set offers_rejected = coalesce(offers_rejected, 0) + 1,
        updated_at = now()
    where driver_id = p_driver_id;
  end if;

  return changed > 0;
end;
$$;

grant execute on function public.taximun_claim_smart_offer(text) to service_role;
grant execute on function public.taximun_accept_smart_offer(uuid,text,text,text,text) to service_role;
grant execute on function public.taximun_reject_smart_offer(uuid,text,text) to service_role;
grant execute on function public.taximun_expire_ride_offers() to service_role;
