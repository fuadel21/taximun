-- PR #131 · Serialize active rides and reset reminders after rescheduling

create or replace function public.taximun_prevent_multiple_active_rides()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.passenger_id is null
     or new.status not in ('pending', 'assigned', 'in_progress') then
    return new;
  end if;

  -- Serialize every active-ride creation or transition for the same passenger,
  -- including immediate requests and scheduled-booking dispatches.
  perform pg_advisory_xact_lock(
    hashtextextended('taximun-active-ride:' || new.passenger_id, 0)
  );

  if exists (
    select 1
    from public.taxi_rides r
    where r.passenger_id = new.passenger_id
      and r.status in ('pending', 'assigned', 'in_progress')
      and (tg_op = 'INSERT' or r.id is distinct from new.id)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PASSENGER_ALREADY_HAS_ACTIVE_RIDE',
      hint = 'Finaliza o cancela el viaje activo antes de crear otro.';
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_prevent_multiple_active_rides
on public.taxi_rides;

create trigger taximun_prevent_multiple_active_rides
before insert or update of passenger_id, status
on public.taxi_rides
for each row
execute function public.taximun_prevent_multiple_active_rides();


create or replace function public.taximun_set_booking_reminders()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_reminder_24h_at timestamptz;
  v_reminder_2h_at timestamptz;
  v_reminder_30m_at timestamptz;
begin
  new.updated_at := now();

  v_reminder_24h_at := case
    when new.scheduled_at > now() + interval '24 hours'
      then new.scheduled_at - interval '24 hours'
    else null
  end;

  v_reminder_2h_at := case
    when new.scheduled_at > now() + interval '2 hours'
      then new.scheduled_at - interval '2 hours'
    else null
  end;

  v_reminder_30m_at := case
    when new.scheduled_at > now() + interval '30 minutes'
      then new.scheduled_at - interval '30 minutes'
    else null
  end;

  if tg_op = 'INSERT' then
    new.reminder_24h_sent_at := null;
    new.reminder_2h_sent_at := null;
    new.reminder_30m_sent_at := null;
  elsif new.scheduled_at is distinct from old.scheduled_at then
    if v_reminder_24h_at is distinct from old.reminder_24h_at then
      new.reminder_24h_sent_at := null;
    end if;

    if v_reminder_2h_at is distinct from old.reminder_2h_at then
      new.reminder_2h_sent_at := null;
    end if;

    if v_reminder_30m_at is distinct from old.reminder_30m_at then
      new.reminder_30m_sent_at := null;
    end if;
  end if;

  new.reminder_24h_at := v_reminder_24h_at;
  new.reminder_2h_at := v_reminder_2h_at;
  new.reminder_30m_at := v_reminder_30m_at;

  return new;
end;
$$;

drop trigger if exists taximun_scheduled_booking_reminders
on public.taxi_scheduled_bookings;

create trigger taximun_scheduled_booking_reminders
before insert or update of scheduled_at
on public.taxi_scheduled_bookings
for each row
execute function public.taximun_set_booking_reminders();
