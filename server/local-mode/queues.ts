/**
 * Taximun — Colas FIFO por zona (modo demo local).
 *
 * Zonas críticas con cola oficial (aeropuerto, estación, puerto, centro).
 * Los conductores disponibles en la zona entran automáticamente en cola;
 * el despacho prioriza la cabeza de cola de la zona de recogida antes que
 * la distancia pura. Semántica alineada con la migración SQL
 * supabase/migrations/20261021120000_zone_fifo_queues.sql.
 */
import { allRows, findRow, haversineKm, nowISO, store } from "./store";

type Row = Record<string, any>;

export type QueueZoneSeed = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  city: string;
};

/** Zonas con cola oficial (nombres alineados con TAXIMUN_MARKETS.barcelona.zones). */
export const QUEUE_ZONE_SEED: QueueZoneSeed[] = [
  { id: "bcn-airport-t1", name: "Aeroport T1", center_lat: 41.2974, center_lng: 2.0833, radius_meters: 1500, city: "Barcelona" },
  { id: "bcn-airport-t2", name: "Aeroport T2", center_lat: 41.3007, center_lng: 2.0746, radius_meters: 1200, city: "Barcelona" },
  { id: "bcn-sants", name: "Sants Estació", center_lat: 41.3795, center_lng: 2.1335, radius_meters: 800, city: "Barcelona" },
  { id: "bcn-port", name: "Port / Cruise", center_lat: 41.3535, center_lng: 2.1875, radius_meters: 900, city: "Barcelona" },
  { id: "bcn-centre", name: "Centre", center_lat: 41.3874, center_lng: 2.1686, radius_meters: 900, city: "Barcelona" },
];

/** Minutos medios de servicio por posición de cola (estimación de espera). */
export const QUEUE_MINUTES_PER_POSITION = 6;

export function seedQueueZones() {
  const existing = store.get("queue_zones") ?? [];
  for (const zone of QUEUE_ZONE_SEED) {
    if (!existing.find((r) => r.id === zone.id)) {
      existing.push({
        ...zone,
        country: "Spain",
        is_active: true,
        created_at: nowISO(),
        updated_at: nowISO(),
      });
    }
  }
  store.set("queue_zones", existing);
}

// ---------------------------------------------------------------------------
// Estado operativo de conductores (compartido con rpcs.ts)
// ---------------------------------------------------------------------------

export function profileFor(userId: string, role: string) {
  return findRow("taxi_user_profiles", (r) => r.user_id === userId && r.role === role);
}

export function driverBusy(driverId: string) {
  return allRows("taxi_rides").some(
    (r) => r.driver_id === driverId && ["assigned", "in_progress"].includes(r.status),
  );
}

export function driverCanOperate(driverId: string): { can: boolean; message: string } {
  const profile = profileFor(driverId, "driver");
  if (!profile) return { can: false, message: "No existe tu perfil de conductor. Completa tus datos." };
  if (profile.verification_status !== "approved" || !profile.is_verified) {
    return { can: false, message: profile.verification_note || "Tu cuenta de conductor todavía no está verificada." };
  }
  const live = findRow("driver_live_status", (r) => r.driver_id === driverId);
  if (!live) return { can: false, message: "No tienes estado operativo. Abre turno para operar." };
  return { can: true, message: "Conductor verificado y autorizado para operar." };
}

// ---------------------------------------------------------------------------
// Sincronización de colas
// ---------------------------------------------------------------------------

/**
 * Reconstruye las colas activas a partir del estado operativo:
 * entra quien está disponible, verificado, sin viaje activo y con
 * current_zone igual al nombre de una zona con cola; sale quien no.
 * La posición se ordena por joined_at (FIFO). Un conductor que vuelve
 * a estar disponible reentra por el final, como en la cola del aeropuerto.
 */
export function syncZoneQueues() {
  const zones = allRows("queue_zones").filter((z) => z.is_active);
  const liveDrivers = allRows("driver_live_status");
  const queueRows = allRows("driver_queues");

  const eligible = (driverId: string, zoneName: string) => {
    const live = liveDrivers.find((d) => d.driver_id === driverId);
    if (!live) return false;
    if (String(live.current_zone ?? "").trim() !== zoneName) return false;
    if (live.status !== "available") return false;
    if (!driverCanOperate(driverId).can) return false;
    if (driverBusy(driverId)) return false;
    return true;
  };

  // desactivar filas que ya no aplican
  for (const row of queueRows) {
    const zone = zones.find((z) => z.id === row.zone_id);
    if (!row.is_active) continue;
    if (!zone || !eligible(row.driver_id, zone.name)) {
      row.is_active = false;
      row.updated_at = nowISO();
    }
  }

  // incorporar a los que aplican y no tienen fila activa
  for (const zone of zones) {
    for (const driver of liveDrivers) {
      if (!eligible(driver.driver_id, zone.name)) continue;
      const already = queueRows.find(
        (r) => r.driver_id === driver.driver_id && r.zone_id === zone.id && r.is_active,
      );
      if (!already) {
        queueRows.push({
          id: crypto.randomUUID(),
          driver_id: driver.driver_id,
          zone_id: zone.id,
          position: 0,
          joined_at: nowISO(),
          is_active: true,
          created_at: nowISO(),
          updated_at: nowISO(),
        });
      }
    }
  }

  // recalcular posiciones por zona (FIFO por joined_at)
  for (const zone of zones) {
    const rows = queueRows
      .filter((r) => r.zone_id === zone.id && r.is_active)
      .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
    rows.forEach((row, index) => {
      row.position = index + 1;
      row.updated_at = nowISO();
    });
  }

  store.set("driver_queues", queueRows);
}

/** Zona con cola que contiene un punto (o null). */
export function queueZoneForPoint(lat: unknown, lng: unknown): Row | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return (
    allRows("queue_zones").find((zone) => {
      if (!zone.is_active) return false;
      return haversineKm(lat, lng, zone.center_lat, zone.center_lng) * 1000 <= Number(zone.radius_meters ?? 500);
    }) ?? null
  );
}

/** Posición en cola del conductor dentro de una zona (null si no está en cola). */
export function queuePositionOf(driverId: string, zoneId: string): number | null {
  const row = allRows("driver_queues").find(
    (r) => r.driver_id === driverId && r.zone_id === zoneId && r.is_active,
  );
  return row ? Number(row.position) : null;
}

/** Saca a un conductor de todas las colas (al aceptar un viaje). */
export function leaveZoneQueues(driverId: string) {
  for (const row of allRows("driver_queues")) {
    if (row.driver_id === driverId && row.is_active) {
      row.is_active = false;
      row.updated_at = nowISO();
    }
  }
}

/** Estado de todas las colas para UI (conductores ordenados por posición). */
export function queueSnapshot() {
  const liveDrivers = allRows("driver_live_status");
  const driverName = (id: string) => liveDrivers.find((d) => d.driver_id === id)?.driver_name ?? id;
  return allRows("queue_zones")
    .filter((z) => z.is_active)
    .map((zone) => {
      const members = allRows("driver_queues")
        .filter((r) => r.zone_id === zone.id && r.is_active)
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((r) => ({
          driver_id: r.driver_id,
          driver_name: driverName(r.driver_id),
          position: Number(r.position),
          joined_at: r.joined_at,
        }));
      return {
        zone_id: zone.id,
        zone_name: zone.name,
        center_lat: zone.center_lat,
        center_lng: zone.center_lng,
        radius_meters: zone.radius_meters,
        waiting: members.length,
        estimated_wait_minutes: members.length * QUEUE_MINUTES_PER_POSITION,
        head: members[0] ?? null,
        members,
      };
    });
}
