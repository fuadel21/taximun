-- Release an assigned driver when a ride is cancelled before it starts.

create or replace function public.taximun_release_driver_after_ride_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled'
     and old.status = 'assigned'
     and old.driver_id is not null then

    update public.driver_live_status as driver_status
    set status = 'available'
    where driver_status.driver_id = old.driver_id
      and not exists (
        select 1
        from public.taxi_rides as other_ride
        where other_ride.driver_id = old.driver_id
          and other_ride.id <> new.id
          and other_ride.status in ('assigned', 'in_progress')
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_taximun_release_driver_after_cancellation
on public.taxi_rides;

create trigger trg_taximun_release_driver_after_cancellation
after update of status on public.taxi_rides
for each row
when (new.status = 'cancelled' and old.status is distinct from new.status)
execute function public.taximun_release_driver_after_ride_cancellation();

revoke all on function public.taximun_release_driver_after_ride_cancellation() from public;
grant execute on function public.taximun_release_driver_after_ride_cancellation() to service_role;
