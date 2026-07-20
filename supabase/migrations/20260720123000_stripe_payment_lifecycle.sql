-- PR #68 · Stripe payment lifecycle and accounting ledger

create table if not exists public.taxi_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.taxi_rides(id) on delete cascade,
  passenger_id text not null,
  driver_id text,
  provider text not null default 'stripe',
  provider_payment_intent_id text unique,
  provider_charge_id text,
  status text not null default 'pending',
  currency text not null default 'eur',
  amount_authorized integer not null default 0,
  amount_captured integer not null default 0,
  amount_refunded integer not null default 0,
  platform_fee integer not null default 0,
  driver_net integer not null default 0,
  client_secret text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_payments_status_check check (status in ('pending','authorized','captured','partially_refunded','refunded','cancelled','failed')),
  constraint taxi_payments_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint taxi_payments_amounts_check check (
    amount_authorized >= 0 and amount_captured >= 0 and amount_refunded >= 0 and
    platform_fee >= 0 and driver_net >= 0 and amount_refunded <= amount_captured
  )
);

create index if not exists taxi_payments_passenger_idx on public.taxi_payments(passenger_id, created_at desc);
create index if not exists taxi_payments_driver_idx on public.taxi_payments(driver_id, created_at desc);
create index if not exists taxi_payments_status_idx on public.taxi_payments(status, created_at desc);

create table if not exists public.taxi_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.taxi_payments(id) on delete cascade,
  provider_refund_id text not null unique,
  amount integer not null check (amount > 0),
  reason text not null,
  status text not null default 'pending',
  requested_by text not null,
  created_at timestamptz not null default now(),
  constraint taxi_payment_refunds_reason_check check (reason in ('duplicate','fraudulent','requested_by_customer')),
  constraint taxi_payment_refunds_status_check check (status in ('pending','succeeded','failed','cancelled'))
);

create index if not exists taxi_payment_refunds_payment_idx on public.taxi_payment_refunds(payment_id, created_at desc);

alter table public.taxi_payments enable row level security;
alter table public.taxi_payments force row level security;
alter table public.taxi_payment_refunds enable row level security;
alter table public.taxi_payment_refunds force row level security;

revoke all on public.taxi_payments from anon, authenticated;
revoke all on public.taxi_payment_refunds from anon, authenticated;
grant all on public.taxi_payments to service_role;
grant all on public.taxi_payment_refunds to service_role;

create or replace function public.taximun_touch_payment()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_payments_touch on public.taxi_payments;
create trigger taxi_payments_touch
before update on public.taxi_payments
for each row execute function public.taximun_touch_payment();
