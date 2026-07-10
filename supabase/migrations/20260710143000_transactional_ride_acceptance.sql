-- Transactional ride acceptance for Taximun.
-- Prevents two drivers accepting the same ride and prevents one driver accepting multiple active rides.
-- Also tracks per-driver rejections so one driver declining does not cancel the ride for everyone.

create table if not exists public.taxi_ride_rejections (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create index if not exists taxi_ride_rejections_driver_idx
on public.taxi_ride_rejections(driver_id, created_at desc);

create index if not exists taxi_ride_rejections_ride_idx
on public.taxi_ride_rejections(ride_id, created_at desc);

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

drop policy if exists "ride rejections insert own or admin" on public.taxi_ride_rejections;
create policy "ride rejections insert own or admin"
on public.taxi_ride_rejections
for insert
to authenticated
with check (
  public.taximun_is_admin()
  or driver_id = public.taximun_open_id()
);

create unique index if not exists taxi_rides_one_active_per_driver_idx
on public.taxi_rides(driver_id)
where driver_id is not null and status in ('assigned', 'in_progress');

create or replace function public.taximun_find_pending_rides_for_driver(p_driver_id text)
returns setof public.taxi_rides
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.taxi_rides r
  where r.status = 'pending'
    and r.passenger_id <> p_driver_id
    and not exists (
      select 1
      from public.taxi_ride_rejections rr
      where rr.ride_id = r.id
        and rr.driver_id = p_driver_id
    )
  order by r.requested_at asc
  limit 20;
$$;

create or replace function public.taximun_accept_ride_transactional(
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

  return v_ride;
end;
$$;

grant execute on function public.taximun_find_pending_rides_for_driver(text) to authenticated, service_role;
grant execute on function public.taximun_accept_ride_transactional(uuid, text, text, text, text) to authenticated, service_role;
