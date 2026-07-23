-- Keep dispatch offers and driver notifications consistent when a ride is cancelled.

create or replace function public.taximun_cleanup_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.taxi_ride_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expiredBy', 'ride_cancellation',
        'cancelledAt', coalesce(new.cancelled_at, now())
      )
  where ride_id = new.id
    and status = 'pending';

  if old.driver_id is not null then
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
      new.passenger_id,
      'passenger',
      'warning',
      'Viaje cancelado',
      'El pasajero ha cancelado el servicio antes de que comenzara.',
      '/driver',
      jsonb_build_object(
        'rideId', new.id,
        'event', 'ride_cancelled',
        'previousStatus', old.status,
        'cancelledAt', coalesce(new.cancelled_at, now())
      )
    );
  end if;

  insert into public.taxi_activity_logs (
    actor_id,
    actor_role,
    message,
    ride_id
  ) values (
    coalesce(new.passenger_id, 'system'),
    case when new.passenger_id is null then 'system' else 'passenger' end,
    format(
      'Cancelación reconciliada: %s ofertas pendientes expiradas%s',
      (select count(*) from public.taxi_ride_offers where ride_id = new.id and status = 'expired' and metadata ->> 'expiredBy' = 'ride_cancellation'),
      case when old.driver_id is not null then ' y conductor notificado' else '' end
    ),
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_taximun_cleanup_after_ride_cancellation
on public.taxi_rides;

create trigger trg_taximun_cleanup_after_ride_cancellation
after update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_cleanup_after_ride_cancellation();

revoke all on function public.taximun_cleanup_after_ride_cancellation() from public;
grant execute on function public.taximun_cleanup_after_ride_cancellation() to service_role;
