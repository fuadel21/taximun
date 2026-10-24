/**
 * Taximun — Almacén de datos local (modo demo sin Supabase).
 * Tablas en memoria con datos semilla de Barcelona (mercado inicial de Taximun).
 */
import type { LocalStore } from "./postgrest";

export type Row = Record<string, any>;

const uuid = () => crypto.randomUUID();
const iso = (offsetMinutes = 0) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();

export const store: LocalStore = new Map<string, Row[]>();

function seedTable(name: string, rows: Row[]) {
  store.set(name, rows);
}

export const LOCAL_USERS = {
  admin: { openId: "local:admin", name: "Equipo Taximun", email: "admin@taximun.local", role: "admin" },
  passenger: { openId: "local:passenger", name: "Laura Gil", email: "laura@taximun.local", role: "passenger" },
  driver1: { openId: "local:driver-1", name: "Marc Vidal", email: "marc@taximun.local", role: "driver" },
  driver2: { openId: "local:driver-2", name: "Youssef Amrani", email: "youssef@taximun.local", role: "driver" },
  driver3: { openId: "local:driver-3", name: "Carmen Ruiz", email: "carmen@taximun.local", role: "driver" },
  driver4: { openId: "local:driver-4", name: "Pau Serra", email: "pau@taximun.local", role: "driver" },
};

function userRow(u: { openId: string; name: string; email: string; role: string }, id: number) {
  const now = daysAgo(30);
  return {
    id,
    openId: u.openId,
    name: u.name,
    email: u.email,
    phone: null,
    loginMethod: "local-demo",
    role: u.role,
    language: "es",
    profilePicture: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export function seedIfEmpty() {
  if (store.size > 0) return;

  // ---- usuarios (sesiones dev) ----
  seedTable("users", [
    userRow(LOCAL_USERS.admin, 1),
    userRow(LOCAL_USERS.passenger, 2),
    userRow(LOCAL_USERS.driver1, 10),
    userRow(LOCAL_USERS.driver2, 11),
    userRow(LOCAL_USERS.driver3, 12),
    userRow(LOCAL_USERS.driver4, 13),
  ]);

  // ---- perfiles ----
  const profile = (u: any, extra: Row = {}) => ({
    user_id: u.openId,
    role: u.role,
    full_name: u.name,
    phone: "+34 600 000 000",
    avatar_url: null,
    preferred_payment_method: u.role === "passenger" ? "card" : null,
    favorite_address: u.role === "passenger" ? "Carrer de Mallorca 401, Eixample" : null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    driver_license_number: null,
    taxi_code: null,
    plate: null,
    vehicle_model: null,
    work_zone: null,
    rating: u.role === "driver" ? 4.9 : null,
    completed_rides: u.role === "driver" ? 1200 : null,
    is_verified: true,
    verification_status: "approved",
    verification_note: null,
    verified_by: "local:admin",
    verified_at: daysAgo(25),
    created_at: daysAgo(30),
    updated_at: daysAgo(2),
    ...extra,
  });
  seedTable("taxi_user_profiles", [
    profile(LOCAL_USERS.admin),
    profile(LOCAL_USERS.passenger, { rating: null, completed_rides: null }),
    profile(LOCAL_USERS.driver1, {
      taxi_code: "TX-101", plate: "1234-JKL", vehicle_model: "Toyota Prius+",
      work_zone: "Eixample", driver_license_number: "B-8899123",
    }),
    profile(LOCAL_USERS.driver2, {
      taxi_code: "TX-204", plate: "5678-BCD", vehicle_model: "Mercedes V-Class",
      work_zone: "Sants", driver_license_number: "B-4455667",
    }),
    profile(LOCAL_USERS.driver3, {
      taxi_code: "TX-317", plate: "9012-GHQ", vehicle_model: "Hyundai Ioniq",
      work_zone: "Gràcia", driver_license_number: "B-2233445",
    }),
    profile(LOCAL_USERS.driver4, {
      taxi_code: "TX-402", plate: "3456-RTY", vehicle_model: "Fiat Talento",
      work_zone: "Aeropuerto", driver_license_number: "B-6677889",
    }),
  ]);

  // ---- estado en vivo de conductores ----
  const live = (u: any, extra: Row) => ({
    driver_id: u.openId,
    driver_name: u.name,
    status: "available",
    current_zone: "Eixample",
    total_earnings: 18240.5,
    total_rides: 1284,
    rating: 4.9,
    offers_received: 412,
    offers_accepted: 361,
    offers_rejected: 28,
    offers_expired: 23,
    last_offer_at: daysAgo(0, 5),
    created_at: daysAgo(30),
    updated_at: iso(-1),
    ...extra,
  });
  seedTable("driver_live_status", [
    live(LOCAL_USERS.driver1, { taxi_code: "TX-101", plate: "1234-JKL", current_lat: 41.3925, current_lng: 2.165, current_zone: "Eixample", total_earnings: 18240.5, total_rides: 1284, rating: 4.92 }),
    live(LOCAL_USERS.driver2, { taxi_code: "TX-204", plate: "5678-BCD", current_lat: 41.3795, current_lng: 2.1335, current_zone: "Sants Estació", total_earnings: 21011.75, total_rides: 1502, rating: 4.85, status: "available" }),
    live(LOCAL_USERS.driver3, { taxi_code: "TX-317", plate: "9012-GHQ", current_lat: 41.4025, current_lng: 2.1565, current_zone: "Gràcia", total_earnings: 15430.2, total_rides: 977, rating: 4.97, status: "available" }),
    live(LOCAL_USERS.driver4, { taxi_code: "TX-402", plate: "3456-RTY", current_lat: 41.2974, current_lng: 2.0833, current_zone: "Aeroport T1", total_earnings: 24890.0, total_rides: 1731, rating: 4.78, status: "available" }),
  ]);

  // ---- documentación de conductores (verificada) ----
  const doc = (driverId: string, type: string) => ({
    id: uuid(),
    driver_id: driverId,
    document_type: type,
    status: "approved",
    file_url: "https://demo.taximun.local/docs/verificado.pdf",
    expires_at: iso(365 * 24 * 60),
    reviewed_by: "local:admin",
    reviewed_at: daysAgo(25),
    rejection_reason: null,
    created_at: daysAgo(26),
    updated_at: daysAgo(25),
  });
  const docDrivers = ["local:driver-1", "local:driver-2", "local:driver-3", "local:driver-4"];
  seedTable("taxi_driver_documents", docDrivers.flatMap((d) => [doc(d, "driver_license"), doc(d, "vehicle_insurance"), doc(d, "taxi_license")]));

  // ---- viajes históricos completados ----
  const doneRide = (n: number, driver: any, pickup: string, dropoff: string, fare: number, km: number, d: number) => ({
    id: uuid(),
    passenger_id: LOCAL_USERS.passenger.openId,
    passenger_name: LOCAL_USERS.passenger.name,
    driver_id: driver.openId,
    driver_name: driver.name,
    taxi_code: driver.taxiCode ?? null,
    plate: null,
    pickup_address: pickup,
    dropoff_address: dropoff,
    pickup_lat: null, pickup_lng: null, dropoff_lat: null, dropoff_lng: null,
    estimated_fare: Number(fare.toFixed(2)),
    final_fare: Number(fare.toFixed(2)),
    estimated_duration: Math.round(km * 3),
    distance_km: km,
    payment_method: n % 2 === 0 ? "card" : "cash",
    service_type: "taxi",
    service_category: "standard",
    status: "completed",
    pickup_pin: null,
    share_token: uuid(),
    share_enabled: false,
    requested_at: daysAgo(d, 3),
    assigned_at: daysAgo(d, 3 - 0.02),
    driver_arrived_at: daysAgo(d, 2.95),
    started_at: daysAgo(d, 2.9),
    completed_at: daysAgo(d, 2.6),
    cancelled_at: null,
    cancellation_reason: null,
    cancellation_note: null,
    fare_breakdown: { base: 2.2, distance: Number((fare - 3.2).toFixed(2)), tiempo: 1.0, suplemento: null, total: Number(fare.toFixed(2)) },
    intermediate_stops: [],
    passenger_requirements: { wheelchair: false, largeLuggage: false, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "" },
    created_at: daysAgo(d, 3),
    updated_at: daysAgo(d, 2.6),
  });
  const drivers4 = [
    { openId: LOCAL_USERS.driver1.openId, name: LOCAL_USERS.driver1.name, taxiCode: "TX-101" },
    { openId: LOCAL_USERS.driver2.openId, name: LOCAL_USERS.driver2.name, taxiCode: "TX-204" },
    { openId: LOCAL_USERS.driver3.openId, name: LOCAL_USERS.driver3.name, taxiCode: "TX-317" },
    { openId: LOCAL_USERS.driver1.openId, name: LOCAL_USERS.driver1.name, taxiCode: "TX-101" },
  ];
  const completedRides = [
    doneRide(1, drivers4[0], "Carrer de Mallorca 401, Eixample", "Aeropuerto de Barcelona T1", 39.5, 17.2, 12),
    doneRide(2, drivers4[1], "Estació de Sants", "Port Olímpic", 14.8, 6.1, 9),
    doneRide(3, drivers4[2], "Passeig de Gràcia 92, La Pedrera", "Camp Nou", 16.3, 5.8, 5),
    doneRide(4, drivers4[3], "Carrer de Mallorca 401, Eixample", "Sagrada Família", 8.9, 2.4, 2),
  ];
  seedTable("taxi_rides", completedRides);

  // ---- valoraciones ----
  seedTable("taxi_ride_ratings", completedRides.map((r, i) => ({
    id: uuid(),
    ride_id: r.id,
    passenger_id: LOCAL_USERS.passenger.openId,
    driver_id: r.driver_id,
    score: [5, 5, 4, 5][i],
    comment: i === 2 ? "Muy amable, condujo con cuidado." : null,
    tags: i === 0 ? ["conducción_suave", "puntual"] : [],
    created_at: r.completed_at,
    updated_at: r.completed_at,
  })));

  // ---- pagos (los completados con tarjeta) ----
  seedTable("taxi_payments", completedRides
    .filter((r) => r.payment_method === "card")
    .map((r) => ({
      id: uuid(),
      ride_id: r.id,
      passenger_id: r.passenger_id,
      driver_id: r.driver_id,
      provider: "cash",
      provider_payment_intent_id: null,
      provider_charge_id: null,
      status: "paid",
      currency: "EUR",
      amount_authorized: 0,
      amount_captured: Math.round(Number(r.final_fare) * 100),
      amount_refunded: 0,
      platform_fee: Math.round(Number(r.final_fare) * 5),
      driver_net: Math.round(Number(r.final_fare) * 95),
      client_secret: null,
      captured_at: r.completed_at,
      created_at: r.completed_at,
      updated_at: r.completed_at,
    })));

  // ---- reservas programadas ----
  seedTable("taxi_scheduled_bookings", [{
    id: uuid(),
    passenger_id: LOCAL_USERS.passenger.openId,
    passenger_name: LOCAL_USERS.passenger.name,
    pickup_address: "Carrer de Mallorca 401, Eixample",
    dropoff_address: "Aeropuerto de Barcelona T2",
    pickup_lat: 41.3936, pickup_lng: 2.1632, dropoff_lat: 41.3007, dropoff_lng: 2.0746,
    scheduled_at: iso(24 * 60),
    service_category: "standard",
    payment_method: "card",
    intermediate_stops: [],
    passenger_requirements: { wheelchair: false, largeLuggage: true, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "Vuelo temprano" },
    fare_breakdown: { base: 2.2, distance: 30.4, tiempo: 3.5, suplemento_aeropuerto: 4.5, total: 40.6 },
    estimated_fare: 40.6,
    fare_range_min: 36.5,
    fare_range_max: 47.8,
    estimated_duration: 27,
    distance_km: 16.4,
    status: "scheduled",
    dispatched_ride_id: null,
    reminder_24h_at: iso(0),
    reminder_24h_sent_at: null,
    reminder_2h_at: iso(22 * 60),
    reminder_2h_sent_at: null,
    reminder_30m_at: iso(23.5 * 60),
    reminder_30m_sent_at: null,
    dispatch_attempts: 0,
    last_processing_attempt_at: null,
    last_processing_error: null,
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
    cancelled_at: null,
  }]);

  // ---- lugares guardados del pasajero ----
  seedTable("taxi_saved_places", [
    { id: uuid(), user_id: LOCAL_USERS.passenger.openId, place_type: "home", label: "Casa", address: "Carrer de Mallorca 401, Eixample", lat: 41.3936, lng: 2.1632, created_at: daysAgo(20), updated_at: daysAgo(20) },
    { id: uuid(), user_id: LOCAL_USERS.passenger.openId, place_type: "favorite", label: "Aeropuerto T1", address: "Aeropuerto de Barcelona T1", lat: 41.2974, lng: 2.0833, created_at: daysAgo(18), updated_at: daysAgo(18) },
    { id: uuid(), user_id: LOCAL_USERS.passenger.openId, place_type: "work", label: "Oficina Diagonal", address: "Av. Diagonal 640", lat: 41.3898, lng: 2.1673, created_at: daysAgo(15), updated_at: daysAgo(15) },
  ]);

  // ---- promociones ----
  seedTable("taxi_promotions", [{
    id: uuid(),
    code: "TAXIMUN10",
    name: "10% de bienvenida",
    description: "10% de descuento en tu viaje, hasta 5 €.",
    discount_type: "percent",
    discount_value: 10,
    max_discount: 5,
    minimum_subtotal: 8,
    eligible_categories: ["standard", "comfort", "van", "accessible"],
    starts_at: daysAgo(20),
    ends_at: iso(60 * 24 * 60),
    max_total_uses: 1000,
    max_uses_per_user: 2,
    active: true,
    created_by: "local:admin",
    created_at: daysAgo(20),
    updated_at: daysAgo(20),
  }]);

  // ---- notificaciones ----
  seedTable("taxi_notifications", [
    { id: uuid(), recipient_id: LOCAL_USERS.passenger.openId, recipient_role: "passenger", actor_id: null, actor_role: "system", type: "success", title: "Bienvenida a Taximun", body: "Tu cuenta está lista. Pide tu primer taxi con un clic.", action_url: "/passenger/book", metadata: {}, read_at: null, created_at: daysAgo(1) },
    { id: uuid(), recipient_id: LOCAL_USERS.driver1.openId, recipient_role: "driver", actor_id: null, actor_role: "system", type: "info", title: "Documentación verificada", body: "Tus documentos han sido verificados. Ya puedes operar.", action_url: null, metadata: {}, read_at: null, created_at: daysAgo(25) },
  ]);

  // ---- decisiones de dispatch (métricas admin) ----
  const decisions: Row[] = [];
  for (let i = 0; i < 14; i++) {
    const created = daysAgo(0, 1 + i * 0.8);
    const ok = i % 5 !== 4;
    decisions.push({
      id: uuid(),
      ride_id: uuid(),
      driver_id: ok ? LOCAL_USERS.driver1.openId : null,
      offer_id: ok ? uuid() : null,
      result_code: ok ? "OFFER_CREATED" : "NO_DRIVER_AVAILABLE",
      distance_km: ok ? Number((0.4 + i * 0.13).toFixed(3)) : null,
      estimated_eta_minutes: ok ? Number((3 + (i % 5)).toFixed(2)) : null,
      driver_rating: ok ? 4.85 : null,
      freshness_seconds: ok ? 12 + i : null,
      fairness_penalty: ok ? Number((i * 0.01).toFixed(3)) : null,
      rejection_penalty: 0,
      final_score: ok ? Number((90 - i * 1.3).toFixed(2)) : null,
      candidate_count: ok ? 3 + (i % 3) : 0,
      algorithm_version: "smart_dispatch_v1",
      metadata: {},
      created_at: created,
    });
  }
  seedTable("taxi_dispatch_decisions", decisions);

  // ---- informes de seguridad (admin) ----
  seedTable("taxi_safety_reports", [
    { id: uuid(), reporter_id: LOCAL_USERS.passenger.openId, reporter_role: "passenger", ride_id: completedRides[2].id, category: "conduccion", priority: "medium", status: "open", title: "Conducción algo brusca", description: "En el tramo del túnel de la Ronda acceleró demasiado.", lat: 41.385, lng: 2.16, contact_phone: "+34 600 000 000", assigned_admin_id: null, resolution_note: null, created_at: daysAgo(3), updated_at: daysAgo(3), resolved_at: null },
    { id: uuid(), reporter_id: LOCAL_USERS.driver3.openId, reporter_role: "driver", ride_id: null, category: "vehiculo", priority: "low", status: "in_progress", title: "Luces de freno", description: "Aviso de mantenimiento: luz de freno derecha intermitente.", lat: null, lng: null, contact_phone: null, assigned_admin_id: "local:admin", resolution_note: null, created_at: daysAgo(1), updated_at: daysAgo(1), resolved_at: null },
  ]);

  // ---- actividad ----
  seedTable("taxi_activity_logs", [
    { id: uuid(), actor_id: LOCAL_USERS.admin.openId, actor_role: "admin", message: "Verificación de conductor aprobada", ride_id: null, created_at: daysAgo(25) },
    { id: uuid(), actor_id: LOCAL_USERS.passenger.openId, actor_role: "passenger", message: "Viaje completado y valorado", ride_id: completedRides[3].id, created_at: daysAgo(2, 2.6) },
  ]);

  // ---- tablas vacías del resto del sistema ----
  for (const t of [
    "taxi_ride_offers", "taxi_ride_rejections", "taxi_ride_tips", "taxi_promotion_redemptions",
    "taxi_trip_messages", "taxi_trip_call_requests", "taxi_trip_call_sessions", "taxi_trip_call_signals",
    "taxi_trip_audio_rooms", "taxi_trip_audio_signals", "taxi_trip_audio_quality_events",
    "taxi_safety_report_events", "taxi_driver_connect_accounts", "taxi_driver_transfers",
    "taxi_stripe_webhook_events", "taxi_payment_refunds", "taxi_push_devices",
    // tablas legacy (drizzle) usadas por flujos antiguos
    "drivers", "passengers", "taxis", "rides", "driver_queues", "queue_zones", "ratings",
    "admin_drivers", "admin_taxis", "admin_incidents", "admin_activity_logs", "audit_logs",
  ]) {
    if (!store.has(t)) seedTable(t, []);
  }
}

// ---- helpers para las RPC locales ----
export function findRow(table: string, pred: (r: Row) => boolean): Row | undefined {
  return (store.get(table) ?? []).find(pred);
}
export function allRows(table: string): Row[] {
  return store.get(table) ?? [];
}
export function insertRow(table: string, row: Row): Row {
  const rows = store.get(table) ?? [];
  const now = new Date().toISOString();
  const full: Row = { ...row };
  if (!full.id) full.id = uuid();
  if (!full.created_at) full.created_at = now;
  full.updated_at = now;
  rows.push(full);
  store.set(table, rows);
  return full;
}
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function generatePickupPin(): string {
  const chars = "ABCDEF0123456789";
  let pin = "";
  for (let i = 0; i < 4; i++) pin += chars[Math.floor(Math.random() * chars.length)];
  return pin;
}
export const nowISO = () => new Date().toISOString();
