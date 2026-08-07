-- PR #147 · Authoritative booking and payment-method integrity

create or replace function public.taximun_guard_authoritative_ride_insert()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_booking public.taxi_scheduled_bookings%rowtype;
begin
  if new.scheduled_booking_id is not null then
    select *
    into v_booking
    from public.taxi_scheduled_bookings
    where id = new.scheduled_booking_id;

    if not found then
      raise exception 'SCHEDULED_BOOKING_NOT_FOUND';
    end if;

    new.fare_subtotal := coalesce(new.fare_subtotal, v_booking.fare_subtotal, v_booking.estimated_fare);
    new.promo_code := coalesce(new.promo_code, v_booking.promo_code);
    new.promo_discount := coalesce(new.promo_discount, v_booking.promo_discount, 0);
    new.quote_version := coalesce(new.quote_version, v_booking.quote_version);
    new.quoted_at := coalesce(new.quoted_at, v_booking.quoted_at);
  end if;

  if new.status = 'pending'
     and new.scheduled_booking_id is null
     and nullif(trim(new.quote_version), '') is null then
    raise exception 'SERVER_PRICING_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_guard_authoritative_ride_insert
  on public.taxi_rides;

create trigger taximun_guard_authoritative_ride_insert
before insert
on public.taxi_rides
for each row
execute function public.taximun_guard_authoritative_ride_insert();

create or replace function public.taximun_lock_active_ride_payment_method()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if old.status in ('pending', 'assigned', 'in_progress')
     and new.payment_method is distinct from old.payment_method then
    raise exception 'PAYMENT_METHOD_LOCKED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_lock_active_ride_payment_method
  on public.taxi_rides;

create trigger taximun_lock_active_ride_payment_method
before update
on public.taxi_rides
for each row
execute function public.taximun_lock_active_ride_payment_method();
