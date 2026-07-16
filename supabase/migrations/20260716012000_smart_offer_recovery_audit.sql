-- Recovery, reconciliation and health diagnostics for smart ride offers.

create or replace function public.taximun_cancel_offers_for_unavailable_ride()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.taxi_ride_offers
    set status = case when new.status = 'assigned' then status else 'cancelled' end,
        responded_at = coalesce(responded_at, now()),
        metadata = metadata || jsonb_build_object('cancel_reason', 'ride_' || new.status),
        updated_at = now()
    where ride_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_cancel_offers_for_ride on public.taxi_rides;
create trigger trg_taximun_cancel_offers_for_ride
after update of status on public.taxi_rides
for each row
execute function public.taximun_cancel_offers_for_unavailable_ride();

create or replace function public.taximun_reconcile_dispatch_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_offers integer := 0;
  unavailable_ride_offers integer := 0;
  ineligible_driver_offers integer := 0;
  restored_drivers integer := 0;
begin
  with changed as (
    update public.taxi_ride_offers
    set status = 'expired',
        responded_at = coalesce(responded_at, now()),
        response_ms = greatest(0, floor(extract(epoch from (now() - offered_at)) * 1000)::integer),
        metadata = metadata || jsonb_build_object('reconciled', true, 'reason', 'expired'),
        updated_at = now()
    where status = 'pending'
      and expires_at <= now()
    returning driver_id
  ), stats as (
    select driver_id, count(*)::integer amount
    from changed
    group by driver_id
  ), driver_updates as (
    update public.driver_live_status d
    set offers_expired = coalesce(d.offers_expired, 0) + stats.amount
    from stats
    where d.driver_id = stats.driver_id
    returning d.driver_id
  )
  select count(*) into expired_offers from changed;

  with changed as (
    update public.taxi_ride_offers o
    set status = 'cancelled',
        responded_at = coalesce(o.responded_at, now()),
        metadata = o.metadata || jsonb_build_object('reconciled', true, 'reason', 'ride_unavailable'),
        updated_at = now()
    from public.taxi_rides r
    where o.ride_id = r.id
      and o.status = 'pending'
      and r.status <> 'pending'
    returning o.id
  )
  select count(*) into unavailable_ride_offers from changed;

  with changed as (
    update public.taxi_ride_offers o
    set status = 'cancelled',
        responded_at = coalesce(o.responded_at, now()),
        metadata = o.metadata || jsonb_build_object('reconciled', true, 'reason', 'driver_ineligible'),
        updated_at = now()
    where o.status = 'pending'
      and exists (
        select 1
        from public.driver_live_status d
        where d.driver_id = o.driver_id
          and (
            d.status <> 'available'
            or d.current_lat is null
            or d.current_lng is null
            or d.updated_at < now() - interval '2 minutes'
          )
      )
    returning o.id
  )
  select count(*) into ineligible_driver_offers from changed;

  with changed as (
    update public.driver_live_status d
    set status = 'available', updated_at = now()
    where d.status = 'busy'
      and not exists (
        select 1 from public.taxi_rides r
        where r.driver_id = d.driver_id
          and r.status in ('assigned','in_progress')
      )
    returning d.driver_id
  )
  select count(*) into restored_drivers from changed;

  return jsonb_build_object(
    'expiredOffers', expired_offers,
    'unavailableRideOffers', unavailable_ride_offers,
    'ineligibleDriverOffers', ineligible_driver_offers,
    'restoredDrivers', restored_drivers,
    'reconciledAt', now()
  );
end;
$$;

create or replace function public.taximun_dispatch_health()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pendingRides', (select count(*) from public.taxi_rides where status = 'pending'),
    'stalePendingRides', (select count(*) from public.taxi_rides where status = 'pending' and requested_at < now() - interval '30 minutes'),
    'pendingOffers', (select count(*) from public.taxi_ride_offers where status = 'pending'),
    'expiredButPendingOffers', (select count(*) from public.taxi_ride_offers where status = 'pending' and expires_at <= now()),
    'offersForUnavailableRides', (
      select count(*) from public.taxi_ride_offers o
      join public.taxi_rides r on r.id = o.ride_id
      where o.status = 'pending' and r.status <> 'pending'
    ),
    'offersForStaleDrivers', (
      select count(*) from public.taxi_ride_offers o
      join public.driver_live_status d on d.driver_id = o.driver_id
      where o.status = 'pending'
        and (d.status <> 'available' or d.updated_at < now() - interval '2 minutes')
    ),
    'availableDrivers', (
      select count(*) from public.driver_live_status d
      join public.taxi_user_profiles p on p.user_id = d.driver_id and p.role = 'driver'
      where d.status = 'available'
        and d.current_lat is not null
        and d.current_lng is not null
        and d.updated_at >= now() - interval '2 minutes'
        and p.is_verified = true
    ),
    'checkedAt', now()
  );
$$;

grant execute on function public.taximun_reconcile_dispatch_state() to service_role;
grant execute on function public.taximun_dispatch_health() to service_role;
