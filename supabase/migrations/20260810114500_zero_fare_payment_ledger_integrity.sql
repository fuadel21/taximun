-- PR #153 · Zero-fare Stripe ledger integrity and idempotent refunds

create or replace function public.taximun_record_payment_refund_atomic(
  p_payment_id uuid,
  p_provider_refund_id text,
  p_amount integer,
  p_reason text,
  p_status text,
  p_requested_by text
)
returns public.taxi_payments
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_payment public.taxi_payments%rowtype;
  v_existing_refund public.taxi_payment_refunds%rowtype;
  v_next_refunded integer;
  v_should_apply_amount boolean := false;
  v_refund_status text := coalesce(nullif(trim(p_status), ''), 'pending');
begin
  if p_amount <= 0 then
    raise exception 'REFUND_AMOUNT_INVALID';
  end if;

  if nullif(trim(p_provider_refund_id), '') is null then
    raise exception 'REFUND_PROVIDER_ID_REQUIRED';
  end if;

  if p_reason not in ('duplicate', 'fraudulent', 'requested_by_customer') then
    raise exception 'REFUND_REASON_INVALID';
  end if;

  if v_refund_status = 'canceled' then
    v_refund_status := 'cancelled';
  end if;

  if v_refund_status not in ('pending', 'succeeded', 'failed', 'cancelled') then
    v_refund_status := 'pending';
  end if;

  select *
  into v_payment
  from public.taxi_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  select *
  into v_existing_refund
  from public.taxi_payment_refunds
  where provider_refund_id = p_provider_refund_id;

  if found then
    if v_existing_refund.payment_id is distinct from p_payment_id then
      raise exception 'REFUND_PAYMENT_MISMATCH';
    end if;

    if v_existing_refund.amount is distinct from p_amount then
      raise exception 'REFUND_AMOUNT_MISMATCH';
    end if;

    -- Stripe refund terminal states must never move backwards on a stale retry.
    if v_existing_refund.status in ('succeeded', 'failed', 'cancelled') then
      v_refund_status := v_existing_refund.status;
    elsif v_refund_status = 'succeeded' then
      v_should_apply_amount := true;
    end if;

    update public.taxi_payment_refunds
    set status = v_refund_status
    where id = v_existing_refund.id;
  else
    insert into public.taxi_payment_refunds (
      payment_id,
      provider_refund_id,
      amount,
      reason,
      status,
      requested_by
    ) values (
      p_payment_id,
      p_provider_refund_id,
      p_amount,
      p_reason,
      v_refund_status,
      p_requested_by
    );

    v_should_apply_amount := v_refund_status = 'succeeded';
  end if;

  if v_should_apply_amount then
    v_next_refunded := coalesce(v_payment.amount_refunded, 0) + p_amount;

    if v_next_refunded > v_payment.amount_captured then
      raise exception 'REFUND_EXCEEDS_CAPTURE';
    end if;

    update public.taxi_payments
    set amount_refunded = v_next_refunded,
        status = case
          when v_next_refunded = amount_captured then 'refunded'
          else 'partially_refunded'
        end,
        updated_at = now()
    where id = p_payment_id
    returning * into v_payment;
  end if;

  return v_payment;
end;
$$;

revoke all on function public.taximun_record_payment_refund_atomic(
  uuid, text, integer, text, text, text
) from public, anon, authenticated;

grant execute on function public.taximun_record_payment_refund_atomic(
  uuid, text, integer, text, text, text
) to service_role;


create or replace function public.taximun_settle_trip_atomic(
  p_ride_id uuid,
  p_driver_id text,
  p_settled_by text,
  p_driver_name text,
  p_final_fare numeric,
  p_payment_method text,
  p_payment_status text,
  p_notes text default null
)
returns public.taxi_rides
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ride public.taxi_rides%rowtype;
  v_payment public.taxi_payments%rowtype;
  v_expected_cents integer;
  v_net_paid_cents integer;
begin
  if p_final_fare < 0 or p_final_fare > 9999 then
    raise exception 'INVALID_FINAL_FARE';
  end if;

  if p_payment_method not in ('cash', 'card', 'bizum') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_payment_status not in ('paid', 'waived') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select * into v_ride
  from public.taxi_rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'RIDE_NOT_FOUND';
  end if;

  if v_ride.driver_id is distinct from p_driver_id then
    raise exception 'DRIVER_MISMATCH';
  end if;

  if v_ride.status <> 'in_progress' then
    raise exception 'RIDE_NOT_IN_PROGRESS';
  end if;

  if p_payment_method = 'card' then
    if p_payment_status <> 'paid' then
      raise exception 'CARD_PAYMENT_MUST_BE_PAID';
    end if;

    select * into v_payment
    from public.taxi_payments
    where ride_id = p_ride_id
    for update;

    if not found then
      raise exception 'CARD_PAYMENT_LEDGER_MISSING';
    end if;

    v_expected_cents := round(p_final_fare * 100)::integer;
    v_net_paid_cents := coalesce(v_payment.amount_captured, 0) - coalesce(v_payment.amount_refunded, 0);

    if v_net_paid_cents < 0 then
      raise exception 'CARD_PAYMENT_LEDGER_INVALID';
    end if;

    if v_expected_cents = 0 then
      if v_payment.status not in ('captured', 'cancelled', 'failed', 'partially_refunded', 'refunded') then
        raise exception 'CARD_ZERO_BALANCE_NOT_READY';
      end if;
    else
      if v_payment.status not in ('captured', 'partially_refunded') then
        raise exception 'CARD_PAYMENT_NOT_CAPTURED';
      end if;
    end if;

    if v_net_paid_cents <> v_expected_cents then
      raise exception 'CARD_NET_AMOUNT_MISMATCH';
    end if;
  end if;

  update public.taxi_rides
  set final_fare = p_final_fare,
      payment_method = p_payment_method,
      payment_status = p_payment_status,
      settlement_notes = nullif(trim(p_notes), ''),
      settled_at = now(),
      settled_by = p_settled_by,
      completed_at = now(),
      status = 'completed'
  where id = p_ride_id
  returning * into v_ride;

  insert into public.driver_live_status (
    driver_id,
    driver_name,
    status,
    total_earnings,
    total_rides
  ) values (
    p_driver_id,
    coalesce(nullif(trim(p_driver_name), ''), 'Conductor'),
    'available',
    p_final_fare,
    1
  )
  on conflict (driver_id) do update
  set driver_name = coalesce(nullif(excluded.driver_name, ''), public.driver_live_status.driver_name),
      status = 'available',
      total_earnings = coalesce(public.driver_live_status.total_earnings, 0) + excluded.total_earnings,
      total_rides = coalesce(public.driver_live_status.total_rides, 0) + 1;

  return v_ride;
end;
$$;

revoke all on function public.taximun_settle_trip_atomic(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;

grant execute on function public.taximun_settle_trip_atomic(
  uuid, text, text, text, numeric, text, text, text
) to service_role;
