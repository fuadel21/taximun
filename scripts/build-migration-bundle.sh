#!/usr/bin/env bash
# Taximun — Genera supabase/migration-bundle.sql: TODAS las migraciones
# concatenadas en orden, listas para pegar de una sola vez en el SQL Editor
# de un proyecto nuevo de Supabase.
#
# Uso:
#   bash scripts/build-migration-bundle.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/supabase/migration-bundle.sql"

{
  echo "-- ═══════════════════════════════════════════════════════════════════════"
  echo "-- Taximun — Paquete completo de migraciones de base de datos"
  echo "-- Generado: $(date -u '+%Y-%m-%d %H:%M UTC') · $(ls "$root"/supabase/migrations/*.sql | wc -l) migraciones"
  echo "--"
  echo "-- CÓMO USARLO (proyecto NUEVO de Supabase):"
  echo "--   1. Crea el proyecto en https://supabase.com (plan gratis vale)."
  echo "--   2. Dashboard → Database → Extensions → habilita «pg_cron»."
  echo "--   3. SQL Editor → New query → pega TODO este archivo → Run."
  echo "--   4. Espera «Success. No rows returned» (unos segundos)."
  echo "--   5. Verifica: SELECT count(*) FROM information_schema.tables"
  echo "--      WHERE table_schema = 'public';  → decenas de tablas taxi_*."
  echo "-- ═════════════════════════════════════════════════════════════════════"
  echo
  for f in "$root"/supabase/migrations/*.sql; do
    echo
    echo "-- ─────────────────────────────────────────────────────────────────────"
    echo "-- $(basename "$f")"
    echo "-- ─────────────────────────────────────────────────────────────────────"
    cat "$f"
    echo
  done
} > "$out"

echo "✓ $out ($(wc -l < "$out") líneas, $(du -h "$out" | cut -f1))"
