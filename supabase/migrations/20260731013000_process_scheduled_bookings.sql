-- PR #130 · Scheduled booking reminders and idempotent dispatch

alter table public.taxi_scheduled_bookings
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists last_processing_attempt_at timestamptz,
  add column if not exists last_processing_error text;

create unique index if not exists taxi_rides_scheduled_booking_unique_idx
  on public.taxi_rides(scheduled_booking_id)
  where scheduled_booking_id is not null;

create index if not exists taxi_scheduled_bookings_reminder_24h_due_idx
  on public.taxi_scheduled_bookings(reminder_24h_at)
  where status = 'scheduled' and reminder_24h_sent_at is null and reminder_24h_at is not null;

create index if not exists taxi_scheduled_bookings_reminder_2h_due_idx
  on public.taxi_scheduled_bookings(reminder_2h_at)
  where status = 'scheduled' and reminder_2h_sent_at is null and reminder_2h_at is not null;

create index if not exists taxi_scheduled_bookings_reminder_30m_due_idx
  on public.taxi_scheduled_bookings(reminder_30m_at)
  where status = 'scheduled' and reminder_30m_sent_at is null and reminder_30m_at is not null;

create or replace function public.taximun_process_scheduled_bookings(
  p_now timestamptz default now()
)
returns table (
  reminders_24h integer,
  reminders_2h integer,
  reminders_30m integer,
  rides_dispatched integer,
  rides_deferred integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_booking public.taxi_scheduled_bookings%rowtype;
  v_ride_id uuid;
  v_active_ride boolean;
  v_24h integer := 0;
  v_2h integer := 0;
  v_30m integer := 0;
  v_dispatched integer := 0;
  v_deferred integer := 0;
begin
  -- 24-hour reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_24h_at is not null
      and b.reminder_24h_at <= p_now
      and b.reminder_24h_sent_at is null
    order by b.reminder_24h_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'info',
      'Tu reserva es mañana',
      'Recuerda tu viaje de ' || v_booking.pickup_address || ' a ' || v_booking.dropoff_address || '.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '24h'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_24h_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_24h := v_24h + 1;
  end loop;

  -- 2-hour reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_2h_at is not null
      and b.reminder_2h_at <= p_now
      and b.reminder_2h_sent_at is null
    order by b.reminder_2h_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'info',
      'Tu reserva sale en 2 horas',
      'Comprueba el origen, el destino y las necesidades especiales antes del despacho.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '2h'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_2h_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_2h := v_2h + 1;
  end loop;

  -- 30-minute reminders.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.reminder_30m_at is not null
      and b.reminder_30m_at <= p_now
      and b.reminder_30m_sent_at is null
    order by b.reminder_30m_at
    for update skip locked
  loop
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'warning',
      'Tu taxi se buscará en breve',
      'En aproximadamente 15 minutos comenzaremos a buscar un conductor verificado.',
      '/passenger/book',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'scheduled_at', v_booking.scheduled_at,
        'reminder', '30m'
      )
    );

    update public.taxi_scheduled_bookings
    set reminder_30m_sent_at = p_now,
        last_processing_attempt_at = p_now,
        last_processing_error = null
    where id = v_booking.id;

    v_30m := v_30m + 1;
  end loop;

  -- Convert reservations into normal pending rides 15 minutes before pickup.
  for v_booking in
    select b.*
    from public.taxi_scheduled_bookings b
    where b.status = 'scheduled'
      and b.scheduled_at <= p_now + interval '15 minutes'
    order by b.scheduled_at
    for update skip locked
  loop
    update public.taxi_scheduled_bookings
    set dispatch_attempts = dispatch_attempts + 1,
        last_processing_attempt_at = p_now
    where id = v_booking.id;

    if v_booking.dispatched_ride_id is not null then
      update public.taxi_scheduled_bookings
      set status = 'dispatched',
          last_processing_error = null
      where id = v_booking.id;
      continue;
    end if;

    select exists (
      select 1
      from public.taxi_rides r
      where r.passenger_id = v_booking.passenger_id
        and r.status in ('pending', 'assigned', 'in_progress')
    ) into v_active_ride;

    if v_active_ride then
      update public.taxi_scheduled_bookings
      set last_processing_error = 'PASSENGER_HAS_ACTIVE_RIDE'
      where id = v_booking.id;
      v_deferred := v_deferred + 1;
      continue;
    end if;

    begin
      insert into public.taxi_rides (
        passenger_id,
        passenger_name,
        pickup_address,
        dropoff_address,
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        estimated_fare,
        estimated_duration,
        distance_km,
        payment_method,
        service_type,
        service_category,
        fare_range_min,
        fare_range_max,
        fare_breakdown,
        intermediate_stops,
        passenger_requirements,
        scheduled_booking_id,
        status
      ) values (
        v_booking.passenger_id,
        coalesce(v_booking.passenger_name, 'Pasajero'),
        v_booking.pickup_address,
        v_booking.dropoff_address,
        v_booking.pickup_lat,
        v_booking.pickup_lng,
        v_booking.dropoff_lat,
        v_booking.dropoff_lng,
        v_booking.estimated_fare,
        v_booking.estimated_duration,
        v_booking.distance_km,
        v_booking.payment_method,
        case
          when v_booking.service_category = 'comfort' then 'eco'
          when v_booking.service_category in ('van', 'accessible') then 'van'
          else 'taxi'
        end,
        v_booking.service_category,
        v_booking.fare_range_min,
        v_booking.fare_range_max,
        v_booking.fare_breakdown,
        v_booking.intermediate_stops,
        v_booking.passenger_requirements,
        v_booking.id,
        'pending'
      )
      returning id into v_ride_id;
    exception
      when unique_violation then
        select r.id
        into v_ride_id
        from public.taxi_rides r
        where r.scheduled_booking_id = v_booking.id
        limit 1;
    end;

    if v_ride_id is null then
      update public.taxi_scheduled_bookings
      set last_processing_error = 'RIDE_CREATION_FAILED'
      where id = v_booking.id;
      v_deferred := v_deferred + 1;
      continue;
    end if;

    update public.taxi_scheduled_bookings
    set status = 'dispatched',
        dispatched_ride_id = v_ride_id,
        last_processing_error = null
    where id = v_booking.id;

    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      v_booking.passenger_id,
      'passenger',
      'system',
      'success',
      'Estamos buscando tu taxi reservado',
      'Tu reserva ya ha entrado en el despacho. Puedes seguirla desde Mis viajes.',
      '/passenger/rides',
      jsonb_build_object(
        'scheduled_booking_id', v_booking.id,
        'ride_id', v_ride_id,
        'scheduled_at', v_booking.scheduled_at
      )
    );

    insert into public.taxi_activity_logs (
      actor_id,
      actor_role,
      message,
      ride_id
    ) values (
      v_booking.passenger_id,
      'system',
      'Reserva programada activada automáticamente',
      v_ride_id
    );

    v_dispatched := v_dispatched + 1;
  end loop;

  return query
  select v_24h, v_2h, v_30m, v_dispatched, v_deferred;
end;
$$;

revoke all on function public.taximun_process_scheduled_bookings(timestamptz) from public, anon, authenticated;
grant execute on function public.taximun_process_scheduled_bookings(timestamptz) to service_role;

-- Supabase supports pg_cron. Keep one deterministic five-minute job.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'taximun-process-scheduled-bookings'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'taximun-process-scheduled-bookings',
    '*/5 * * * *',
    $cron$select public.taximun_process_scheduled_bookings();$cron$
  );
end;
$$;