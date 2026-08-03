import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { calculateTaxiQuote } from "./taxi-pricing";
import { supabase } from "./supabase-client";

const categorySchema = z.enum(["standard", "comfort", "van", "accessible"]);
const paymentSchema = z.enum(["cash", "card", "bizum"]);
const placeTypeSchema = z.enum(["home", "work", "favorite"]);
const stopSchema = z.object({ address: z.string().trim().min(2).max(220), lat: z.number().optional(), lng: z.number().optional() });
const requirementsSchema = z.object({
  wheelchair: z.boolean().default(false), largeLuggage: z.boolean().default(false), pet: z.boolean().default(false), childSeat: z.boolean().default(false),
  hearingAssistance: z.boolean().default(false), visualAssistance: z.boolean().default(false), reducedMobility: z.boolean().default(false), notes: z.string().max(500).default(""),
});
const bookingPayloadSchema = z.object({
  pickupAddress: z.string().trim().min(2).max(220), dropoffAddress: z.string().trim().min(2).max(220),
  pickupLat: z.number().optional(), pickupLng: z.number().optional(), dropoffLat: z.number().optional(), dropoffLng: z.number().optional(),
  category: categorySchema, paymentMethod: paymentSchema, intermediateStops: z.array(stopSchema).max(2).default([]), requirements: requirementsSchema.default({}),
  promoCode: z.string().trim().max(40).optional(),
});

type BookingInput = z.infer<typeof bookingPayloadSchema>;

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
}
function fail(error: { message: string; code?: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}
function serviceType(category: BookingInput["category"]) {
  if (category === "van" || category === "accessible") return "van";
  if (category === "comfort") return "eco";
  return "taxi";
}
async function quoteFor(ctx: any, input: BookingInput, requestedAt: Date) {
  return calculateTaxiQuote({
    passengerId: ctx.user.openId, pickupAddress: input.pickupAddress, dropoffAddress: input.dropoffAddress,
    pickupLat: input.pickupLat, pickupLng: input.pickupLng, dropoffLat: input.dropoffLat, dropoffLng: input.dropoffLng,
    category: input.category, intermediateStops: input.intermediateStops, requirements: input.requirements, requestedAt, promoCode: input.promoCode,
  });
}
async function recordRedemption(quote: any, passengerId: string, target: { rideId?: string; scheduledBookingId?: string }) {
  if (!quote.promotionId || !quote.discount) return;
  const { error } = await supabase.from("taxi_promotion_redemptions").insert({
    promotion_id: quote.promotionId, passenger_id: passengerId, ride_id: target.rideId ?? null,
    scheduled_booking_id: target.scheduledBookingId ?? null, subtotal: quote.subtotal, discount_amount: quote.discount,
  });
  fail(error);
}
function pricedFields(quote: any) {
  return {
    estimated_fare: quote.total, fare_subtotal: quote.subtotal, fare_range_min: quote.lowerFare, fare_range_max: quote.upperFare,
    estimated_duration: quote.durationMinutes, distance_km: quote.distanceKm, fare_breakdown: quote.breakdown,
    promo_code: quote.promoCode, promo_discount: quote.discount, quote_version: quote.version, quoted_at: quote.quotedAt,
  };
}

export const taxiPassengerBookingRouter = router({
  quote: protectedProcedure.input(bookingPayloadSchema.extend({ scheduledAt: z.string().datetime().optional() })).query(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const requestedAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (input.scheduledAt && requestedAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    return quoteFor(ctx, input, requestedAt);
  }),

  listSavedPlaces: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx);
    const { data, error } = await supabase.from("taxi_saved_places").select("*").eq("user_id", ctx.user.openId).order("place_type").order("updated_at", { ascending: false });
    fail(error); return data ?? [];
  }),
  savePlace: protectedProcedure.input(z.object({ id: z.string().uuid().optional(), placeType: placeTypeSchema, label: z.string().trim().min(1).max(80), address: z.string().trim().min(2).max(220), lat: z.number().optional(), lng: z.number().optional() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const payload = { user_id: ctx.user.openId, place_type: input.placeType, label: input.label, address: input.address, lat: input.lat ?? null, lng: input.lng ?? null, updated_at: new Date().toISOString() };
    const query = input.id ? supabase.from("taxi_saved_places").update(payload).eq("id", input.id).eq("user_id", ctx.user.openId) : supabase.from("taxi_saved_places").upsert(payload, { onConflict: "user_id,place_type,label" });
    const { data, error } = await query.select().single(); fail(error); return data;
  }),
  deletePlace: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx); const { error } = await supabase.from("taxi_saved_places").delete().eq("id", input.id).eq("user_id", ctx.user.openId); fail(error); return { success: true };
  }),

  createImmediate: protectedProcedure.input(bookingPayloadSchema).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const { data: active, error: activeError } = await supabase.from("taxi_rides").select("id").eq("passenger_id", ctx.user.openId).in("status", ["pending", "assigned", "in_progress"]).limit(1).maybeSingle();
    fail(activeError); if (active) throw new TRPCError({ code: "CONFLICT", message: "Ya tienes un viaje activo." });
    const quote = await quoteFor(ctx, input, new Date());
    const { data, error } = await supabase.from("taxi_rides").insert({
      passenger_id: ctx.user.openId, passenger_name: ctx.user.name || "Pasajero", pickup_address: input.pickupAddress, dropoff_address: input.dropoffAddress,
      pickup_lat: input.pickupLat ?? null, pickup_lng: input.pickupLng ?? null, dropoff_lat: input.dropoffLat ?? null, dropoff_lng: input.dropoffLng ?? null,
      payment_method: input.paymentMethod, service_type: serviceType(input.category), service_category: input.category,
      intermediate_stops: input.intermediateStops, passenger_requirements: input.requirements, status: "pending", ...pricedFields(quote),
    }).select().single();
    fail(error);
    try { await recordRedemption(quote, ctx.user.openId, { rideId: data.id }); } catch (redemptionError) { await supabase.from("taxi_rides").delete().eq("id", data.id).eq("status", "pending"); throw redemptionError; }
    return data;
  }),

  createScheduled: protectedProcedure.input(bookingPayloadSchema.extend({ scheduledAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx); const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    const quote = await quoteFor(ctx, input, scheduledAt);
    const { data, error } = await supabase.from("taxi_scheduled_bookings").insert({
      passenger_id: ctx.user.openId, passenger_name: ctx.user.name || "Pasajero", pickup_address: input.pickupAddress, dropoff_address: input.dropoffAddress,
      pickup_lat: input.pickupLat ?? null, pickup_lng: input.pickupLng ?? null, dropoff_lat: input.dropoffLat ?? null, dropoff_lng: input.dropoffLng ?? null,
      scheduled_at: scheduledAt.toISOString(), service_category: input.category, payment_method: input.paymentMethod,
      intermediate_stops: input.intermediateStops, passenger_requirements: input.requirements, status: "scheduled", ...pricedFields(quote),
    }).select().single();
    fail(error);
    try { await recordRedemption(quote, ctx.user.openId, { scheduledBookingId: data.id }); } catch (redemptionError) { await supabase.from("taxi_scheduled_bookings").delete().eq("id", data.id).eq("status", "scheduled"); throw redemptionError; }
    return data;
  }),

  listScheduled: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx); const { data, error } = await supabase.from("taxi_scheduled_bookings").select("*").eq("passenger_id", ctx.user.openId).in("status", ["scheduled", "cancelled", "dispatched"]).order("scheduled_at").limit(30); fail(error); return data ?? [];
  }),

  updateScheduled: protectedProcedure.input(bookingPayloadSchema.extend({ id: z.string().uuid(), scheduledAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx); const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    const quote = await quoteFor(ctx, input, scheduledAt);
    const { data, error } = await supabase.from("taxi_scheduled_bookings").update({
      pickup_address: input.pickupAddress, dropoff_address: input.dropoffAddress, pickup_lat: input.pickupLat ?? null, pickup_lng: input.pickupLng ?? null,
      dropoff_lat: input.dropoffLat ?? null, dropoff_lng: input.dropoffLng ?? null, scheduled_at: scheduledAt.toISOString(), service_category: input.category,
      payment_method: input.paymentMethod, intermediate_stops: input.intermediateStops, passenger_requirements: input.requirements, ...pricedFields(quote), updated_at: new Date().toISOString(),
    }).eq("id", input.id).eq("passenger_id", ctx.user.openId).eq("status", "scheduled").select().maybeSingle();
    fail(error); if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede editar." });
    await supabase.from("taxi_promotion_redemptions").delete().eq("scheduled_booking_id", data.id);
    try { await recordRedemption(quote, ctx.user.openId, { scheduledBookingId: data.id }); } catch (redemptionError) { throw redemptionError; }
    return data;
  }),

  cancelScheduled: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx); const { data, error } = await supabase.from("taxi_scheduled_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", input.id).eq("passenger_id", ctx.user.openId).eq("status", "scheduled").select("id").maybeSingle();
    fail(error); if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede cancelar." });
    await supabase.from("taxi_promotion_redemptions").delete().eq("scheduled_booking_id", data.id); return { success: true };
  }),
});
