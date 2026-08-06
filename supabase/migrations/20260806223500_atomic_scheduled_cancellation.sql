-- PR #143 · Atomic scheduled cancellation and promotion release

create or replace function public.taximun_cancel_scheduled_booking(
  p_booking_id uuid,
  p_passenger_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_booking_id uuid;
begin
  select id into v_booking_id
  from public.taxi_scheduled_bookings
  where id = p_booking_id
    and passenger_id = p_passenger_id
    and status = 'scheduled'
  for update;

  if not found then
    raise exception 'BOOKING_NOT_CANCELLABLE';
  end if;

  update public.taxi_scheduled_bookings
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = v_booking_id;

  delete from public.taxi_promotion_redemptions
  where scheduled_booking_id = v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.taximun_cancel_scheduled_booking(uuid, text)
  from public, anon, authenticated;

grant execute on function public.taximun_cancel_scheduled_booking(uuid, text)
  to service_role;
