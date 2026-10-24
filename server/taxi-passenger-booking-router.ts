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
  category: categorySchema, paymentMethod: paymentSchema, intermediateStops: z.array(stopSchema).max(2).default([]), requirements: requirementsSchema.default(() => ({ wheelchair: false, largeLuggage: false, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "" })),
  promoCode: z.string().trim().max(40).optional(),
});

type BookingInput = z.infer<typeof bookingPayloadSchema>;
type CommitOperation = "create_immediate" | "create_scheduled" | "update_scheduled";

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
async function quoteFor(ctx: any, input: BookingInput, requestedAt: Date, excludeScheduledBookingId?: string) {
  return calculateTaxiQuote({
    passengerId: ctx.user.openId, pickupAddress: input.pickupAddress, dropoffAddress: input.dropoffAddress,
    pickupLat: input.pickupLat, pickupLng: input.pickupLng, dropoffLat: input.dropoffLat, dropoffLng: input.dropoffLng,
    category: input.category, intermediateStops: input.intermediateStops, requirements: input.requirements, requestedAt, promoCode: input.promoCode,
    excludeScheduledBookingId,
  });
}
function commitError(message: string): TRPCError {
  if (message.includes("ACTIVE_RIDE_EXISTS")) return new TRPCError({ code: "CONFLICT", message: "Ya tienes un viaje activo." });
  if (message.includes("SCHEDULED_TOO_SOON")) return new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
  if (message.includes("BOOKING_NOT_EDITABLE") || message.includes("BOOKING_TARGET_REQUIRED")) return new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede editar." });
  if (message.includes("PROMOTION_TOTAL_LIMIT_REACHED")) return new TRPCError({ code: "CONFLICT", message: "El código promocional ha agotado sus usos." });
  if (message.includes("PROMOTION_USER_LIMIT_REACHED")) return new TRPCError({ code: "CONFLICT", message: "Ya has utilizado este código el máximo de veces permitido." });
  if (message.includes("PROMOTION_NOT_ACTIVE")) return new TRPCError({ code: "CONFLICT", message: "El código promocional ya no está activo." });
  if (message.includes("PROMOTION_CATEGORY_NOT_ELIGIBLE")) return new TRPCError({ code: "BAD_REQUEST", message: "El código no es válido para esta categoría." });
  if (message.includes("PROMOTION_MINIMUM_NOT_MET")) return new TRPCError({ code: "BAD_REQUEST", message: "El viaje no alcanza el importe mínimo de la promoción." });
  if (message.includes("PROMOTION_TARGET_NOT_OWNED") || message.includes("PROMOTION_TARGET_INVALID")) return new TRPCError({ code: "CONFLICT", message: "No se pudo vincular la promoción con esta reserva." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo guardar la reserva de forma segura." });
}
function atomicPayload(ctx: any, input: BookingInput, quote: any, scheduledAt?: Date) {
  return {
    passenger_id: ctx.user.openId,
    passenger_name: ctx.user.name || "Pasajero",
    pickup_address: input.pickupAddress,
    dropoff_address: input.dropoffAddress,
    pickup_lat: input.pickupLat ?? null,
    pickup_lng: input.pickupLng ?? null,
    dropoff_lat: input.dropoffLat ?? null,
    dropoff_lng: input.dropoffLng ?? null,
    scheduled_at: scheduledAt?.toISOString() ?? null,
    payment_method: input.paymentMethod,
    service_type: serviceType(input.category),
    service_category: input.category,
    intermediate_stops: input.intermediateStops,
    passenger_requirements: input.requirements,
    fare_breakdown: quote.breakdown,
    fare_subtotal: quote.subtotal,
    estimated_duration: quote.durationMinutes,
    distance_km: quote.distanceKm,
    quote_version: quote.version,
    quoted_at: quote.quotedAt,
  };
}
async function commitBooking(operation: CommitOperation, ctx: any, input: BookingInput, quote: any, scheduledAt?: Date, targetId?: string) {
  const { data, error } = await supabase.rpc("taximun_commit_priced_booking", {
    p_operation: operation,
    p_payload: atomicPayload(ctx, input, quote, scheduledAt),
    p_promotion_id: quote.promotionId ?? null,
    p_target_id: targetId ?? null,
  });
  if (error) throw commitError(error.message);
  if (!data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se recibió la reserva guardada." });
  return data;
}

export const taxiPassengerBookingRouter = router({
  quote: protectedProcedure.input(bookingPayloadSchema.extend({
    scheduledAt: z.string().datetime().optional(),
    editingBookingId: z.string().uuid().optional(),
  })).query(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const requestedAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (input.scheduledAt && requestedAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    if (input.editingBookingId) {
      const { data: owned, error } = await supabase.from("taxi_scheduled_bookings").select("id").eq("id", input.editingBookingId).eq("passenger_id", ctx.user.openId).eq("status", "scheduled").maybeSingle();
      fail(error);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede editar." });
    }
    return quoteFor(ctx, input, requestedAt, input.editingBookingId);
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
    const quote = await quoteFor(ctx, input, new Date());
    return commitBooking("create_immediate", ctx, input, quote);
  }),

  createScheduled: protectedProcedure.input(bookingPayloadSchema.extend({ scheduledAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    const quote = await quoteFor(ctx, input, scheduledAt);
    return commitBooking("create_scheduled", ctx, input, quote, scheduledAt);
  }),

  listScheduled: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx); const { data, error } = await supabase.from("taxi_scheduled_bookings").select("*").eq("passenger_id", ctx.user.openId).in("status", ["scheduled", "cancelled", "dispatched"]).order("scheduled_at").limit(30); fail(error); return data ?? [];
  }),

  updateScheduled: protectedProcedure.input(bookingPayloadSchema.extend({ id: z.string().uuid(), scheduledAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
    const quote = await quoteFor(ctx, input, scheduledAt, input.id);
    return commitBooking("update_scheduled", ctx, input, quote, scheduledAt, input.id);
  }),

  cancelScheduled: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    assertPassenger(ctx);
    const { data, error } = await supabase.rpc("taximun_cancel_scheduled_booking", {
      p_booking_id: input.id,
      p_passenger_id: ctx.user.openId,
    });
    if (error) {
      if (error.message.includes("BOOKING_NOT_CANCELLABLE")) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede cancelar." });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo cancelar la reserva de forma segura." });
    }
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede cancelar." });
    return { success: true };
  }),
});
