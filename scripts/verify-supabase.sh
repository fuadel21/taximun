#!/usr/bin/env bash
# Taximun — Verificador de conexión con el proyecto Supabase real.
#
# Comprueba que el .env apunta a un proyecto con las migraciones aplicadas:
#   1. Variables presentes
#   2. API REST accesible con la clave service_role
#   3. Tablas principales creadas (taxi_rides, queue_zones, ...)
#   4. Funciones RPC operativas (procesador de reservas, sync de colas)
#
# Uso:  bash scripts/verify-supabase.sh
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

fail() { echo "✗ $1"; exit 1; }

[ -n "${SUPABASE_URL:-}" ]                || fail "Falta SUPABASE_URL (cópiala de Settings → API)"
[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]   || fail "Falta SUPABASE_SERVICE_ROLE_KEY (Settings → API → service_role)"
[ -n "${SUPABASE_ANON_KEY:-}" ]           || fail "Falta SUPABASE_ANON_KEY (Settings → API → anon public)"

echo "── Taximun · verificación de Supabase ──"
echo "Proyecto: $SUPABASE_URL"

# 1) API REST accesible
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/taxi_rides?select=id&limit=1")
[ "$code" = "200" ] || fail "La API REST no responde (HTTP $code). Revisa la URL y la clave service_role."
echo "✓ API REST accesible con service_role"

# 2) Tablas principales
for tabla in taxi_rides taxi_scheduled_bookings driver_live_status taxi_user_profiles queue_zones driver_queues taxi_payments; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/$tabla?select=*&limit=1")
  [ "$code" = "200" ] || fail "Falta la tabla '$tabla' (HTTP $code). ¿Aplicaste supabase/migration-bundle.sql en el SQL Editor?"
  echo "✓ tabla $tabla"
done

# 3) Zonas de cola sembradas
zonas=$(curl -s \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/queue_zones?select=id&is_active=eq.true" | grep -o '"id"' | wc -l)
[ "$zonas" -ge 5 ] || fail "Solo hay $zonas zonas de cola (esperadas 5). Revisa el insert final del bundle."
echo "✓ $zonas zonas de cola activas"

# 4) RPC operativas (idempotentes: en un proyecto vacío no hacen nada)
rpc1=$(curl -s -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{}' "$SUPABASE_URL/rest/v1/rpc/taximun_process_scheduled_bookings")
echo "$rpc1" | grep -q "reminders_24h" || fail "La RPC taximun_process_scheduled_bookings no responde: $rpc1"
echo "✓ RPC taximun_process_scheduled_bookings → $rpc1"

rpc2=$(curl -s -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{}' "$SUPABASE_URL/rest/v1/rpc/taximun_sync_zone_queues")
echo "$rpc2" | grep -qE "^[0-9]+$" || fail "La RPC taximun_sync_zone_queues no responde: $rpc2"
echo "✓ RPC taximun_sync_zone_queues → $rpc2"

echo
echo "🎉 Proyecto Supabase conectado y operativo."
echo "   Comprobación manual opcional (SQL Editor) — los dos jobs de pg_cron:"
echo "     select jobname, schedule from cron.job;"
echo "   Deben aparecer 'taximun-process-scheduled-bookings' (*/5) y 'taximun-sync-zone-queues' (*)."
