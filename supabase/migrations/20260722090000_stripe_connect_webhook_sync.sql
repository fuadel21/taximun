-- PR #71 · Stripe Connect webhook synchronization

alter table public.taxi_driver_connect_accounts
  add column if not exists last_stripe_event_id text,
  add column if not exists last_synced_at timestamptz;

alter table public.taxi_driver_transfers
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists reversal_id text,
  add column if not exists last_stripe_event_id text,
  add column if not exists last_synced_at timestamptz;

create index if not exists taxi_driver_connect_accounts_stripe_event_idx
  on public.taxi_driver_connect_accounts(last_stripe_event_id)
  where last_stripe_event_id is not null;

create index if not exists taxi_driver_transfers_stripe_event_idx
  on public.taxi_driver_transfers(last_stripe_event_id)
  where last_stripe_event_id is not null;
