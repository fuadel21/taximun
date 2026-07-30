import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const categorySchema = z.enum(["standard", "comfort", "van", "accessible"]);
const paymentSchema = z.enum(["cash", "card", "bizum"]);
const placeTypeSchema = z.enum(["home", "work", "favorite"]);
const stopSchema = z.object({
  address: z.string().trim().min(2).max(220),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
const requirementsSchema = z.object({
  wheelchair: z.boolean().default(false),
  largeLuggage: z.boolean().default(false),
  pet: z.boolean().default(false),
  childSeat: z.boolean().default(false),
  hearingAssistance: z.boolean().default(false),
  visualAssistance: z.boolean().default(false),
  reducedMobility: z.boolean().default(false),
  notes: z.string().max(500).default(""),
});

const bookingPayloadSchema = z.object({
  pickupAddress: z.string().trim().min(2).max(220),
  dropoffAddress: z.string().trim().min(2).max(220),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  category: categorySchema,
  paymentMethod: paymentSchema,
  intermediateStops: z.array(stopSchema).max(2).default([]),
  requirements: requirementsSchema.default({}),
  estimatedFare: z.number().min(0),
  fareRangeMin: z.number().min(0).optional(),
  fareRangeMax: z.number().min(0).optional(),
  estimatedDuration: z.number().int().min(0),
  distanceKm: z.number().min(0),
  fareBreakdown: z.record(z.unknown()).default({}),
});

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

function serviceTypeForCategory(category: z.infer<typeof categorySchema>) {
  if (category === "van" || category === "accessible") return "van";
  if (category === "comfort") return "eco";
  return "taxi";
}

export const taxiPassengerBookingRouter = router({
  listSavedPlaces: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx);
    const { data, error } = await supabase
      .from("taxi_saved_places")
      .select("*")
      .eq("user_id", ctx.user.openId)
      .order("place_type", { ascending: true })
      .order("updated_at", { ascending: false });
    throwIfError(error);
    return data ?? [];
  }),

  savePlace: protectedProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      placeType: placeTypeSchema,
      label: z.string().trim().min(1).max(80),
      address: z.string().trim().min(2).max(220),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const payload = {
        user_id: ctx.user.openId,
        place_type: input.placeType,
        label: input.label,
        address: input.address,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        updated_at: new Date().toISOString(),
      };

      const query = input.id
        ? supabase.from("taxi_saved_places").update(payload).eq("id", input.id).eq("user_id", ctx.user.openId)
        : supabase.from("taxi_saved_places").upsert(payload, { onConflict: "user_id,place_type,label" });
      const { data, error } = await query.select().single();
      throwIfError(error);
      return data;
    }),

  deletePlace: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const { error } = await supabase
        .from("taxi_saved_places")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.user.openId);
      throwIfError(error);
      return { success: true };
    }),

  createImmediate: protectedProcedure
    .input(bookingPayloadSchema)
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const { data: active } = await supabase
        .from("taxi_rides")
        .select("id")
        .eq("passenger_id", ctx.user.openId)
        .in("status", ["pending", "assigned", "in_progress"])
        .limit(1)
        .maybeSingle();
      if (active) throw new TRPCError({ code: "CONFLICT", message: "Ya tienes un viaje activo." });

      const { data, error } = await supabase
        .from("taxi_rides")
        .insert({
          passenger_id: ctx.user.openId,
          passenger_name: ctx.user.name || "Pasajero",
          pickup_address: input.pickupAddress,
          dropoff_address: input.dropoffAddress,
          pickup_lat: input.pickupLat ?? null,
          pickup_lng: input.pickupLng ?? null,
          dropoff_lat: input.dropoffLat ?? null,
          dropoff_lng: input.dropoffLng ?? null,
          estimated_fare: input.estimatedFare,
          fare_range_min: input.fareRangeMin ?? null,
          fare_range_max: input.fareRangeMax ?? null,
          estimated_duration: input.estimatedDuration,
          distance_km: input.distanceKm,
          payment_method: input.paymentMethod,
          service_type: serviceTypeForCategory(input.category),
          service_category: input.category,
          intermediate_stops: input.intermediateStops,
          passenger_requirements: input.requirements,
          fare_breakdown: input.fareBreakdown,
          status: "pending",
        })
        .select()
        .single();
      throwIfError(error);
      return data;
    }),

  createScheduled: protectedProcedure
    .input(bookingPayloadSchema.extend({ scheduledAt: z.string().datetime() }))
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
      }

      const { data, error } = await supabase
        .from("taxi_scheduled_bookings")
        .insert({
          passenger_id: ctx.user.openId,
          passenger_name: ctx.user.name || "Pasajero",
          pickup_address: input.pickupAddress,
          dropoff_address: input.dropoffAddress,
          pickup_lat: input.pickupLat ?? null,
          pickup_lng: input.pickupLng ?? null,
          dropoff_lat: input.dropoffLat ?? null,
          dropoff_lng: input.dropoffLng ?? null,
          scheduled_at: scheduledAt.toISOString(),
          service_category: input.category,
          payment_method: input.paymentMethod,
          intermediate_stops: input.intermediateStops,
          passenger_requirements: input.requirements,
          fare_breakdown: input.fareBreakdown,
          estimated_fare: input.estimatedFare,
          fare_range_min: input.fareRangeMin ?? null,
          fare_range_max: input.fareRangeMax ?? null,
          estimated_duration: input.estimatedDuration,
          distance_km: input.distanceKm,
          status: "scheduled",
        })
        .select()
        .single();
      throwIfError(error);
      return data;
    }),

  listScheduled: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx);
    const { data, error } = await supabase
      .from("taxi_scheduled_bookings")
      .select("*")
      .eq("passenger_id", ctx.user.openId)
      .in("status", ["scheduled", "cancelled", "dispatched"])
      .order("scheduled_at", { ascending: true })
      .limit(30);
    throwIfError(error);
    return data ?? [];
  }),

  updateScheduled: protectedProcedure
    .input(bookingPayloadSchema.extend({ id: z.string().uuid(), scheduledAt: z.string().datetime() }))
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt.getTime() < Date.now() + 15 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Programa la reserva con al menos 15 minutos de antelación." });
      }
      const { data, error } = await supabase
        .from("taxi_scheduled_bookings")
        .update({
          pickup_address: input.pickupAddress,
          dropoff_address: input.dropoffAddress,
          pickup_lat: input.pickupLat ?? null,
          pickup_lng: input.pickupLng ?? null,
          dropoff_lat: input.dropoffLat ?? null,
          dropoff_lng: input.dropoffLng ?? null,
          scheduled_at: scheduledAt.toISOString(),
          service_category: input.category,
          payment_method: input.paymentMethod,
          intermediate_stops: input.intermediateStops,
          passenger_requirements: input.requirements,
          fare_breakdown: input.fareBreakdown,
          estimated_fare: input.estimatedFare,
          fare_range_min: input.fareRangeMin ?? null,
          fare_range_max: input.fareRangeMax ?? null,
          estimated_duration: input.estimatedDuration,
          distance_km: input.distanceKm,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("passenger_id", ctx.user.openId)
        .eq("status", "scheduled")
        .select()
        .maybeSingle();
      throwIfError(error);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede editar." });
      return data;
    }),

  cancelScheduled: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const { data, error } = await supabase
        .from("taxi_scheduled_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("passenger_id", ctx.user.openId)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      throwIfError(error);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "La reserva ya no se puede cancelar." });
      return { success: true };
    }),
});
