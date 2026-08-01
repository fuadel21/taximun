-- PR #136 · Real ride tips and aftercare traceability

create table if not exists public.taxi_ride_tips (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  passenger_id text not null,
  driver_id text not null,
  amount_cents integer not null check (amount_cents between 50 and 50000),
  currency text not null default 'eur' check (currency = 'eur'),
  method text not null check (method in ('card', 'cash', 'bizum')),
  status text not null check (status in ('checkout_pending', 'pending_confirmation', 'paid', 'cancelled', 'failed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  declared_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ride_id)
);

create index if not exists taxi_ride_tips_driver_pending_idx
  on public.taxi_ride_tips(driver_id, created_at desc)
  where status = 'pending_confirmation';

create index if not exists taxi_ride_tips_passenger_idx
  on public.taxi_ride_tips(passenger_id, created_at desc);

alter table public.taxi_ride_tips enable row level security;
revoke all on table public.taxi_ride_tips from anon, authenticated;
grant all on table public.taxi_ride_tips to service_role;

create or replace function public.taximun_touch_ride_tip()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists taximun_touch_ride_tip on public.taxi_ride_tips;
create trigger taximun_touch_ride_tip
before update on public.taxi_ride_tips
for each row execute function public.taximun_touch_ride_tip();
