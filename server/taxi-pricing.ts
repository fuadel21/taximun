import { TRPCError } from "@trpc/server";
import { quoteAmbFare } from "./barcelona-tariff";
import { supabase } from "./supabase-client";

export type TaxiCategory = "standard" | "comfort" | "van" | "accessible";
export type TaxiRequirements = {
  wheelchair?: boolean;
  reducedMobility?: boolean;
  largeLuggage?: boolean;
  pet?: boolean;
  childSeat?: boolean;
  hearingAssistance?: boolean;
  visualAssistance?: boolean;
  notes?: string;
};

export type TaxiQuoteInput = {
  passengerId: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  category: TaxiCategory;
  intermediateStops: Array<{ address: string; lat?: number; lng?: number }>;
  requirements: TaxiRequirements;
  requestedAt: Date;
  promoCode?: string;
  excludeScheduledBookingId?: string;
};

const round = (value: number) => Number(value.toFixed(2));

function excludeEditedBooking(query: any, bookingId?: string) {
  if (!bookingId) return query;
  return query.or(`scheduled_booking_id.is.null,scheduled_booking_id.neq.${bookingId}`);
}

async function promotionFor(input: TaxiQuoteInput, subtotal: number) {
  const code = input.promoCode?.trim().toUpperCase();
  if (!code) return null;

  const now = new Date().toISOString();
  const { data: promotion, error } = await supabase
    .from("taxi_promotions")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!promotion) throw new TRPCError({ code: "BAD_REQUEST", message: "El código promocional no existe o no está activo." });
  if (!Array.isArray(promotion.eligible_categories) || !promotion.eligible_categories.includes(input.category)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El código no es válido para esta categoría." });
  }
  if (subtotal < Number(promotion.minimum_subtotal || 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `El código requiere un importe mínimo de ${Number(promotion.minimum_subtotal).toFixed(2)} €.` });
  }

  const totalQuery = excludeEditedBooking(
    supabase.from("taxi_promotion_redemptions").select("id", { count: "exact", head: true }).eq("promotion_id", promotion.id),
    input.excludeScheduledBookingId,
  );
  const userQuery = excludeEditedBooking(
    supabase.from("taxi_promotion_redemptions").select("id", { count: "exact", head: true }).eq("promotion_id", promotion.id).eq("passenger_id", input.passengerId),
    input.excludeScheduledBookingId,
  );
  const [{ count: totalUses, error: totalError }, { count: userUses, error: userError }] = await Promise.all([totalQuery, userQuery]);
  if (totalError || userError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: totalError?.message || userError?.message });
  if (promotion.max_total_uses !== null && Number(totalUses || 0) >= Number(promotion.max_total_uses)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El código promocional ha agotado sus usos." });
  }
  if (Number(userUses || 0) >= Number(promotion.max_uses_per_user || 1)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ya ha utilizado este código el máximo de veces permitido." });
  }

  const raw = promotion.discount_type === "percent"
    ? subtotal * Number(promotion.discount_value) / 100
    : Number(promotion.discount_value);
  const capped = promotion.max_discount === null ? raw : Math.min(raw, Number(promotion.max_discount));
  return { promotion, discount: round(Math.min(subtotal, Math.max(0, capped))) };
}

/**
 * Presupuesto con la tarifa oficial del taxi de Barcelona (AMB) y precio
 * cerrado por adelantado: bajada de bandera + €/km del tramo horario (T1/T2),
 * suplementos oficiales, mínimos de percepción y promociones.
 */
export async function calculateTaxiQuote(input: TaxiQuoteInput) {
  const fare = await quoteAmbFare({
    pickupAddress: input.pickupAddress,
    dropoffAddress: input.dropoffAddress,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    routeDistanceKm: input.routeDistanceKm,
    routeDurationMinutes: input.routeDurationMinutes,
    category: input.category,
    requestedAt: input.requestedAt,
  });

  // Las paradas intermedias alargan la ruta; sin ruta real del cliente se
  // suman como tramo adicional conservador.
  const stops = input.intermediateStops.length;
  const hasClientRoute = Boolean(input.routeDistanceKm);
  const extraKm = fare.isFlatRate || hasClientRoute ? 0 : round(stops * 2.2);
  const distanceKm = round(fare.distanceKm + extraKm);
  const durationMinutes = fare.isFlatRate ? fare.durationMinutes : fare.durationMinutes + stops * 6;

  // Tramo de distancia adicional por paradas sin ruta real.
  let subtotal = fare.subtotal;
  if (!fare.isFlatRate && extraKm > 0) subtotal = round(subtotal + extraKm * fare.perKm);

  const promo = await promotionFor(input, subtotal);
  const discount = promo?.discount || 0;
  const total = round(Math.max(0, subtotal - discount));

  return {
    version: "amb_barcelona_official_v1",
    quotedAt: new Date().toISOString(),
    subtotal,
    discount,
    total,
    lowerFare: round(total * 0.95),
    upperFare: round(total * 1.15),
    distanceKm,
    durationMinutes,
    promoCode: promo?.promotion.code || null,
    promotionId: promo?.promotion.id || null,
    breakdown: {
      // Tramo oficial aplicado
      tariff: fare.tariff,
      tariffLabel: fare.tariffLabel,
      isFlatRate: fare.isFlatRate,
      // Conceptos oficiales
      baseFare: fare.flagDrop,
      perKm: fare.perKm,
      distanceFare: fare.distanceFare,
      timeFare: 0,
      bookingFee: fare.serviceFee,
      supplements: fare.supplements,
      supplementsTotal: fare.supplementsTotal,
      supplementsCapped: fare.supplementsCapped,
      minimumApplied: fare.minimumApplied,
      minimumLabel: fare.minimumLabel,
      discount,
      // Compatibilidad con vistas antiguas
      airportSupplement: fare.supplements.find((item) => item.code === "airport")?.amount || 0,
      stopSupplement: 0,
      luggageSupplement: 0,
      petSupplement: 0,
      childSeatSupplement: 0,
      categoryMultiplier: input.category === "comfort" ? 1 : 1,
      nightMultiplier: fare.tariff === "T2" ? 1 : 1,
      category: input.category,
      stops,
      routeSource: input.routeDistanceKm ? "client_osrm" : "estimated",
    },
  };
}
