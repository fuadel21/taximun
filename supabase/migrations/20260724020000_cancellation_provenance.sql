-- Structured cancellation provenance and actor-aware reconciliation.

alter table public.taxi_rides
  add column if not exists cancelled_by_id text,
  add column if not exists cancelled_by_role text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text;

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancelled_by_role_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancelled_by_role_check
  check (
    cancelled_by_role is null
    or cancelled_by_role in ('passenger', 'driver', 'admin', 'system')
  );

alter table public.taxi_rides
  drop constraint if exists taxi_rides_cancellation_reason_check;

alter table public.taxi_rides
  add constraint taxi_rides_cancellation_reason_check
  check (
    cancellation_reason is null
    or cancellation_reason in (
      'changed_mind',
      'wait_too_long',
      'wrong_pickup',
      'driver_delay',
      'duplicate_request',
      'operational',
      'other',
      'legacy_unspecified'
    )
  );

create or replace function public.taximun_fill_cancellation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    new.cancelled_at := coalesce(new.cancelled_at, now());

    -- The current public cancellation flow belongs to the passenger. Future
    -- driver/admin/system flows can provide explicit provenance in the update.
    new.cancelled_by_role := coalesce(new.cancelled_by_role, 'passenger');
    new.cancelled_by_id := coalesce(
      new.cancelled_by_id,
      case
        when new.cancelled_by_role = 'passenger' then new.passenger_id
        when new.cancelled_by_role = 'driver' then new.driver_id
        else 'system'
      end
    );
    new.cancellation_reason := coalesce(new.cancellation_reason, 'legacy_unspecified');
    new.cancellation_note := nullif(trim(coalesce(new.cancellation_note, '')), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_fill_cancellation_provenance
on public.taxi_rides;

create trigger trg_taximun_fill_cancellation_provenance
before update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_fill_cancellation_provenance();

update public.taxi_rides
set cancelled_by_role = coalesce(cancelled_by_role, 'passenger'),
    cancelled_by_id = coalesce(cancelled_by_id, passenger_id, 'system'),
    cancellation_reason = coalesce(cancellation_reason, 'legacy_unspecified')
where status = 'cancelled';

create or replace function public.taximun_cleanup_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_role text := coalesce(new.cancelled_by_role, 'system');
  v_actor_id text := coalesce(new.cancelled_by_id, 'system');
  v_notification_body text;
  v_expired_count integer := 0;
begin
  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expiredBy', 'ride_cancellation',
        'cancelledAt', coalesce(new.cancelled_at, now()),
        'cancelledByRole', v_actor_role,
        'cancellationReason', new.cancellation_reason
      )
  where ride_id = new.id
    and status = 'pending';

  get diagnostics v_expired_count = row_count;

  v_notification_body := case v_actor_role
    when 'passenger' then 'El pasajero ha cancelado el servicio antes de que comenzara.'
    when 'driver' then 'El servicio ha sido cancelado por el conductor.'
    when 'admin' then 'Administración ha cancelado este servicio.'
    else 'El servicio ha sido cancelado por el sistema.'
  end;

  if old.driver_id is not null and v_actor_role <> 'driver' then
    insert into public.taxi_notifications (
      recipient_id,
      recipient_role,
      actor_id,
      actor_role,
      type,
      title,
      body,
      action_url,
      metadata
    ) values (
      old.driver_id,
      'driver',
      v_actor_id,
      v_actor_role,
      'warning',
      'Viaje cancelado',
      v_notification_body,
      '/driver',
      jsonb_build_object(
        'rideId', new.id,
        'event', 'ride_cancelled',
        'previousStatus', old.status,
        'cancelledAt', coalesce(new.cancelled_at, now()),
        'cancelledByRole', v_actor_role,
        'cancellationReason', new.cancellation_reason,
        'cancellationNote', new.cancellation_note
      )
    );
  end if;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    v_actor_id,
    v_actor_role,
    format(
      'Cancelación reconciliada por %s (%s): %s ofertas pendientes expiradas',
      v_actor_role,
      coalesce(new.cancellation_reason, 'sin_motivo'),
      v_expired_count
    ),
    new.id
  );

  return new;
end;
$$;

revoke all on function public.taximun_fill_cancellation_provenance() from public;
grant execute on function public.taximun_fill_cancellation_provenance() to service_role;

revoke all on function public.taximun_cleanup_after_ride_cancellation() from public;
grant execute on function public.taximun_cleanup_after_ride_cancellation() to service_role;
