create extension if not exists pgcrypto;

create table if not exists public.taxi_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  reporter_role text not null check (reporter_role in ('passenger', 'driver', 'admin')),
  ride_id uuid references public.taxi_rides(id) on delete set null,
  category text not null default 'safety' check (category in ('sos', 'safety', 'lost_item', 'route_issue', 'payment_issue', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  title text not null,
  description text,
  lat double precision,
  lng double precision,
  contact_phone text,
  assigned_admin_id text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_taxi_safety_reports_reporter on public.taxi_safety_reports(reporter_id, created_at desc);
create index if not exists idx_taxi_safety_reports_status on public.taxi_safety_reports(status, created_at desc);
create index if not exists idx_taxi_safety_reports_priority on public.taxi_safety_reports(priority, created_at desc);
create index if not exists idx_taxi_safety_reports_ride on public.taxi_safety_reports(ride_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_taxi_safety_reports_updated_at on public.taxi_safety_reports;
create trigger set_taxi_safety_reports_updated_at
before update on public.taxi_safety_reports
for each row execute function public.set_updated_at();

alter table public.taxi_safety_reports enable row level security;

-- Safety reports are managed through server-side tRPC with Supabase service role.
