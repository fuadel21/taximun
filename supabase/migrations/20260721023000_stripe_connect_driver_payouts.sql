-- PR #70 · Stripe Connect driver onboarding and payouts

create table if not exists public.taxi_driver_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null unique,
  stripe_account_id text not null unique,
  country text not null default 'ES',
  status text not null default 'onboarding',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_driver_connect_accounts_status_check
    check (status in ('onboarding','enabled','restricted','disabled')),
  constraint taxi_driver_connect_accounts_country_check
    check (country ~ '^[A-Z]{2}$')
);

create index if not exists taxi_driver_connect_accounts_status_idx
  on public.taxi_driver_connect_accounts(status, updated_at desc);

create table if not exists public.taxi_driver_transfers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.taxi_payments(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text not null,
  stripe_account_id text not null,
  stripe_transfer_id text not null unique,
  amount integer not null check (amount > 0),
  currency text not null default 'eur',
  status text not null default 'pending',
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_driver_transfers_status_check
    check (status in ('pending','paid','failed','reversed')),
  constraint taxi_driver_transfers_currency_check
    check (currency ~ '^[a-z]{3}$')
);

create index if not exists taxi_driver_transfers_driver_idx
  on public.taxi_driver_transfers(driver_id, created_at desc);
create index if not exists taxi_driver_transfers_status_idx
  on public.taxi_driver_transfers(status, created_at desc);

alter table public.taxi_driver_connect_accounts enable row level security;
alter table public.taxi_driver_connect_accounts force row level security;
alter table public.taxi_driver_transfers enable row level security;
alter table public.taxi_driver_transfers force row level security;

revoke all on public.taxi_driver_connect_accounts from anon, authenticated;
revoke all on public.taxi_driver_transfers from anon, authenticated;
grant all on public.taxi_driver_connect_accounts to service_role;
grant all on public.taxi_driver_transfers to service_role;

create or replace function public.taximun_touch_connect_account()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.taximun_touch_driver_transfer()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_driver_connect_accounts_touch on public.taxi_driver_connect_accounts;
create trigger taxi_driver_connect_accounts_touch
before update on public.taxi_driver_connect_accounts
for each row execute function public.taximun_touch_connect_account();

drop trigger if exists taxi_driver_transfers_touch on public.taxi_driver_transfers;
create trigger taxi_driver_transfers_touch
before update on public.taxi_driver_transfers
for each row execute function public.taximun_touch_driver_transfer();
