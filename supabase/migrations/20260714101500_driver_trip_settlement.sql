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

create or replace function public.taximun_require_settlement_before_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.final_fare is null or new.final_fare < 0 then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: final fare missing';
    end if;
    if new.payment_status not in ('paid', 'waived') then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: payment not confirmed';
    end if;
    if new.settled_at is null or new.settled_by is null then
      raise exception 'RIDE_SETTLEMENT_REQUIRED: settlement metadata missing';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taximun_require_settlement on public.taxi_rides;
create trigger trg_taximun_require_settlement
before update of status on public.taxi_rides
for each row
execute function public.taximun_require_settlement_before_completion();
