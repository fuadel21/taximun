-- Taximun matching and safe assignment RPCs.
-- This layer prevents double-booking a driver and keeps rejected rides visible to other drivers.

alter table public.taxi_rides add column if not exists market_id text not null default 'barcelona';
alter table public.taxi_rides add column if not exists pickup_zone text not null default 'Barcelona';
alter table public.taxi_rides add column if not exists service_type text not null default 'taxi';

create table if not exists public.taxi_ride_rejections (
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (ride_id, driver_id)
);

create index if not exists taxi_rides_market_status_zone_idx on public.taxi_rides(market_id, status, pickup_zone, requested_at asc);
create index if not exists taxi_rides_service_type_idx on public.taxi_rides(service_type, requested_at desc);
create index if not exists taxi_ride_rejections_driver_idx on public.taxi_ride_rejections(driver_id, created_at desc);

alter table public.taxi_ride_rejections enable row level security;

drop policy if exists "ride rejections select own or admin" on public.taxi_ride_rejections;
create policy "ride rejections select own or admin"
on public.taxi_ride_rejections
for select
to authenticated
using (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

drop policy if exists "ride rejections insert own" on public.taxi_ride_rejections;
create policy "ride rejections insert own"
on public.taxi_ride_rejections
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

create or replace function public.taximun_driver_has_active_ride(p_driver_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.taxi_rides
    where driver_id = p_driver_id
      and status in ('assigned', 'in_progress')
  );
$$;

create or replace function public.taximun_find_pending_rides_for_driver(
  p_driver_id text,
  p_current_zone text default null,
  p_limit integer default 20
)
returns setof public.taxi_rides
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.taxi_rides r
  where r.status = 'pending'
    and not public.taximun_driver_has_active_ride(p_driver_id)
    and not exists (
      select 1
      from public.taxi_ride_rejections rr
      where rr.ride_id = r.id
        and rr.driver_id = p_driver_id
    )
  order by
    case
      when p_current_zone is not null and lower(r.pickup_zone) = lower(p_current_zone) then 0
      when p_current_zone is not null and r.pickup_address ilike '%' || p_current_zone || '%' then 1
      else 2
    end,
    r.requested_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.taximun_accept_ride(
  p_ride_id uuid,
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
  v_ride public.taxi_rides;
  v_live public.driver_live_status;
begin
  select *
  into v_live
  from public.driver_live_status
  where driver_id = p_driver_id;

  if v_live.driver_id is null then
    raise exception 'DRIVER_NOT_ONLINE' using errcode = 'P0001';
  end if;

  if v_live.status <> 'available' then
    raise exception 'DRIVER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if public.taximun_driver_has_active_ride(p_driver_id) then
    raise exception 'DRIVER_ALREADY_BUSY' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.taxi_ride_rejections
    where ride_id = p_ride_id
      and driver_id = p_driver_id
  ) then
    raise exception 'DRIVER_REJECTED_RIDE' using errcode = 'P0001';
  end if;

  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if v_ride.id is null then
    raise exception 'RIDE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_ride.status <> 'pending' then
    raise exception 'RIDE_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.taxi_rides
  set
    driver_id = p_driver_id,
    driver_name = coalesce(nullif(p_driver_name, ''), 'Conductor'),
    taxi_code = coalesce(nullif(p_taxi_code, ''), v_live.taxi_code, 'TX-000'),
    plate = coalesce(nullif(p_plate, ''), v_live.plate, 'SIN-MAT'),
    status = 'assigned',
    assigned_at = now()
  where id = p_ride_id
    and status = 'pending'
  returning * into v_ride;

  if v_ride.id is null then
    raise exception 'RIDE_ALREADY_TAKEN' using errcode = 'P0001';
  end if;

  update public.driver_live_status
  set
    driver_name = coalesce(nullif(p_driver_name, ''), driver_name, 'Conductor'),
    taxi_code = coalesce(nullif(p_taxi_code, ''), taxi_code, 'TX-000'),
    plate = coalesce(nullif(p_plate, ''), plate, 'SIN-MAT'),
    status = 'busy',
    updated_at = now()
  where driver_id = p_driver_id;

  return v_ride;
end;
$$;

create or replace function public.taximun_reject_ride(
  p_ride_id uuid,
  p_driver_id text,
  p_reason text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.taxi_rides;
begin
  select *
  into v_ride
  from public.taxi_rides
  where id = p_ride_id;

  if v_ride.id is null then
    raise exception 'RIDE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_ride.status <> 'pending' then
    raise exception 'RIDE_NOT_PENDING' using errcode = 'P0001';
  end if;

  insert into public.taxi_ride_rejections(ride_id, driver_id, reason)
  values (p_ride_id, p_driver_id, p_reason)
  on conflict (ride_id, driver_id) do update
    set reason = excluded.reason,
        created_at = now();

  return v_ride;
end;
$$;

grant execute on function public.taximun_driver_has_active_ride(text) to authenticated, service_role;
grant execute on function public.taximun_find_pending_rides_for_driver(text, text, integer) to authenticated, service_role;
grant execute on function public.taximun_accept_ride(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.taximun_reject_ride(uuid, text, text) to authenticated, service_role;
