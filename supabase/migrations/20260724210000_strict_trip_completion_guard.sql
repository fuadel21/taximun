-- Enforce professional settlement before any ride can become completed.
-- This protects Supabase even if an obsolete API client attempts a direct update.

create or replace function public.taximun_enforce_trip_state_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_expected_cents integer;
  v_card_capture_exists boolean;
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

  if new.status = 'completed' then
    if old.status <> 'in_progress' then
      raise exception 'RIDE_MUST_BE_IN_PROGRESS_BEFORE_COMPLETION';
    end if;

    if new.final_fare is null or new.final_fare < 0 or new.final_fare > 9999 then
      raise exception 'RIDE_COMPLETION_REQUIRES_FINAL_FARE';
    end if;

    if new.payment_method not in ('cash', 'card', 'bizum') then
      raise exception 'RIDE_COMPLETION_REQUIRES_PAYMENT_METHOD';
    end if;

    if new.payment_status not in ('paid', 'waived') then
      raise exception 'RIDE_COMPLETION_REQUIRES_SETTLED_PAYMENT';
    end if;

    if new.settled_at is null or nullif(trim(coalesce(new.settled_by, '')), '') is null then
      raise exception 'RIDE_COMPLETION_REQUIRES_SETTLEMENT_AUDIT';
    end if;

    if new.completed_at is null then
      raise exception 'RIDE_COMPLETION_REQUIRES_COMPLETED_AT';
    end if;

    if new.payment_method = 'card' then
      if new.payment_status <> 'paid' then
        raise exception 'CARD_PAYMENT_MUST_BE_PAID';
      end if;

      v_expected_cents := round(new.final_fare * 100)::integer;

      select exists (
        select 1
        from public.taxi_payments p
        where p.ride_id = new.id
          and p.status = 'captured'
          and p.amount_captured = v_expected_cents
      ) into v_card_capture_exists;

      if not v_card_capture_exists then
        raise exception 'CARD_PAYMENT_CAPTURE_REQUIRED_FOR_COMPLETION';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.taximun_enforce_trip_state_transition() is
  'Enforces valid ride transitions, pickup PIN verification and atomic professional settlement before completion.';
