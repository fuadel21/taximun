/**
 * Taximun — Implementaciones locales de las RPC de Supabase (modo demo).
 * Refleja la lógica de las funciones SQL de supabase/migrations en JS.
 */
import {
  allRows, findRow, insertRow, store, generatePickupPin, haversineKm, nowISO,
} from "./store";
import {
  driverBusy, driverCanOperate, leaveZoneQueues, queuePositionOf, queueZoneForPoint, syncZoneQueues,
} from "./queues";

type Row = Record<string, any>;
type RpcResult = { data: any; error: any };

const ok = (data: any): RpcResult => ({ data, error: null });
const err = (code: string, detail = ""): RpcResult => ({
  data: null,
  error: { code: "P0001", message: `${code}: ${detail || code}` },
});

const ACTIVE_RIDE = ["pending", "assigned", "in_progress"];

function rideById(id: string) {
  return findRow("taxi_rides", (r) => r.id === id);
}
function freeDriver(driverId: string | null) {
  if (!driverId) return;
  const live = findRow("driver_live_status", (r) => r.driver_id === driverId);
  if (live) live.status = "available";
}
function cancelOffersForRide(rideId: string) {
  for (const offer of allRows("taxi_ride_offers")) {
    if (offer.ride_id === rideId && offer.status === "pending") offer.status = "cancelled";
  }
}
function logActivity(actorId: string, actorRole: string, message: string, rideId: string | null = null) {
  insertRow("taxi_activity_logs", { actor_id: actorId, actor_role: actorRole, message, ride_id: rideId });
}
/**
 * Geocodificador local de Barcelona para el modo demo: reconoce los lugares
 * del mercado inicial y devuelve coordenadas aproximadas para que mapas,
 * despacho por distancia y navegación funcionen sin API externa.
 */
const BCN_PLACES: Array<{ keys: string[]; lat: number; lng: number }> = [
  { keys: ["mallorca"], lat: 41.3936, lng: 2.1632 },
  { keys: ["arago", "arragona"], lat: 41.3935, lng: 2.1526 },
  { keys: ["sagrada"], lat: 41.4036, lng: 2.1744 },
  { keys: ["passeig de gracia", "passeig de gràcia", "pedrera"], lat: 41.3952, lng: 2.1617 },
  { keys: ["plaza catalunya", "plaça catalunya", "catalunya"], lat: 41.3874, lng: 2.1686 },
  { keys: ["sants estacio", "sants estació", "estacio de sants", "estación de sants", "sants"], lat: 41.3795, lng: 2.1335 },
  { keys: ["aeropuerto t1", "aeropuerto de barcelona t1", "el prat t1", "t1"], lat: 41.2974, lng: 2.0833 },
  { keys: ["aeropuerto t2", "t2", "el prat"], lat: 41.3007, lng: 2.0746 },
  { keys: ["aeropuerto", "prat"], lat: 41.2974, lng: 2.0833 },
  { keys: ["port olimpic", "port olímpic", "olimpic", "olímpic"], lat: 41.3866, lng: 2.1952 },
  { keys: ["port", "cruise", "cruceros", "moll"], lat: 41.3535, lng: 2.1875 },
  { keys: ["camp nou", "campnou"], lat: 41.3621, lng: 2.1530 },
  { keys: ["gracia", "gràcia"], lat: 41.4025, lng: 2.1565 },
  { keys: ["diagonal"], lat: 41.3898, lng: 2.1673 },
  { keys: ["eixample"], lat: 41.3925, lng: 2.1650 },
  { keys: ["barceloneta", "playa", "platja"], lat: 41.3784, lng: 2.1925 },
  { keys: ["estacio del nord", "arc de triomf", "triomf"], lat: 41.3907, lng: 2.1813 },
  { keys: ["sants-montjuic", "montjuic", "montjuïc", "poble espanyol"], lat: 41.3712, lng: 2.1554 },
  { keys: ["fira", "l'hospitalet", "gran via"], lat: 41.3535, lng: 2.1277 },
  { keys: ["gotic", "gòtic", "catedral", "rambla", "raval"], lat: 41.3833, lng: 2.1767 },
  { keys: ["vila olimpica", "vila olímpica", "bogatell", "mar bella"], lat: 41.3913, lng: 2.1992 },
  { keys: ["les corts", "pedralbes"], lat: 41.3869, lng: 2.1207 },
  { keys: ["clot", "sant andreu", "fabra i puig"], lat: 41.4185, lng: 2.1893 },
  { keys: ["hospitalet"], lat: 41.3615, lng: 2.1055 },
];

export function geocodeBarcelona(address: string): { lat: number; lng: number } | null {
  const normalized = String(address || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const place of BCN_PLACES) {
    if (place.keys.some((key) => normalized.includes(key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      const jitter = () => (Math.random() - 0.5) * 0.004;
      return { lat: place.lat + jitter(), lng: place.lng + jitter() };
    }
  }
  return null;
}

function notify(recipientId: string | null | undefined, recipientRole: string, title: string, body: string, actionUrl: string | null = null, metadata: Row = {}, type = "info") {
  if (!recipientId) return;
  insertRow("taxi_notifications", {
    recipient_id: recipientId, recipient_role: recipientRole, actor_id: null, actor_role: "system",
    type, title, body, action_url: actionUrl, metadata, read_at: null,
  });
}

/** Candidatos a despacho: verificados, disponibles, sin viaje activo, sin rechazo previo del viaje. */
function dispatchCandidates(ride: Row) {
  const rejectedBy = new Set(
    allRows("taxi_ride_rejections").filter((r) => r.ride_id === ride.id).map((r) => r.driver_id),
  );
  // Zona con cola oficial que contiene el punto de recogida (aeropuerto, Sants, puerto, centro).
  const pickupQueueZone = queueZoneForPoint(ride.pickup_lat, ride.pickup_lng);
  return allRows("driver_live_status")
    .filter((d) => d.status === "available")
    .filter((d) => driverCanOperate(d.driver_id).can)
    .filter((d) => !driverBusy(d.driver_id))
    .filter((d) => !rejectedBy.has(d.driver_id))
    .map((d) => {
      const distance =
        typeof ride.pickup_lat === "number" && typeof ride.pickup_lng === "number"
          ? haversineKm(d.current_lat, d.current_lng, ride.pickup_lat, ride.pickup_lng)
          : 1.5;
      const queuePosition = pickupQueueZone ? queuePositionOf(d.driver_id, pickupQueueZone.id) : null;
      return { driver: d, distanceKm: distance, etaMin: Math.max(2, Math.round((distance / 22) * 60) + 2), queuePosition };
    })
    // FIFO por zona: si la recogida está en una zona con cola, su cabeza pasa delante de la distancia.
    .sort((a, b) => {
      const aInQueue = a.queuePosition !== null ? 0 : 1;
      const bInQueue = b.queuePosition !== null ? 0 : 1;
      if (aInQueue !== bInQueue) return aInQueue - bInQueue;
      if (aInQueue === 0) return (a.queuePosition ?? 0) - (b.queuePosition ?? 0);
      return a.distanceKm - b.distanceKm;
    });
}

function createOfferForRide(rideId: string, offerSeconds: number): RpcResult {
  const ride = rideById(rideId);
  if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
  if (ride.driver_id || ride.status !== "pending") return err("RIDE_NOT_ASSIGNABLE", "El viaje ya tiene conductor.");

  // Idempotente: si ya hay una oferta viva para este viaje, no se crea otra.
  const liveOffer = allRows("taxi_ride_offers").find(
    (o) => o.ride_id === rideId && o.status === "pending" && o.expires_at > nowISO(),
  );
  if (liveOffer) {
    return ok({ ok: true, code: "OFFER_ALREADY_ACTIVE", ride_id: rideId, offer_id: liveOffer.id, driver_id: liveOffer.driver_id, expires_at: liveOffer.expires_at, candidates: 1 });
  }

  const candidates = dispatchCandidates(ride);
  const best = candidates[0];
  const decisionBase = {
    ride_id: rideId,
    driver_id: best?.driver.driver_id ?? null,
    offer_id: null as any,
    result_code: best ? "OFFER_CREATED" : "NO_DRIVER_AVAILABLE",
    distance_km: best ? Number(best.distanceKm.toFixed(3)) : null,
    estimated_eta_minutes: best ? best.etaMin : null,
    driver_rating: best ? best.driver.rating : null,
    freshness_seconds: best ? 10 : null,
    fairness_penalty: 0,
    rejection_penalty: 0,
    final_score: best ? Number((100 - best.distanceKm * 4 - best.etaMin).toFixed(2)) : null,
    candidate_count: candidates.length,
    algorithm_version: "smart_dispatch_v1",
    metadata: {},
  };

  if (!best) {
    insertRow("taxi_dispatch_decisions", { ...decisionBase });
    return ok({ ok: false, code: "NO_DRIVER_AVAILABLE", ride_id: rideId, candidates: 0 });
  }

  const now = new Date();
  const offer = insertRow("taxi_ride_offers", {
    ride_id: rideId,
    driver_id: best.driver.driver_id,
    status: "pending",
    rank_score: decisionBase.final_score,
    distance_to_pickup_km: decisionBase.distance_km,
    eta_to_pickup_minutes: best.etaMin,
    offered_at: now.toISOString(),
    expires_at: new Date(now.getTime() + offerSeconds * 1000).toISOString(),
    responded_at: null,
    response_ms: null,
    metadata: { algorithm: "smart_dispatch_v1", candidate_count: candidates.length },
  });
  insertRow("taxi_dispatch_decisions", { ...decisionBase, offer_id: offer.id });

  const live = findRow("driver_live_status", (r) => r.driver_id === best.driver.driver_id);
  if (live) {
    live.offers_received = Number(live.offers_received ?? 0) + 1;
    live.last_offer_at = now.toISOString();
  }

  return ok({
    ok: true,
    code: "OFFER_CREATED",
    ride_id: rideId,
    offer_id: offer.id,
    driver_id: best.driver.driver_id,
    expires_at: offer.expires_at,
    eta_minutes: best.etaMin,
    candidates: candidates.length,
  });
}

/** Fusiona oferta + viaje para la UI del conductor (getCurrentOffer). */
function offerWithRide(offer: Row): Row {
  const ride = rideById(offer.ride_id) ?? {};
  return {
    ...offer,
    pickup_address: ride.pickup_address,
    dropoff_address: ride.dropoff_address,
    pickup_lat: ride.pickup_lat,
    pickup_lng: ride.pickup_lng,
    dropoff_lat: ride.dropoff_lat,
    dropoff_lng: ride.dropoff_lng,
    passenger_name: ride.passenger_name,
    estimated_fare: ride.estimated_fare,
    estimated_duration: ride.estimated_duration,
    distance_km: ride.distance_km,
    trip_distance_km: ride.distance_km,
    payment_method: ride.payment_method,
    service_type: ride.service_type,
    service_category: ride.service_category,
    passenger_requirements: ride.passenger_requirements,
    intermediate_stops: ride.intermediate_stops,
    requested_at: ride.requested_at,
    ride_status: ride.status,
  };
}

function assignRide(ride: Row, driverId: string, driverName: string, taxiCode: string, plate: string) {
  ride.driver_id = driverId;
  ride.driver_name = driverName;
  ride.taxi_code = taxiCode;
  ride.plate = plate;
  ride.status = "assigned";
  ride.assigned_at = nowISO();
  ride.updated_at = nowISO();
  const live = findRow("driver_live_status", (r) => r.driver_id === driverId);
  if (live) live.status = "busy";
  // Al aceptar un viaje, el conductor sale de la cola de su zona.
  leaveZoneQueues(driverId);
  return ride;
}

// ---------------------------------------------------------------------------

export const localRpcs: Record<string, (params: any) => RpcResult> = {
  // ---- públicas ----
  find_nearest_drivers({ user_lat, user_lng, radius_km }) {
    const rows = allRows("driver_live_status")
      .filter((d) => d.status === "available")
      .map((d) => ({
        ...d,
        distance_km: Number(haversineKm(user_lat, user_lng, d.current_lat, d.current_lng).toFixed(3)),
      }))
      .filter((d) => d.distance_km <= radius_km)
      .sort((a, b) => a.distance_km - b.distance_km);
    return ok(rows);
  },

  // ---- estado conductor ----
  taximun_driver_can_operate({ p_driver_id }) {
    return ok(driverCanOperate(p_driver_id).can);
  },
  taximun_driver_operation_message({ p_driver_id }) {
    return ok(driverCanOperate(p_driver_id).message);
  },

  // ---- cola clásica de viajes pendientes ----
  taximun_find_pending_rides_for_driver({ p_driver_id }) {
    const rejected = new Set(
      allRows("taxi_ride_rejections").filter((r) => r.driver_id === p_driver_id).map((r) => r.ride_id),
    );
    const liveOffer = allRows("taxi_ride_offers").find(
      (o) => o.driver_id === p_driver_id && o.status === "pending" && o.expires_at > nowISO(),
    );
    const pending = allRows("taxi_rides")
      .filter((r) => r.status === "pending" && !r.driver_id && !rejected.has(r.id))
      .sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)))
      .slice(0, 10);
    const withFlags = pending.map((r) => ({
      ...r,
      offered_to_me: liveOffer?.ride_id === r.id,
      eta_to_pickup_minutes: liveOffer?.ride_id === r.id ? liveOffer?.eta_to_pickup_minutes : null,
    }));
    return ok(withFlags);
  },

  // ---- aceptación clásica ----
  taximun_accept_ride_transactional({ p_ride_id, p_driver_id, p_driver_name, p_taxi_code, p_plate }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (driverBusy(p_driver_id)) return err("DRIVER_ALREADY_BUSY", "Ya tienes un viaje activo.");
    const rejected = findRow("taxi_ride_rejections", (r) => r.ride_id === p_ride_id && r.driver_id === p_driver_id);
    if (rejected) return err("RIDE_REJECTED_BY_DRIVER", "Ya rechazaste este viaje.");
    if (ride.driver_id || ride.status !== "pending") return err("RIDE_NO_LONGER_PENDING", "Este viaje ya no está disponible.");
    cancelOffersForRide(p_ride_id);
    assignRide(ride, p_driver_id, p_driver_name, p_taxi_code, p_plate);
    logActivity(p_driver_id, "driver", "Viaje aceptado por conductor", p_ride_id);
    return ok(ride);
  },

  // ---- despacho del servidor ----
  taximun_server_dispatch({ p_ride_id, p_offer_seconds }) {
    return createOfferForRide(p_ride_id, Math.max(10, Number(p_offer_seconds) || 25));
  },

  // ---- procesado de reservas programadas ----
  // Equivalente local de la función SQL taximun_process_scheduled_bookings que en
  // producción ejecuta pg_cron cada 5 minutos: envía recordatorios 24h/2h/30min
  // y convierte la reserva en viaje real 15 minutos antes de la hora programada.
  taximun_process_scheduled_bookings({ p_now }) {
    const now = p_now ? new Date(p_now) : new Date();
    if (Number.isNaN(now.getTime())) return err("INVALID_NOW", "Fecha de proceso inválida.");
    const nowIso = now.toISOString();
    const convertAfter = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    let reminders24h = 0;
    let reminders2h = 0;
    let reminders30m = 0;
    let ridesDispatched = 0;
    let ridesDeferred = 0;

    const due = (at: unknown) => typeof at === "string" && at <= nowIso;

    const bookings = allRows("taxi_scheduled_bookings")
      .filter((b) => b.status === "scheduled")
      .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

    for (const booking of bookings) {
      if (due(booking.reminder_24h_at) && !booking.reminder_24h_sent_at) {
        notify(
          booking.passenger_id, "passenger",
          "Tu reserva es en menos de 24 horas",
          `Recogida en ${booking.pickup_address} con destino ${booking.dropoff_address}. Nos vemos ahí.`,
          "/passenger/book", { scheduled_booking_id: booking.id, reminder: "24h" }, "info",
        );
        booking.reminder_24h_sent_at = nowIso;
        reminders24h += 1;
      }
      if (due(booking.reminder_2h_at) && !booking.reminder_2h_sent_at) {
        notify(
          booking.passenger_id, "passenger",
          "Tu taxi reservado llega en 2 horas",
          `Prepárate: recogida en ${booking.pickup_address}. Revisa que llevas todo lo necesario.`,
          "/passenger/book", { scheduled_booking_id: booking.id, reminder: "2h" }, "info",
        );
        booking.reminder_2h_sent_at = nowIso;
        reminders2h += 1;
      }
      if (due(booking.reminder_30m_at) && !booking.reminder_30m_sent_at) {
        notify(
          booking.passenger_id, "passenger",
          "Tu taxi reservado llega en 30 minutos",
          `El taxi te espera en ${booking.pickup_address}. Sal con tiempo de sobra.`,
          "/passenger/rides", { scheduled_booking_id: booking.id, reminder: "30m" }, "warning",
        );
        booking.reminder_30m_sent_at = nowIso;
        reminders30m += 1;
      }

      // Conversión a viaje real: 15 minutos antes de la hora programada.
      if (String(booking.scheduled_at) <= convertAfter) {
        booking.dispatch_attempts = Number(booking.dispatch_attempts ?? 0) + 1;
        booking.last_processing_attempt_at = nowIso;
        booking.updated_at = nowIso;

        // Idempotente: reserva ya convertida.
        if (booking.dispatched_ride_id) {
          booking.status = "dispatched";
          continue;
        }

        // Guard: pasajero con viaje activo → diferir al siguiente ciclo.
        const passengerBusy = allRows("taxi_rides").some(
          (r) => r.passenger_id === booking.passenger_id && ACTIVE_RIDE.includes(r.status),
        );
        if (passengerBusy) {
          booking.last_processing_error = "PASSENGER_HAS_ACTIVE_RIDE";
          ridesDeferred += 1;
          continue;
        }
        booking.last_processing_error = null;

        // Idempotente: viaje ya creado para esta reserva (índice único en producción).
        let ride = allRows("taxi_rides").find((r) => r.scheduled_booking_id === booking.id);
        if (!ride) {
          const pickupGeo = Number.isFinite(booking.pickup_lat) ? null : geocodeBarcelona(booking.pickup_address ?? "");
          const dropoffGeo = Number.isFinite(booking.dropoff_lat) ? null : geocodeBarcelona(booking.dropoff_address ?? "");
          const category = booking.service_category ?? "standard";
          const serviceType = category === "comfort" ? "eco" : category === "van" || category === "accessible" ? "van" : "taxi";
          ride = insertRow("taxi_rides", {
            passenger_id: booking.passenger_id,
            passenger_name: booking.passenger_name ?? "Pasajero",
            driver_id: null, driver_name: null, taxi_code: null, plate: null,
            pickup_address: booking.pickup_address,
            dropoff_address: booking.dropoff_address,
            pickup_lat: booking.pickup_lat ?? pickupGeo?.lat ?? null,
            pickup_lng: booking.pickup_lng ?? pickupGeo?.lng ?? null,
            dropoff_lat: booking.dropoff_lat ?? dropoffGeo?.lat ?? null,
            dropoff_lng: booking.dropoff_lng ?? dropoffGeo?.lng ?? null,
            estimated_fare: booking.estimated_fare,
            final_fare: null,
            estimated_duration: booking.estimated_duration,
            distance_km: booking.distance_km,
            payment_method: booking.payment_method,
            service_type: serviceType,
            service_category: category,
            status: "pending",
            pickup_pin: generatePickupPin(),
            share_token: crypto.randomUUID(),
            share_enabled: false,
            requested_at: nowIso,
            assigned_at: null, driver_arrived_at: null, started_at: null, completed_at: null,
            cancelled_at: null, cancellation_reason: null, cancellation_note: null,
            fare_breakdown: booking.fare_breakdown ?? null,
            intermediate_stops: booking.intermediate_stops ?? [],
            passenger_requirements: booking.passenger_requirements ?? {},
            scheduled_booking_id: booking.id,
          });
          if (booking.payment_method === "card") {
            insertRow("taxi_payments", {
              ride_id: ride.id, passenger_id: booking.passenger_id, driver_id: null,
              provider: "stripe_demo", provider_payment_intent_id: null, provider_charge_id: null,
              status: "authorized", currency: "EUR",
              amount_authorized: Math.round(Number(booking.estimated_fare ?? 0) * 100),
              amount_captured: 0, amount_refunded: 0,
              platform_fee: 0, driver_net: 0, client_secret: null, captured_at: null,
            });
          }
          logActivity(booking.passenger_id, "passenger", "Reserva programada activada automáticamente", ride.id);
        }
        booking.status = "dispatched";
        booking.dispatched_ride_id = ride.id;
        ridesDispatched += 1;
        notify(
          booking.passenger_id, "passenger",
          "Estamos buscando tu taxi reservado",
          "Tu reserva se ha activado. En cuanto un conductor la acepte verás el taxi asignado en la app.",
          "/passenger/rides", { scheduled_booking_id: booking.id, ride_id: ride.id }, "success",
        );
        syncZoneQueues();
        createOfferForRide(ride.id, 120);
      }
    }

    return ok({
      reminders_24h: reminders24h,
      reminders_2h: reminders2h,
      reminders_30m: reminders30m,
      rides_dispatched: ridesDispatched,
      rides_deferred: ridesDeferred,
    });
  },

  // ---- ofertas inteligentes ----
  taximun_claim_smart_offer({ p_driver_id }) {
    const offer = allRows("taxi_ride_offers")
      .filter((o) => o.driver_id === p_driver_id && o.status === "pending" && o.expires_at > nowISO())
      .sort((a, b) => String(b.offered_at).localeCompare(String(a.offered_at)))[0];
    return ok(offer ? offerWithRide(offer) : null);
  },
  taximun_accept_smart_offer({ p_offer_id, p_driver_id, p_driver_name, p_taxi_code, p_plate }) {
    const offer = findRow("taxi_ride_offers", (o) => o.id === p_offer_id);
    if (!offer) return err("OFFER_NOT_FOUND", "La oferta no existe.");
    if (offer.driver_id !== p_driver_id) return err("OFFER_DRIVER_MISMATCH", "La oferta no es para ti.");
    if (offer.status !== "pending" || offer.expires_at <= nowISO()) {
      return err("OFFER_EXPIRED", "La oferta ha caducado.");
    }
    if (driverBusy(p_driver_id)) return err("DRIVER_ALREADY_BUSY", "Ya tienes un viaje activo.");
    const ride = rideById(offer.ride_id);
    if (!ride || ride.driver_id || ride.status !== "pending") return err("RIDE_NO_LONGER_PENDING", "Este viaje ya no está disponible.");
    offer.status = "accepted";
    offer.responded_at = nowISO();
    offer.response_ms = Date.now() - new Date(offer.offered_at).getTime();
    assignRide(ride, p_driver_id, p_driver_name, p_taxi_code, p_plate);
    const live = findRow("driver_live_status", (r) => r.driver_id === p_driver_id);
    if (live) live.offers_accepted = Number(live.offers_accepted ?? 0) + 1;
    logActivity(p_driver_id, "driver", "Oferta inteligente aceptada", ride.id);
    return ok(ride);
  },
  taximun_reject_smart_offer({ p_offer_id, p_driver_id, p_reason }) {
    const offer = findRow("taxi_ride_offers", (o) => o.id === p_offer_id);
    if (!offer || offer.driver_id !== p_driver_id || offer.status !== "pending") {
      return err("OFFER_NOT_REJECTABLE", "La oferta ya no está activa.");
    }
    offer.status = "rejected";
    offer.responded_at = nowISO();
    const live = findRow("driver_live_status", (r) => r.driver_id === p_driver_id);
    if (live) {
      live.offers_rejected = Number(live.offers_rejected ?? 0) + 1;
      live.status = "available";
    }
    insertRow("taxi_ride_rejections", { ride_id: offer.ride_id, driver_id: p_driver_id, reason: p_reason || "driver_declined" });
    // reintenta con el siguiente conductor disponible
    createOfferForRide(offer.ride_id, 25);
    return ok(true);
  },
  taximun_reconcile_dispatch_state() {
    let expired = 0;
    let redispatched = 0;
    for (const offer of allRows("taxi_ride_offers")) {
      if (offer.status === "pending" && offer.expires_at <= nowISO()) {
        offer.status = "expired";
        offer.responded_at = nowISO();
        expired++;
        const live = findRow("driver_live_status", (r) => r.driver_id === offer.driver_id);
        if (live) live.offers_expired = Number(live.offers_expired ?? 0) + 1;
        // Nota: el SQL real no registra rechazo por timeout; el conductor
        // sigue pudiendo aceptar el viaje desde la cola clásica.
      }
    }
    // viajes pendientes sin oferta viva → redispatch
    for (const ride of allRows("taxi_rides")) {
      if (ride.status !== "pending" || ride.driver_id) continue;
      const hasLiveOffer = allRows("taxi_ride_offers").some(
        (o) => o.ride_id === ride.id && o.status === "pending" && o.expires_at > nowISO(),
      );
      if (!hasLiveOffer) {
        const result = createOfferForRide(ride.id, 120);
        if (result.data?.code === "OFFER_CREATED") redispatched++;
      }
    }
    return ok({ expired, redispatched, ok: true });
  },
  taximun_dispatch_health() {
    const offers = allRows("taxi_ride_offers");
    return ok({
      ok: true,
      pending_offers: offers.filter((o) => o.status === "pending" && o.expires_at > nowISO()).length,
      expired_24h: offers.filter((o) => o.status === "expired").length,
      pending_rides: allRows("taxi_rides").filter((r) => r.status === "pending" && !r.driver_id).length,
      available_drivers: allRows("driver_live_status").filter((d) => d.status === "available").length,
      algorithm_version: "smart_dispatch_v1",
    });
  },

  // ---- reservas con precio ----
  taximun_commit_priced_booking({ p_operation, p_payload, p_promotion_id, p_target_id }) {
    const p = p_payload ?? {};
    const activeRide = allRows("taxi_rides").find(
      (r) => r.passenger_id === p.passenger_id && ACTIVE_RIDE.includes(r.status),
    );
    const activeBooking = allRows("taxi_scheduled_bookings").find(
      (b) => b.passenger_id === p.passenger_id && b.status === "scheduled",
    );

    if (p_operation === "create_immediate") {
      if (activeRide) return err("ACTIVE_RIDE_EXISTS", "Ya tienes un viaje activo.");
      const pickupGeo = Number.isFinite(p.pickup_lat) ? null : geocodeBarcelona(p.pickup_address ?? "");
      const dropoffGeo = Number.isFinite(p.dropoff_lat) ? null : geocodeBarcelona(p.dropoff_address ?? "");
      const ride = insertRow("taxi_rides", {
        passenger_id: p.passenger_id,
        passenger_name: p.passenger_name ?? "Pasajero",
        driver_id: null, driver_name: null, taxi_code: null, plate: null,
        pickup_address: p.pickup_address,
        dropoff_address: p.dropoff_address,
        pickup_lat: p.pickup_lat ?? pickupGeo?.lat ?? null, pickup_lng: p.pickup_lng ?? pickupGeo?.lng ?? null,
        dropoff_lat: p.dropoff_lat ?? dropoffGeo?.lat ?? null, dropoff_lng: p.dropoff_lng ?? dropoffGeo?.lng ?? null,
        estimated_fare: p.fare_subtotal,
        final_fare: null,
        estimated_duration: p.estimated_duration,
        distance_km: p.distance_km,
        payment_method: p.payment_method,
        service_type: p.service_type ?? "taxi",
        service_category: p.service_category ?? "standard",
        status: "pending",
        pickup_pin: generatePickupPin(),
        share_token: crypto.randomUUID(),
        share_enabled: false,
        requested_at: nowISO(),
        assigned_at: null, driver_arrived_at: null, started_at: null, completed_at: null,
        cancelled_at: null, cancellation_reason: null, cancellation_note: null,
        fare_breakdown: p.fare_breakdown ?? null,
        intermediate_stops: p.intermediate_stops ?? [],
        passenger_requirements: p.passenger_requirements ?? {},
        quote_version: p.quote_version ?? null,
        quoted_at: p.quoted_at ?? null,
      });
      if (p_promotion_id) {
        insertRow("taxi_promotion_redemptions", {
          promotion_id: p_promotion_id, passenger_id: p.passenger_id, ride_id: ride.id, booking_id: null, amount: 0,
        });
      }
// Demo: con tarjeta se autoriza automáticamente el importe (sin Stripe),
      // equivalente a un pasajero con tarjeta guardada.
      if (p.payment_method === "card") {
        insertRow("taxi_payments", {
          ride_id: ride.id, passenger_id: p.passenger_id, driver_id: null,
          provider: "stripe_demo", provider_payment_intent_id: null, provider_charge_id: null,
          status: "authorized", currency: "EUR",
          amount_authorized: Math.round(Number(p.fare_subtotal ?? 0) * 100),
          amount_captured: 0, amount_refunded: 0,
          platform_fee: 0, driver_net: 0, client_secret: null, captured_at: null,
        });
      }
      // despacho automático inicial (TTL generoso para demo) — colas frescas antes de elegir
      syncZoneQueues();
      createOfferForRide(ride.id, 120);
      return ok(ride);
    }

    if (p_operation === "create_scheduled") {
      if (!p.scheduled_at) return err("BOOKING_TARGET_REQUIRED", "Falta la fecha programada.");
      const when = new Date(p.scheduled_at);
      if (when.getTime() < Date.now() + 15 * 60 * 1000) return err("SCHEDULED_TOO_SOON", "Mínimo 15 minutos de antelación.");
      if (activeBooking) return err("ACTIVE_BOOKING_EXISTS", "Ya tienes una reserva programada activa.");
      const scheduledMs = when.getTime();
      const pickupGeo = Number.isFinite(p.pickup_lat) ? null : geocodeBarcelona(p.pickup_address ?? "");
      const dropoffGeo = Number.isFinite(p.dropoff_lat) ? null : geocodeBarcelona(p.dropoff_address ?? "");
      const booking = insertRow("taxi_scheduled_bookings", {
        passenger_id: p.passenger_id,
        passenger_name: p.passenger_name ?? "Pasajero",
        pickup_address: p.pickup_address,
        dropoff_address: p.dropoff_address,
        pickup_lat: p.pickup_lat ?? pickupGeo?.lat ?? null, pickup_lng: p.pickup_lng ?? pickupGeo?.lng ?? null,
        dropoff_lat: p.dropoff_lat ?? dropoffGeo?.lat ?? null, dropoff_lng: p.dropoff_lng ?? dropoffGeo?.lng ?? null,
        scheduled_at: p.scheduled_at,
        service_category: p.service_category ?? "standard",
        payment_method: p.payment_method,
        intermediate_stops: p.intermediate_stops ?? [],
        passenger_requirements: p.passenger_requirements ?? {},
        fare_breakdown: p.fare_breakdown ?? null,
        estimated_fare: p.fare_subtotal,
        fare_range_min: Number((p.fare_subtotal * 0.9).toFixed(2)),
        fare_range_max: Number((p.fare_subtotal * 1.18).toFixed(2)),
        estimated_duration: p.estimated_duration,
        distance_km: p.distance_km,
        status: "scheduled",
        dispatched_ride_id: null,
        reminder_24h_at: new Date(scheduledMs - 24 * 60 * 60 * 1000).toISOString(),
        reminder_24h_sent_at: null,
        reminder_2h_at: new Date(scheduledMs - 2 * 60 * 60 * 1000).toISOString(),
        reminder_2h_sent_at: null,
        reminder_30m_at: new Date(scheduledMs - 30 * 60 * 1000).toISOString(),
        reminder_30m_sent_at: null,
        dispatch_attempts: 0,
        last_processing_attempt_at: null,
        last_processing_error: null,
        cancelled_at: null,
      });
      if (p_promotion_id) {
        insertRow("taxi_promotion_redemptions", {
          promotion_id: p_promotion_id, passenger_id: p.passenger_id, ride_id: null, booking_id: booking.id, amount: 0,
        });
      }
      logActivity(p.passenger_id, "passenger", "Reserva programada creada", null);
      return ok(booking);
    }

    if (p_operation === "update_scheduled") {
      const booking = findRow("taxi_scheduled_bookings", (b) => b.id === p_target_id);
      if (!booking || booking.passenger_id !== p.passenger_id || booking.status !== "scheduled") {
        return err("BOOKING_NOT_EDITABLE", "La reserva ya no se puede editar.");
      }
      Object.assign(booking, {
        pickup_address: p.pickup_address,
        dropoff_address: p.dropoff_address,
        pickup_lat: p.pickup_lat ?? null, pickup_lng: p.pickup_lng ?? null,
        dropoff_lat: p.dropoff_lat ?? null, dropoff_lng: p.dropoff_lng ?? null,
        scheduled_at: p.scheduled_at,
        payment_method: p.payment_method,
        service_category: p.service_category ?? "standard",
        fare_breakdown: p.fare_breakdown ?? booking.fare_breakdown,
        estimated_fare: p.fare_subtotal,
        fare_range_min: Number((p.fare_subtotal * 0.9).toFixed(2)),
        fare_range_max: Number((p.fare_subtotal * 1.18).toFixed(2)),
        estimated_duration: p.estimated_duration,
        distance_km: p.distance_km,
        updated_at: nowISO(),
      });
      return ok(booking);
    }

    return err("UNKNOWN_OPERATION", `Operación no soportada: ${p_operation}`);
  },

  taximun_cancel_scheduled_booking({ p_booking_id, p_passenger_id }) {
    const booking = findRow("taxi_scheduled_bookings", (b) => b.id === p_booking_id);
    if (!booking || booking.passenger_id !== p_passenger_id) return err("BOOKING_NOT_FOUND", "La reserva no existe.");
    if (booking.status !== "scheduled") return err("BOOKING_NOT_CANCELLABLE", "La reserva ya no se puede cancelar.");
    booking.status = "cancelled";
    booking.cancelled_at = nowISO();
    booking.updated_at = nowISO();
    logActivity(p_passenger_id, "passenger", "Reserva programada cancelada", null);
    return ok(true);
  },

  // ---- ciclo de vida del viaje ----
  taximun_start_ride_with_pin({ p_ride_id, p_driver_id, p_pickup_pin }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (ride.driver_id !== p_driver_id) return err("DRIVER_MISMATCH", "Este viaje no está asignado a tu cuenta.");
    if (ride.status !== "assigned") return err("RIDE_NOT_ASSIGNED", "El viaje ya no está pendiente de inicio.");
    if (String(ride.pickup_pin ?? "").toUpperCase() !== String(p_pickup_pin ?? "").toUpperCase()) {
      return err("INVALID_PICKUP_PIN", "El PIN de recogida no es correcto.");
    }
    if (!ride.driver_arrived_at) return err("DRIVER_NOT_ARRIVED", "Primero debes marcar que has llegado.");
    ride.status = "in_progress";
    ride.started_at = nowISO();
    ride.updated_at = nowISO();
    logActivity(p_driver_id, "driver", "Viaje iniciado con PIN verificado", ride.id);
    return ok(ride);
  },

  taximun_settle_trip_atomic({ p_ride_id, p_driver_id, p_settled_by, p_driver_name, p_final_fare, p_payment_method, p_payment_status, p_notes }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (ride.driver_id !== p_driver_id) return err("DRIVER_MISMATCH", "Este viaje no está asignado a ese conductor.");
    if (ride.status !== "in_progress") return err("RIDE_NOT_IN_PROGRESS", "El viaje debe estar en curso antes del cierre.");
    const fare = Number(p_final_fare) || ride.estimated_fare || 0;
    ride.status = "completed";
    ride.final_fare = Number(fare.toFixed(2));
    ride.completed_at = nowISO();
    ride.updated_at = nowISO();
    ride.settlement_note = p_notes ?? null;
    ride.settled_by = p_settled_by ?? null;

    const live = findRow("driver_live_status", (r) => r.driver_id === p_driver_id);
    if (live) {
      live.status = "available";
      live.total_earnings = Number((Number(live.total_earnings ?? 0) + fare).toFixed(2));
      live.total_rides = Number(live.total_rides ?? 0) + 1;
    }
    const existingPayment = findRow("taxi_payments", (r) => r.ride_id === ride.id);
    if (existingPayment) {
      existingPayment.status = p_payment_status === "paid" ? "captured" : "authorized";
      existingPayment.amount_captured = p_payment_status === "paid" ? Math.round(fare * 100) : 0;
      existingPayment.platform_fee = Math.round(fare * 5);
      existingPayment.driver_net = Math.round(fare * 95);
      existingPayment.captured_at = p_payment_status === "paid" ? nowISO() : null;
      existingPayment.driver_id = p_driver_id;
      existingPayment.updated_at = nowISO();
    } else {
      insertRow("taxi_payments", {
        ride_id: ride.id, passenger_id: ride.passenger_id, driver_id: p_driver_id,
        provider: p_payment_method === "card" ? "stripe_demo" : "cash",
        provider_payment_intent_id: null,
        provider_charge_id: null,
        status: p_payment_status === "paid" ? "paid" : "pending",
        currency: "EUR",
        amount_authorized: 0,
        amount_captured: p_payment_status === "paid" ? Math.round(fare * 100) : 0,
        amount_refunded: 0,
        platform_fee: Math.round(fare * 5),
        driver_net: Math.round(fare * 95),
        client_secret: null,
        captured_at: p_payment_status === "paid" ? nowISO() : null,
      });
    }
    logActivity(p_settled_by ?? p_driver_id, "driver", `Viaje cerrado · ${fare.toFixed(2)} € · ${p_payment_method}`, ride.id);
    return ok(ride);
  },

  taximun_cancel_ride_by_passenger({ p_ride_id, p_passenger_id, p_reason, p_note }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (ride.passenger_id !== p_passenger_id) return err("PASSENGER_MISMATCH", "Este viaje no pertenece a tu cuenta.");
    if (!["pending", "assigned"].includes(ride.status)) return err("RIDE_NOT_CANCELLABLE", "El viaje ya no se puede cancelar desde esta pantalla.");
    cancelOffersForRide(p_ride_id);
    freeDriver(ride.driver_id);
    ride.status = "cancelled";
    ride.cancelled_at = nowISO();
    ride.cancellation_reason = p_reason ?? "passenger_cancelled";
    ride.cancellation_note = p_note ?? null;
    ride.updated_at = nowISO();
    if (ride.driver_id) {
      notify(ride.driver_id, "driver", "Viaje cancelado por el pasajero", "El pasajero ha cancelado el servicio.", null, { rideId: ride.id }, "warning");
    }
    logActivity(p_passenger_id, "passenger", "Viaje cancelado por pasajero", ride.id);
    return ok(ride);
  },

  taximun_cancel_ride_by_driver({ p_ride_id, p_driver_id, p_reason, p_note }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (ride.driver_id !== p_driver_id) return err("DRIVER_MISMATCH", "Este viaje no está asignado a tu cuenta.");
    if (!["assigned", "in_progress"].includes(ride.status)) return err("RIDE_NOT_CANCELLABLE", "El viaje ya no admite cancelación.");
    freeDriver(p_driver_id);
    ride.status = "cancelled";
    ride.cancelled_at = nowISO();
    ride.cancellation_reason = p_reason ?? "driver_operational";
    ride.cancellation_note = p_note ?? null;
    ride.updated_at = nowISO();
    notify(ride.passenger_id, "passenger", "Viaje cancelado por el conductor", "Buscamos un nuevo taxi para tu servicio.", "/passenger", { rideId: ride.id }, "warning");
    logActivity(p_driver_id, "driver", `Viaje cancelado por conductor (${p_reason})`, ride.id);
    // re-despacha si sigue pendiente
    return ok(ride);
  },

  taximun_cancel_ride_by_admin({ p_ride_id, p_admin_id, p_reason, p_note }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (["completed", "cancelled"].includes(ride.status)) return err("RIDE_NOT_CANCELLABLE", "El viaje ya no admite cancelación administrativa.");
    cancelOffersForRide(p_ride_id);
    freeDriver(ride.driver_id);
    ride.status = "cancelled";
    ride.cancelled_at = nowISO();
    ride.cancellation_reason = p_reason ?? "admin_operational";
    ride.cancellation_note = p_note ?? null;
    ride.updated_at = nowISO();
    logActivity(p_admin_id, "admin", `Viaje cancelado por administración (${p_reason})`, ride.id);
    return ok(ride);
  },

  taximun_cancel_passenger_no_show({ p_ride_id, p_driver_id, p_note }) {
    const ride = rideById(p_ride_id);
    if (!ride) return err("RIDE_NOT_FOUND", "El viaje no existe.");
    if (ride.driver_id !== p_driver_id) return err("DRIVER_MISMATCH", "Este viaje no está asignado a tu cuenta.");
    if (ride.status !== "assigned") return err("RIDE_NOT_CANCELLABLE", "El viaje ya no admite registro de ausencia.");
    const arrived = ride.driver_arrived_at ? new Date(ride.driver_arrived_at).getTime() : 0;
    const waitSeconds = Math.floor((Date.now() - arrived) / 1000);
    if (waitSeconds < 300) return err(`NO_SHOW_WAIT_REQUIRED:${Math.max(0, 300 - waitSeconds)}`, "Debes esperar antes de registrar la ausencia.");
    freeDriver(p_driver_id);
    ride.status = "cancelled";
    ride.cancelled_at = nowISO();
    ride.cancellation_reason = "passenger_no_show";
    ride.cancellation_note = p_note ?? null;
    ride.updated_at = nowISO();
    notify(ride.passenger_id, "passenger", "Ausencia registrada", "El conductor registró que no te presentaste en el punto de recogida.", "/passenger/rides", { rideId: ride.id }, "warning");
    logActivity(p_driver_id, "driver", "Ausencia del pasajero registrada", ride.id);
    return ok(ride);
  },

  // ---- perfiles y misc ----
  taximun_upsert_user_profile_atomic({ p_user_id, p_payload }) {
    const p = p_payload ?? {};
    const role = p.role ?? "passenger";
    const existing = findRow("taxi_user_profiles", (r) => r.user_id === p_user_id && r.role === role);
    if (existing) {
      for (const key of ["full_name", "phone", "avatar_url", "preferred_payment_method", "favorite_address", "emergency_contact_name", "emergency_contact_phone", "driver_license_number", "taxi_code", "plate", "vehicle_model", "work_zone"]) {
        if (key in p) existing[key] = p[key];
      }
      existing.updated_at = nowISO();
      return ok(existing);
    }
    const row = insertRow("taxi_user_profiles", {
      user_id: p_user_id, role,
      full_name: p.full_name ?? null, phone: p.phone ?? null, avatar_url: p.avatar_url ?? null,
      preferred_payment_method: p.preferred_payment_method ?? null, favorite_address: p.favorite_address ?? null,
      emergency_contact_name: p.emergency_contact_name ?? null, emergency_contact_phone: p.emergency_contact_phone ?? null,
      driver_license_number: p.driver_license_number ?? null, taxi_code: p.taxi_code ?? null,
      plate: p.plate ?? null, vehicle_model: p.vehicle_model ?? null, work_zone: p.work_zone ?? null,
      rating: null, completed_rides: null,
      is_verified: false, verification_status: "missing", verification_note: null,
      verified_by: null, verified_at: null,
    });
    return ok(row);
  },

  taximun_record_payment_refund_atomic({ p_payment_id, p_provider_refund_id, p_amount, p_reason, p_status, p_requested_by }) {
    const payment = findRow("taxi_payments", (r) => r.id === p_payment_id);
    if (!payment) return err("PAYMENT_NOT_FOUND", "El pago no existe.");
    const already = Number(payment.amount_refunded ?? 0);
    const captured = Number(payment.amount_captured ?? 0);
    if (already + Number(p_amount) > captured) return err("REFUND_EXCEEDS_CAPTURE", "El reembolso supera el importe capturado.");
    payment.amount_refunded = Number((already + Number(p_amount)).toFixed(2));
    payment.status = payment.amount_refunded >= captured ? "refunded" : "partially_refunded";
    payment.updated_at = nowISO();
    const refund = insertRow("taxi_payment_refunds", {
      payment_id: payment.id, ride_id: payment.ride_id,
      provider_refund_id: p_provider_refund_id, amount: Number(p_amount),
      reason: p_reason ?? null, status: p_status ?? "pending", requested_by: p_requested_by ?? null,
    });
    logActivity(p_requested_by ?? "system", "admin", `Reembolso registrado: ${(Number(p_amount) / 100).toFixed(2)} €`, payment.ride_id);
    return ok(payment);
  },

  taximun_system_health() {
    const rides = allRows("taxi_rides");
    const drivers = allRows("driver_live_status");
    return ok({
      ok: true,
      status: "healthy",
      mode: "local-demo",
      database: { ok: true, label: "Almacén local en memoria", latency_ms: 1 },
      realtime: { ok: true, label: "No requerido en modo demo" },
      auth: { ok: true, label: "Sesiones de desarrollo" },
      stats: {
        rides_total: rides.length,
        rides_active: rides.filter((r) => ACTIVE_RIDE.includes(r.status)).length,
        rides_completed: rides.filter((r) => r.status === "completed").length,
        drivers_available: drivers.filter((d) => d.status === "available").length,
        drivers_busy: drivers.filter((d) => d.status === "busy").length,
      },
      checked_at: nowISO(),
    });
  },
};

export function runLocalRpc(name: string, params: any): RpcResult {
  const fn = localRpcs[name];
  if (!fn) {
    console.warn(`[local-mode] RPC no implementada: ${name} — devolviendo null`);
    return ok(null);
  }
  try {
    return fn(params ?? {});
  } catch (error: any) {
    return { data: null, error: { code: "P0001", message: error?.message ?? `RPC ${name} falló` } };
  }
}
