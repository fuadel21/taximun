-- Fase 5 · Tarifa oficial del taxi de Barcelona (AMB), configurable desde administración.
-- Valores por defecto = tarifa metropolitana vigente (taxi.amb.cat).
create table if not exists public.taxi_tariff_config (
  id smallint primary key default 1 check (id = 1),
  t1_flag_drop numeric(6,2) not null default 2.80,   -- Bajada de bandera T1 (laborables 08:00-20:00)
  t1_per_km numeric(6,3) not null default 1.35,      -- €/km T1
  t2_flag_drop numeric(6,2) not null default 2.80,   -- Bajada de bandera T2 (laborables 20:00-08:00 y sábado/festivo 24h)
  t2_per_km numeric(6,3) not null default 1.66,      -- €/km T2
  waiting_per_hour numeric(6,2) not null default 27.75, -- Espera/detención por hora
  sup_airport numeric(6,2) not null default 4.60,    -- Suplemento aeropuerto (origen o destino)
  sup_moll_adossat numeric(6,2) not null default 4.60, -- Suplemento Moll Adossat / cruceros
  sup_fira_origen numeric(6,2) not null default 3.30,  -- Suplemento Fira Gran Via (origen)
  sup_sants_origen numeric(6,2) not null default 2.55, -- Suplemento Estació Sants (origen)
  sup_large_vehicle numeric(6,2) not null default 4.60, -- Suplemento vehículo 5-8 plazas
  sup_special_night numeric(6,2) not null default 3.10, -- Noches especiales (Sant Joan, Nochebuena, Fin de Año)
  min_airport_total numeric(6,2) not null default 21.00, -- Mínima desde aeropuerto (incluye suplementos)
  min_app_service numeric(6,2) not null default 8.00,    -- Mínima servicio concertado por app
  max_supplements numeric(6,2) not null default 17.10,   -- Tope suma de suplementos
  t4_flat_port_airport numeric(6,2) not null default 45.00, -- T4 fijo aeropuerto <-> Moll Adossat
  service_fee numeric(6,2) not null default 0,        -- Cargo de servicio de la app (0 = taxímetro exacto)
  comfort_multiplier numeric(6,3) not null default 1.000, -- Multiplicador categoría confort
  road_factor numeric(6,3) not null default 1.280,    -- Factor recta->ruta sin OSRM
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.taxi_tariff_config (id) values (1) on conflict (id) do nothing;

alter table public.taxi_tariff_config enable row level security;

drop policy if exists "tariff_config_authenticated_read" on public.taxi_tariff_config;
create policy "tariff_config_authenticated_read"
  on public.taxi_tariff_config for select
  to authenticated
  using (true);

-- Escritura solo con service_role (procedimientos tRPC de administración), sin políticas de escritura.

grant select on public.taxi_tariff_config to authenticated;
