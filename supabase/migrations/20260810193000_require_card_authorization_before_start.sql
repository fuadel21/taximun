-- PR #154 · Require real card authorization before trip start

create or replace function public.taximun_require_card_authorization_before_start()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
begin
  if new.status <> 'in_progress' or old.status = 'in_progress' then
    return new;
  end if;

  if new.payment_method <> 'card' then
    return new;
  end if;

  v_expected_cents := ceil(
    greatest(
      coalesce(new.fare_range_max, 0),
      coalesce(new.estimated_fare, 0)
    ) * 100
  )::integer;

  -- A 0 € ride does not need a Stripe hold. The existing capture(0) path
  -- records the internal zero-fare ledger before final settlement.
  if v_expected_cents = 0 then
    return new;
  end if;

  select *
  into v_payment
  from public.taxi_payments
  where ride_id = new.id
  for update;

  if not found
     or v_payment.status <> 'authorized'
     or coalesce(v_payment.amount_authorized, 0) < v_expected_cents then
    raise exception 'CARD_AUTHORIZATION_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_require_card_authorization_before_start
  on public.taxi_rides;

create trigger taximun_require_card_authorization_before_start
before update of status
on public.taxi_rides
for each row
execute function public.taximun_require_card_authorization_before_start();
