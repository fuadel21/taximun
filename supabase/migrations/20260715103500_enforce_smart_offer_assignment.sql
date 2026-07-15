-- Prevent any legacy endpoint from assigning a ride without an accepted smart offer.

create or replace function public.taximun_require_accepted_offer_before_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'assigned' and old.status is distinct from 'assigned' then
    if new.driver_id is null or not exists (
      select 1
      from public.taxi_ride_offers o
      where o.ride_id = new.id
        and o.driver_id = new.driver_id
        and o.status = 'accepted'
    ) then
      raise exception 'SMART_OFFER_REQUIRED: ride must be accepted through an active offer';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_require_smart_offer on public.taxi_rides;
create trigger trg_taximun_require_smart_offer
before update of status on public.taxi_rides
for each row
execute function public.taximun_require_accepted_offer_before_assignment();
