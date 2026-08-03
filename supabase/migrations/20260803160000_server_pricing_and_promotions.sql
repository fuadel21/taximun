-- PR #140 · Server-authoritative pricing, promotions and quote traceability

create table if not exists public.taxi_promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  max_discount numeric(10,2),
  minimum_subtotal numeric(10,2) not null default 0 check (minimum_subtotal >= 0),
  eligible_categories text[] not null default array['standard','comfort','van','accessible']::text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_total_uses integer,
  max_uses_per_user integer not null default 1 check (max_uses_per_user > 0),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxi_promotions_code_uppercase check (code = upper(code)),
  constraint taxi_promotions_percent_valid check (discount_type <> 'percent' or discount_value <= 100),
  constraint taxi_promotions_dates_valid check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.taxi_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.taxi_promotions(id) on delete restrict,
  passenger_id text not null,
  ride_id uuid references public.taxi_rides(id) on delete cascade,
  scheduled_booking_id uuid references public.taxi_scheduled_bookings(id) on delete cascade,
  subtotal numeric(10,2) not null,
  discount_amount numeric(10,2) not null,
  created_at timestamptz not null default now(),
  constraint taxi_promotion_redemption_target check (
    (ride_id is not null and scheduled_booking_id is null)
    or (ride_id is null and scheduled_booking_id is not null)
  )
);

create unique index if not exists taxi_promotion_redemptions_ride_unique_idx
  on public.taxi_promotion_redemptions(ride_id)
  where ride_id is not null;

create unique index if not exists taxi_promotion_redemptions_booking_unique_idx
  on public.taxi_promotion_redemptions(scheduled_booking_id)
  where scheduled_booking_id is not null;

create index if not exists taxi_promotion_redemptions_usage_idx
  on public.taxi_promotion_redemptions(promotion_id, passenger_id, created_at desc);

create index if not exists taxi_promotions_active_window_idx
  on public.taxi_promotions(active, starts_at, ends_at);

alter table public.taxi_scheduled_bookings
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(10,2) not null default 0,
  add column if not exists fare_subtotal numeric(10,2),
  add column if not exists quote_version text,
  add column if not exists quoted_at timestamptz;

alter table public.taxi_rides
  add column if not exists fare_subtotal numeric(10,2),
  add column if not exists quote_version text,
  add column if not exists quoted_at timestamptz;

create or replace function public.taximun_touch_promotion()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.code := upper(trim(new.code));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists taximun_touch_promotion on public.taxi_promotions;
create trigger taximun_touch_promotion
before insert or update on public.taxi_promotions
for each row execute function public.taximun_touch_promotion();

alter table public.taxi_promotions enable row level security;
alter table public.taxi_promotion_redemptions enable row level security;
revoke all on table public.taxi_promotions from anon, authenticated;
revoke all on table public.taxi_promotion_redemptions from anon, authenticated;
grant all on table public.taxi_promotions to service_role;
grant all on table public.taxi_promotion_redemptions to service_role;
