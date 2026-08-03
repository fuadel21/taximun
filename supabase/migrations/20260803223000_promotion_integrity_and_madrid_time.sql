-- PR #141 · Atomic promotion redemption integrity

create or replace function public.taximun_reserve_promotion_redemption(
  p_promotion_id uuid,
  p_passenger_id text,
  p_ride_id uuid default null,
  p_scheduled_booking_id uuid default null,
  p_category text default 'standard',
  p_subtotal numeric default 0
)
returns table (
  redemption_id uuid,
  promotion_code text,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_promotion public.taxi_promotions%rowtype;
  v_total_uses integer;
  v_user_uses integer;
  v_raw_discount numeric;
  v_discount numeric;
  v_redemption_id uuid;
begin
  if (p_ride_id is null) = (p_scheduled_booking_id is null) then
    raise exception 'PROMOTION_TARGET_INVALID';
  end if;

  -- Serialize definitive redemption checks. This deliberately favors correctness
  -- over throughput because promotion redemption volume is low and financial.
  perform pg_advisory_xact_lock(839201, 141);

  if p_ride_id is not null and not exists (
    select 1 from public.taxi_rides
    where id = p_ride_id and passenger_id = p_passenger_id
  ) then
    raise exception 'PROMOTION_TARGET_NOT_OWNED';
  end if;

  if p_scheduled_booking_id is not null and not exists (
    select 1 from public.taxi_scheduled_bookings
    where id = p_scheduled_booking_id
      and passenger_id = p_passenger_id
      and status = 'scheduled'
  ) then
    raise exception 'PROMOTION_TARGET_NOT_OWNED';
  end if;

  select * into v_promotion
  from public.taxi_promotions
  where id = p_promotion_id
  for update;

  if not found
     or not v_promotion.active
     or v_promotion.starts_at > now()
     or (v_promotion.ends_at is not null and v_promotion.ends_at <= now()) then
    raise exception 'PROMOTION_NOT_ACTIVE';
  end if;

  if not (p_category = any(v_promotion.eligible_categories)) then
    raise exception 'PROMOTION_CATEGORY_NOT_ELIGIBLE';
  end if;

  if p_subtotal < v_promotion.minimum_subtotal then
    raise exception 'PROMOTION_MINIMUM_NOT_MET';
  end if;

  -- A booking being edited replaces its own redemption inside this transaction.
  if p_ride_id is not null then
    delete from public.taxi_promotion_redemptions where ride_id = p_ride_id;
  else
    delete from public.taxi_promotion_redemptions where scheduled_booking_id = p_scheduled_booking_id;
  end if;

  select count(*) into v_total_uses
  from public.taxi_promotion_redemptions
  where promotion_id = p_promotion_id;

  select count(*) into v_user_uses
  from public.taxi_promotion_redemptions
  where promotion_id = p_promotion_id
    and passenger_id = p_passenger_id;

  if v_promotion.max_total_uses is not null
     and v_total_uses >= v_promotion.max_total_uses then
    raise exception 'PROMOTION_TOTAL_LIMIT_REACHED';
  end if;

  if v_user_uses >= v_promotion.max_uses_per_user then
    raise exception 'PROMOTION_USER_LIMIT_REACHED';
  end if;

  v_raw_discount := case
    when v_promotion.discount_type = 'percent'
      then p_subtotal * v_promotion.discount_value / 100
    else v_promotion.discount_value
  end;

  v_discount := least(
    p_subtotal,
    greatest(
      0,
      case
        when v_promotion.max_discount is null then v_raw_discount
        else least(v_raw_discount, v_promotion.max_discount)
      end
    )
  );

  insert into public.taxi_promotion_redemptions (
    promotion_id,
    passenger_id,
    ride_id,
    scheduled_booking_id,
    subtotal,
    discount_amount
  ) values (
    p_promotion_id,
    p_passenger_id,
    p_ride_id,
    p_scheduled_booking_id,
    round(p_subtotal, 2),
    round(v_discount, 2)
  )
  returning id into v_redemption_id;

  return query select v_redemption_id, v_promotion.code, round(v_discount, 2);
end;
$$;

revoke all on function public.taximun_reserve_promotion_redemption(
  uuid, text, uuid, uuid, text, numeric
) from public, anon, authenticated;

grant execute on function public.taximun_reserve_promotion_redemption(
  uuid, text, uuid, uuid, text, numeric
) to service_role;
