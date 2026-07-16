-- Advanced live-trip phases and secure share token.

alter table public.taxi_rides
  add column if not exists driver_arrived_at timestamptz,
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists share_enabled boolean not null default true;

create unique index if not exists taxi_rides_share_token_uidx
  on public.taxi_rides(share_token);

create index if not exists taxi_rides_arrival_tracking_idx
  on public.taxi_rides(driver_id, driver_arrived_at, status)
  where status in ('assigned', 'in_progress');
