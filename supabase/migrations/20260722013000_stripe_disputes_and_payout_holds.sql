-- PR #72 · Stripe disputes, chargebacks and payout protection

create table if not exists public.taxi_payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.taxi_payments(id) on delete cascade,
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  driver_id text,
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  amount integer not null check (amount > 0),
  currency text not null default 'eur',
  reason text,
  status text not null default 'warning_needs_response',
  evidence_due_at timestamptz,
  is_charge_refundable boolean,
  balance_transaction_id text,
  payout_action text not null default 'hold',
  last_stripe_event_id text,
  payload jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_payment_disputes_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint taxi_payment_disputes_payout_action_check check (payout_action in ('none','hold','reverse','released'))
);

create index if not exists taxi_payment_disputes_payment_idx
  on public.taxi_payment_disputes(payment_id, created_at desc);
create index if not exists taxi_payment_disputes_status_idx
  on public.taxi_payment_disputes(status, created_at desc);
create index if not exists taxi_payment_disputes_driver_idx
  on public.taxi_payment_disputes(driver_id, created_at desc);

alter table public.taxi_payment_disputes enable row level security;
alter table public.taxi_payment_disputes force row level security;
revoke all on public.taxi_payment_disputes from anon, authenticated;
grant all on public.taxi_payment_disputes to service_role;

alter table public.taxi_driver_transfers
  add column if not exists dispute_hold boolean not null default false,
  add column if not exists dispute_id uuid references public.taxi_payment_disputes(id) on delete set null,
  add column if not exists payout_blocked_reason text;

create index if not exists taxi_driver_transfers_dispute_hold_idx
  on public.taxi_driver_transfers(dispute_hold, created_at desc)
  where dispute_hold = true;

create or replace function public.taximun_touch_payment_dispute()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_payment_disputes_touch on public.taxi_payment_disputes;
create trigger taxi_payment_disputes_touch
before update on public.taxi_payment_disputes
for each row execute function public.taximun_touch_payment_dispute();
