-- Professional trip settlement recorded by the assigned driver before completion.

alter table public.taxi_rides
  add column if not exists final_fare numeric(10,2),
  add column if not exists payment_status text not null default 'pending',
  add column if not exists settlement_notes text,
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'taxi_rides_payment_status_check'
      and conrelid = 'public.taxi_rides'::regclass
  ) then
    alter table public.taxi_rides
      add constraint taxi_rides_payment_status_check
      check (payment_status in ('pending', 'paid', 'failed', 'waived'));
  end if;
end $$;

create index if not exists taxi_rides_driver_settlement_idx
  on public.taxi_rides(driver_id, payment_status, completed_at desc);
