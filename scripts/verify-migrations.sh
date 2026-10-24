#!/usr/bin/env bash
# Taximun — Verificador local de migraciones de Supabase.
#
# Aplica TODAS las migraciones de supabase/migrations/ en orden sobre un
# PostgreSQL local (vainilla) para detectar errores SQL antes de tocar el
# proyecto real de Supabase. Las características específicas de Supabase
# (esquema auth, storage, pg_cron, roles) se simulan con stubs mínimos.
#
# Uso:
#   sudo apt-get install -y postgresql          # una vez
#   createdb taximun_migrations_test            # una vez (o deja que falle)
#   bash scripts/verify-migrations.sh
#
# El script NO modifica los archivos de migración: los stubs viven solo en
# la base de datos de prueba.
set -euo pipefail

DB="${1:-taximun_migrations_test}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------------------
# Stubs de la plataforma Supabase (solo en la BD de prueba)
# ---------------------------------------------------------------------------
cat > "$WORK/stubs.sql" <<'SQL'
-- Roles de Supabase
do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null; end $$;

-- Esquema auth (auth.uid / auth.jwt)
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;

-- Esquema storage (buckets/objects/foldername)
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit integer, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);
create or replace function storage.foldername(p_name text) returns text[]
language sql immutable as $$ select string_to_array(p_name, '/') $$;

-- pg_cron no está en PostgreSQL vainilla: esquema cron simulado
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigint primary key, schedule text, command text, jobname text unique
);
create or replace function cron.schedule(p_jobname text, p_schedule text, p_command text)
returns bigint language plpgsql as $fn$
declare v_id bigint;
begin
  insert into cron.job (jobid, schedule, command, jobname)
  values ((coalesce((select max(jobid) from cron.job), 0) + 1), p_schedule, p_command, p_jobname)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_id;
  return v_id;
end $fn$;
create or replace function cron.unschedule(p_jobid bigint)
returns boolean language plpgsql as $fn$
begin
  delete from cron.job where jobid = p_jobid;
  return true;
end $fn$;
SQL

psql -v ON_ERROR_STOP=1 -d "$DB" -q -f "$WORK/stubs.sql"
echo "✓ stubs de plataforma Supabase instalados (auth, storage, cron, roles)"

# ---------------------------------------------------------------------------
# Aplicar cada migración en orden (sin tocar los archivos originales)
# ---------------------------------------------------------------------------
total=0
failed=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  total=$((total + 1))
  # pg_cron no existe en vainilla: se omite la línea de creación de la extensión
  sed 's/^create extension if not exists pg_cron;$/-- [harness] pg_cron simulado/' "$file" > "$WORK/migration.sql"
  if psql -v ON_ERROR_STOP=1 -d "$DB" -q -f "$WORK/migration.sql" 2> "$WORK/error.log"; then
    echo "✓ $name"
  else
    failed=$((failed + 1))
    echo "✗ $name"
    sed 's/^/    /' "$WORK/error.log" | head -15
  fi
done

echo
if [ "$failed" -gt 0 ]; then
  echo "💥 $failed de $total migraciones con errores"
  exit 1
fi
echo "🎉 $total migraciones aplicadas sin errores"
