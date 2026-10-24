-- Fase 5c · Tarifa T3 oficial de precio cerrado por app (anexo IMET 2026)
-- y actualización de importes 2026 (noche especial 4,60 € · T4 46,00 €).
alter table public.taxi_tariff_config
  add column if not exists closed_price_mode text not null default 'T3' check (closed_price_mode in ('T3', 'T1T2')),
  add column if not exists t3_day_flag_drop numeric(7,4) not null default 4.1117,
  add column if not exists t3_day_per_km numeric(7,4) not null default 1.1148,
  add column if not exists t3_day_per_minute numeric(7,4) not null default 0.2832,
  add column if not exists t3_night_flag_drop numeric(7,4) not null default 4.4321,
  add column if not exists t3_night_per_km numeric(7,4) not null default 1.4710,
  add column if not exists t3_night_per_minute numeric(7,4) not null default 0.2226;

update public.taxi_tariff_config
set closed_price_mode = 'T3',
    t3_day_flag_drop = 4.1117, t3_day_per_km = 1.1148, t3_day_per_minute = 0.2832,
    t3_night_flag_drop = 4.4321, t3_night_per_km = 1.4710, t3_night_per_minute = 0.2226,
    sup_special_night = 4.60,
    t4_flat_port_airport = 46.00,
    updated_at = now()
where id = 1;
