-- Fase 5b · Zonas geográficas que activan los suplementos de la tarifa AMB,
-- editables desde /admin/tariffs (editor visual sobre mapa).
create table if not exists public.taxi_tariff_zones (
  id text primary key,
  label text not null,
  supplement_code text not null check (supplement_code in ('airport', 'moll_adossat', 'fira', 'sants')),
  applies_to text not null default 'both' check (applies_to in ('origin', 'destination', 'both')),
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null check (radius_meters between 50 and 10000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.taxi_tariff_zones (id, label, supplement_code, applies_to, center_lat, center_lng, radius_meters) values
  ('airport-t1', 'Aeroport T1', 'airport', 'both', 41.2974, 2.0833, 1500),
  ('airport-t2', 'Aeroport T2', 'airport', 'both', 41.3007, 2.0746, 1200),
  ('moll-adossat', 'Moll Adossat · cruceros', 'moll_adossat', 'both', 41.3534, 2.1763, 1500),
  ('fira-gran-via', 'Fira Barcelona · Gran Via', 'fira', 'origin', 41.3534, 2.1277, 900),
  ('sants-estacio', 'Estació de Sants', 'sants', 'origin', 41.3790, 2.1400, 320)
on conflict (id) do nothing;

alter table public.taxi_tariff_zones enable row level security;

drop policy if exists "tariff_zones_authenticated_read" on public.taxi_tariff_zones;
create policy "tariff_zones_authenticated_read"
  on public.taxi_tariff_zones for select
  to authenticated
  using (true);

-- Escritura solo con service_role (tRPC de administración).

grant select on public.taxi_tariff_zones to authenticated;
