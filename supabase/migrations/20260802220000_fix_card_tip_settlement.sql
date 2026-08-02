-- PR #137 · Reconcile and route card tips through Stripe Connect

alter table public.taxi_ride_tips
  add column if not exists stripe_destination_account_id text,
  add column if not exists payout_status text,
  add column if not exists last_stripe_event_id text,
  add column if not exists last_stripe_event_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'taxi_ride_tips_payout_status_check'
      and conrelid = 'public.taxi_ride_tips'::regclass
  ) then
    alter table public.taxi_ride_tips
      add constraint taxi_ride_tips_payout_status_check
      check (
        payout_status is null
        or payout_status in ('pending', 'destination_configured', 'paid', 'failed', 'cancelled')
      );
  end if;
end;
$$;

create unique index if not exists taxi_ride_tips_checkout_session_unique_idx
  on public.taxi_ride_tips(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists taxi_ride_tips_card_pending_idx
  on public.taxi_ride_tips(updated_at)
  where method = 'card' and status = 'checkout_pending';
