import { TRPCError } from "@trpc/server";
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
  category: TaxiCategory;
  intermediateStops: Array<{ address: string; lat?: number; lng?: number }>;
  requirements: TaxiRequirements;
  requestedAt: Date;
  promoCode?: string;
  excludeScheduledBookingId?: string;
};

const MARKET_TIME_ZONE = "Europe/Madrid";
const MODEL = {
  version: "taximun_pricing_v2_madrid",
  baseFare: 3.1,
  perKm: 1.32,
  perMinute: 0.28,
  bookingFee: 1.2,
  minimumFare: 7,
  airportSupplement: 4.5,
  nightMultiplier: 1.15,
  roadFactor: 1.28,
  averageUrbanSpeedKmh: 24,
  stopSupplement: 2.5,
  luggageSupplement: 3,
  petSupplement: 2,
  childSeatSupplement: 4,
  categoryMultipliers: {
    standard: 1,
    comfort: 1.18,
    van: 1.45,
    accessible: 1.35,
  } satisfies Record<TaxiCategory, number>,
};

const round = (value: number) => Number(value.toFixed(2));
const radians = (value: number) => (value * Math.PI) / 180;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earth = 6371;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function airport(address: string) {
  const value = address.toLowerCase();
  return ["aeroport", "aeropuerto", "el prat", "bcn airport", "terminal t1", "terminal t2"].some((item) => value.includes(item));
}

function madridTariffPeriod(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekend = weekday === "Sat" || weekday === "Sun";
  return {
    hour,
    weekday,
    weekend,
    isNightOrWeekend: hour >= 20 || hour < 7 || weekend,
  };
}

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
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ya has utilizado este código el máximo de veces permitido." });
  }

  const raw = promotion.discount_type === "percent"
    ? subtotal * Number(promotion.discount_value) / 100
    : Number(promotion.discount_value);
  const capped = promotion.max_discount === null ? raw : Math.min(raw, Number(promotion.max_discount));
  return { promotion, discount: round(Math.min(subtotal, Math.max(0, capped))) };
}

export async function calculateTaxiQuote(input: TaxiQuoteInput) {
  const hasCoordinates = [input.pickupLat, input.pickupLng, input.dropoffLat, input.dropoffLng].every(Number.isFinite);
  const directKm = hasCoordinates
    ? haversineKm(input.pickupLat!, input.pickupLng!, input.dropoffLat!, input.dropoffLng!) * MODEL.roadFactor
    : 5.2;
  const distanceKm = round(Math.max(1.2, directKm + input.intermediateStops.length * 2.2));
  const durationMinutes = Math.max(5, Math.round(distanceKm / MODEL.averageUrbanSpeedKmh * 60 + 5 + input.intermediateStops.length * 7));
  const baseFare = MODEL.baseFare;
  const distanceFare = round(distanceKm * MODEL.perKm);
  const timeFare = round(durationMinutes * MODEL.perMinute);
  const airportSupplement = airport(input.pickupAddress) || airport(input.dropoffAddress) ? MODEL.airportSupplement : 0;
  const stopSupplement = round(input.intermediateStops.length * MODEL.stopSupplement);
  const luggageSupplement = input.requirements.largeLuggage ? MODEL.luggageSupplement : 0;
  const petSupplement = input.requirements.pet ? MODEL.petSupplement : 0;
  const childSeatSupplement = input.requirements.childSeat ? MODEL.childSeatSupplement : 0;
  const categoryMultiplier = MODEL.categoryMultipliers[input.category];
  const tariffPeriod = madridTariffPeriod(input.requestedAt);
  const nightMultiplier = tariffPeriod.isNightOrWeekend ? MODEL.nightMultiplier : 1;
  const beforeMultipliers = baseFare + distanceFare + timeFare + MODEL.bookingFee + airportSupplement + stopSupplement + luggageSupplement + petSupplement + childSeatSupplement;
  const subtotal = round(Math.max(MODEL.minimumFare, beforeMultipliers * categoryMultiplier * nightMultiplier));
  const promo = await promotionFor(input, subtotal);
  const discount = promo?.discount || 0;
  const total = round(Math.max(0, subtotal - discount));

  return {
    version: MODEL.version,
    quotedAt: new Date().toISOString(),
    subtotal,
    discount,
    total,
    lowerFare: round(total * 0.9),
    upperFare: round(total * 1.12),
    distanceKm,
    durationMinutes,
    promoCode: promo?.promotion.code || null,
    promotionId: promo?.promotion.id || null,
    breakdown: {
      baseFare,
      distanceFare,
      timeFare,
      bookingFee: MODEL.bookingFee,
      airportSupplement,
      stopSupplement,
      luggageSupplement,
      petSupplement,
      childSeatSupplement,
      categoryMultiplier,
      nightMultiplier,
      tariffTimeZone: MARKET_TIME_ZONE,
      tariffLocalHour: tariffPeriod.hour,
      tariffWeekday: tariffPeriod.weekday,
      accessibilitySupplement: 0,
      discount,
      category: input.category,
      stops: input.intermediateStops.length,
    },
  };
}
