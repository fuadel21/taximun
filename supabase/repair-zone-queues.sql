-- ═══════════════════════════════════════════════════════════════════════════
-- Taximun — REPARACIÓN de las colas FIFO por zona
--
-- POR QUÉ: este proyecto tiene unas tablas legacy «queue_zones» y
-- «driver_queues» de una era anterior del código (con columnas distintas:
-- latitude/longitude/radius_km y entered_at). La migración
-- 20261021120000_zone_fifo_queues usa «create table if not exists», así que
-- SE SALTÓ la creación y su INSERT falló; la función de sincronización y su
-- job de pg_cron no llegaron a crearse.
--
-- QUÉ HACE: sustituye las dos tablas legacy (vacías) por las correctas,
-- siembra las 5 zonas de Barcelona, crea taximun_sync_zone_queues() y
-- (re)programa los dos jobs de pg_cron.
--
-- CÓMO USARLO: SQL Editor → New query → pega TODO → Run.
-- Es seguro ejecutarlo más de una vez (idempotente).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop table if exists public.driver_queues cascade;
drop table if exists public.queue_zones cascade;

create table public.queue_zones (
  id text primary key,
  name text not null unique,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null default 500,
  city text,
  country text default 'Spain',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_queues (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  zone_id text not null references public.queue_zones (id) on delete cascade,
  position integer not null default 0,
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index driver_queues_zone_driver_active_uidx
  on public.driver_queues (zone_id, driver_id)
  where is_active;

create index driver_queues_zone_position_idx
  on public.driver_queues (zone_id, position)
  where is_active;

create index driver_queues_driver_idx
  on public.driver_queues (driver_id)
  where is_active;

alter table public.queue_zones enable row level security;
alter table public.driver_queues enable row level security;

drop policy if exists "queue zones readable by authenticated" on public.queue_zones;
create policy "queue zones readable by authenticated"
  on public.queue_zones for select to authenticated using (true);

drop policy if exists "queue zones admin manage" on public.queue_zones;
create policy "queue zones admin manage"
  on public.queue_zones for all to authenticated
  using (public.taximun_is_admin()) with check (public.taximun_is_admin());

drop policy if exists "driver queues readable by authenticated" on public.driver_queues;
create policy "driver queues readable by authenticated"
  on public.driver_queues for select to authenticated using (true);

drop policy if exists "driver queues admin manage" on public.driver_queues;
create policy "driver queues admin manage"
  on public.driver_queues for all to authenticated
  using (public.taximun_is_admin()) with check (public.taximun_is_admin());

-- Zonas del mercado de Barcelona
insert into public.queue_zones (id, name, center_lat, center_lng, radius_meters, city)
values
  ('bcn-airport-t1', 'Aeroport T1', 41.2974, 2.0833, 1500, 'Barcelona'),
  ('bcn-airport-t2', 'Aeroport T2', 41.3007, 2.0746, 1200, 'Barcelona'),
  ('bcn-sants', 'Sants Estació', 41.3795, 2.1335, 800, 'Barcelona'),
  ('bcn-port', 'Port / Cruise', 41.3535, 2.1875, 900, 'Barcelona'),
  ('bcn-centre', 'Centre', 41.3874, 2.1686, 900, 'Barcelona')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sincronizador de colas (equivalente SQL del scheduler local del modo demo)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.taximun_sync_zone_queues()
returns integer
language plpgsql
security definer
as $$
declare
  v_deactivated integer;
  v_inserted integer;
begin
  update public.driver_queues dq
     set is_active = false, updated_at = now()
   where dq.is_active
     and not exists (
       select 1
         from public.driver_live_status dls
         join public.queue_zones qz on qz.id = dq.zone_id and qz.is_active
         join public.taxi_user_profiles p
           on p.user_id = dls.driver_id
          and p.role = 'driver'
          and p.verification_status = 'approved'
          and p.is_verified
        where dls.driver_id = dq.driver_id
          and dls.status = 'available'
          and trim(dls.current_zone) = qz.name
          and not exists (
            select 1 from public.taxi_rides r
             where r.driver_id = dls.driver_id
               and r.status in ('assigned', 'in_progress')
          )
     );
  get diagnostics v_deactivated = row_count;

  insert into public.driver_queues (driver_id, zone_id, position, joined_at, is_active)
  select distinct dls.driver_id, qz.id, 0, now(), true
    from public.driver_live_status dls
    join public.queue_zones qz
      on qz.is_active
     and trim(dls.current_zone) = qz.name
    join public.taxi_user_profiles p
      on p.user_id = dls.driver_id
     and p.role = 'driver'
     and p.verification_status = 'approved'
     and p.is_verified
   where dls.status = 'available'
     and not exists (
       select 1 from public.taxi_rides r
        where r.driver_id = dls.driver_id
          and r.status in ('assigned', 'in_progress')
     )
     and not exists (
       select 1 from public.driver_queues dq
        where dq.driver_id = dls.driver_id
          and dq.zone_id = qz.id
          and dq.is_active
     );
  get diagnostics v_inserted = row_count;

  with ordered as (
    select dq.id,
           row_number() over (partition by dq.zone_id order by dq.joined_at, dq.id) as pos
      from public.driver_queues dq
      join public.queue_zones qz on qz.id = dq.zone_id and qz.is_active
     where dq.is_active
  )
  update public.driver_queues dq
     set position = ordered.pos, updated_at = now()
    from ordered
   where dq.id = ordered.id
     and dq.position is distinct from ordered.pos;

  return v_deactivated + v_inserted;
end;
$$;

revoke all on function public.taximun_sync_zone_queues() from public, anon, authenticated;
grant execute on function public.taximun_sync_zone_queues() to service_role;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Jobs de pg_cron (fuera de la transacción).
-- NOTA: si «create extension» da error, habilita pg_cron antes en
-- Dashboard → Database → Extensions, y vuelve a ejecutar solo esta parte.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname = 'taximun-sync-zone-queues' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'taximun-sync-zone-queues',
    '* * * * *',
    $cron$select public.taximun_sync_zone_queues();$cron$
  );
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname = 'taximun-process-scheduled-bookings' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'taximun-process-scheduled-bookings',
    '*/5 * * * *',
    $cron$select public.taximun_process_scheduled_bookings();$cron$
  );
end;
$$;

-- Verificación final (deben verse 5 zonas y 2 jobs):
--   select id, name from public.queue_zones order by name;
--   select jobname, schedule from cron.job order by jobname;
