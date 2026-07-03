create extension if not exists pgcrypto;

create table if not exists public.admin_drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  taxi_code text not null,
  zone text not null default 'Centro',
  status text not null default 'available' check (status in ('available', 'busy', 'pause', 'offline')),
  rating numeric(3, 2) not null default 5.00,
  rides_today integer not null default 0,
  wait_label text not null default 'Nuevo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_taxis (
  id uuid primary key default gen_random_uuid(),
  taxi_code text not null unique,
  plate text not null,
  driver_name text not null default 'Sin asignar',
  model text not null default 'Vehículo pendiente',
  status text not null default 'available' check (status in ('available', 'busy', 'maintenance', 'offline')),
  inspection_date date not null default (current_date + interval '1 year'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null,
  body text not null,
  level text not null default 'medium' check (level in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_drivers_status on public.admin_drivers(status);
create index if not exists idx_admin_drivers_zone on public.admin_drivers(zone);
create index if not exists idx_admin_taxis_status on public.admin_taxis(status);
create index if not exists idx_admin_incidents_status on public.admin_incidents(status);
create index if not exists idx_admin_activity_logs_created_at on public.admin_activity_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_admin_drivers_updated_at on public.admin_drivers;
create trigger set_admin_drivers_updated_at
before update on public.admin_drivers
for each row execute function public.set_updated_at();

drop trigger if exists set_admin_taxis_updated_at on public.admin_taxis;
create trigger set_admin_taxis_updated_at
before update on public.admin_taxis
for each row execute function public.set_updated_at();

alter table public.admin_drivers enable row level security;
alter table public.admin_taxis enable row level security;
alter table public.admin_incidents enable row level security;
alter table public.admin_activity_logs enable row level security;

-- Access is intentionally handled from the backend with the Supabase service role.
-- No browser/client policies are opened here.
