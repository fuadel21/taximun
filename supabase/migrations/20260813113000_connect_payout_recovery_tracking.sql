-- PR #156 · Automatic Stripe Connect payouts and real recovery tracking

alter table public.taxi_driver_transfers
  add column if not exists amount_reversed integer not null default 0,
  add column if not exists last_reversal_id text,
  add column if not exists refund_reversal_pending boolean not null default false,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_requested_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxi_driver_transfers_amount_reversed_check'
      and conrelid = 'public.taxi_driver_transfers'::regclass
  ) then
    alter table public.taxi_driver_transfers
      add constraint taxi_driver_transfers_amount_reversed_check
      check (amount_reversed >= 0 and amount_reversed <= amount);
  end if;
end;
$$;

create index if not exists taxi_driver_transfers_recovery_pending_idx
  on public.taxi_driver_transfers(refund_reversal_pending, updated_at desc)
  where refund_reversal_pending = true;
