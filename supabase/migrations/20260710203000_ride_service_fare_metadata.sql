-- Store passenger-selected service and fare-estimation metadata on taxi rides.
-- This keeps the request auditable for passenger, driver and admin views.

alter table public.taxi_rides
  add column if not exists service_type text not null default 'taxi',
  add column if not exists fare_range_min numeric(10,2),
  add column if not exists fare_range_max numeric(10,2),
  add column if not exists fare_breakdown jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxi_rides_service_type_check'
      and conrelid = 'public.taxi_rides'::regclass
  ) then
    alter table public.taxi_rides
      add constraint taxi_rides_service_type_check
      check (service_type in ('taxi', 'eco', 'van'));
  end if;
end $$;

create index if not exists taxi_rides_service_type_idx
on public.taxi_rides(service_type, requested_at desc);
