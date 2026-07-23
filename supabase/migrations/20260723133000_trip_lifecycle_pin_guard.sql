-- Secure trip lifecycle: persisted pickup PIN, atomic start, and strict transitions.

alter table public.taxi_rides
  add column if not exists pickup_pin text,
  add column if not exists pin_verified_at timestamptz;

update public.taxi_rides
set pickup_pin = upper(substr(replace(id::text, '-', ''), 1, 4))
where pickup_pin is null;

alter table public.taxi_rides
  alter column pickup_pin set not null;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_pickup_pin_check;

alter table public.taxi_rides
  add constraint taxi_rides_pickup_pin_check
  check (pickup_pin ~ '^[A-F0-9]{4}$');

create or replace function public.taximun_set_pickup_pin()
returns trigger
language plpgsql
as $$
begin
  if new.pickup_pin is null then
    new.pickup_pin := upper(substr(replace(new.id::text, '-', ''), 1, 4));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_set_pickup_pin on public.taxi_rides;
create trigger trg_taximun_set_pickup_pin
before insert on public.taxi_rides
for each row execute function public.taximun_set_pickup_pin();

create or replace function public.taximun_start_ride_with_pin(
  p_ride_id uuid,
  p_driver_id text,
  p_pickup_pin text
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
begin
  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found or v_ride.status <> 'assigned' then
    raise exception 'RIDE_NOT_ASSIGNED';
  end if;
  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;
  if v_ride.driver_arrived_at is null then
    raise exception 'DRIVER_NOT_ARRIVED';
  end if;
  if upper(trim(p_pickup_pin)) is distinct from v_ride.pickup_pin then
    raise exception 'INVALID_PICKUP_PIN';
  end if;

  update public.taxi_rides
  set status = 'in_progress',
      started_at = now(),
      pin_verified_at = now()
  where id = p_ride_id
  returning * into v_ride;

  return v_ride;
end;
$$;

revoke all on function public.taximun_start_ride_with_pin(uuid, text, text) from public;
grant execute on function public.taximun_start_ride_with_pin(uuid, text, text) to authenticated, service_role;

create or replace function public.taximun_enforce_trip_state_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status not in ('assigned', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: pending -> %', new.status;
  elsif old.status = 'assigned' and new.status not in ('in_progress', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: assigned -> %', new.status;
  elsif old.status = 'in_progress' and new.status not in ('completed', 'cancelled') then
    raise exception 'INVALID_RIDE_TRANSITION: in_progress -> %', new.status;
  elsif old.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'INVALID_RIDE_TRANSITION: terminal state %', old.status;
  end if;

  if new.status = 'in_progress' then
    if new.driver_arrived_at is null or new.pin_verified_at is null or new.started_at is null then
      raise exception 'RIDE_START_GUARD_REQUIRED';
    end if;
  end if;

  if new.status = 'completed' and old.status <> 'in_progress' then
    raise exception 'RIDE_MUST_BE_IN_PROGRESS_BEFORE_COMPLETION';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_trip_state_transition on public.taxi_rides;
create trigger trg_taximun_trip_state_transition
before update of status on public.taxi_rides
for each row execute function public.taximun_enforce_trip_state_transition();
