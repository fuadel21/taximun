import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const rideStatusSchema = z.enum([
  "pending",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
]);

const driverStatusSchema = z.enum(["available", "busy", "offline"]);
const serviceTypeSchema = z.enum(["taxi", "eco", "van"]);

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function throwMatchingError(error: { message: string } | null) {
  if (!error) return;

  const dictionary: Record<string, string> = {
    DRIVER_NOT_ONLINE: "Primero debes ponerte online para aceptar servicios.",
    DRIVER_NOT_AVAILABLE: "No puedes aceptar este servicio porque no estás disponible.",
    DRIVER_ALREADY_BUSY: "Ya tienes un servicio activo. Finalízalo antes de aceptar otro.",
    DRIVER_REJECTED_RIDE: "Ya rechazaste este servicio.",
    RIDE_NOT_FOUND: "Este servicio ya no existe.",
    RIDE_NOT_PENDING: "Este servicio ya no está disponible.",
    RIDE_ALREADY_TAKEN: "Otro conductor ya aceptó este servicio.",
  };

  const match = Object.keys(dictionary).find((key) => error.message.includes(key));
  throw new TRPCError({
    code: match ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
    message: match ? dictionary[match] : error.message,
  });
}

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

async function logActivity(input: {
  actorId: string;
  actorRole: "passenger" | "driver" | "admin" | "system";
  message: string;
  rideId?: string | null;
}) {
  await supabase.from("taxi_activity_logs").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    message: input.message,
    ride_id: input.rideId ?? null,
  });
}

function actorRole(ctx: any): "passenger" | "driver" | "admin" {
  if (ctx.user?.role === "admin") return "admin";
  if (ctx.user?.role === "driver") return "driver";
  return "passenger";
}

export const taxiOpsRouter = router({
  passenger: router({
    createRide: protectedProcedure
      .input(
        z.object({
          pickupAddress: z.string().min(2),
          dropoffAddress: z.string().min(2),
          pickupLat: z.number().optional(),
          pickupLng: z.number().optional(),
          dropoffLat: z.number().optional(),
          dropoffLng: z.number().optional(),
          estimatedFare: z.number().min(0),
          estimatedDuration: z.number().int().min(0),
          distanceKm: z.number().min(0),
          paymentMethod: z.string().min(2).default("cash"),
          serviceType: serviceTypeSchema.default("taxi"),
          pickupZone: z.string().min(2).default("Barcelona"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertPassenger(ctx);

        const { data, error } = await supabase
          .from("taxi_rides")
          .insert({
            passenger_id: ctx.user.openId,
            passenger_name: ctx.user.name || "Pasajero",
            market_id: "barcelona",
            pickup_zone: input.pickupZone,
            pickup_address: input.pickupAddress,
            dropoff_address: input.dropoffAddress,
            pickup_lat: input.pickupLat ?? null,
            pickup_lng: input.pickupLng ?? null,
            dropoff_lat: input.dropoffLat ?? null,
            dropoff_lng: input.dropoffLng ?? null,
            estimated_fare: input.estimatedFare,
            estimated_duration: input.estimatedDuration,
            distance_km: input.distanceKm,
            payment_method: input.paymentMethod,
            service_type: input.serviceType,
            status: "pending",
          })
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Taxi solicitado",
          rideId: data.id,
        });

        return data;
      }),

    getCurrentRide: protectedProcedure.query(async ({ ctx }) => {
      assertPassenger(ctx);

      const { data, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .eq("passenger_id", ctx.user.openId)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      throwIfSupabaseError(error);
      return data ?? null;
    }),

    getRideHistory: protectedProcedure.query(async ({ ctx }) => {
      assertPassenger(ctx);

      const { data, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .eq("passenger_id", ctx.user.openId)
        .in("status", ["completed", "cancelled", "rejected"])
        .order("requested_at", { ascending: false })
        .limit(30);

      throwIfSupabaseError(error);
      return data ?? [];
    }),

    cancelRide: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertPassenger(ctx);

        const { data, error } = await supabase
          .from("taxi_rides")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", input.rideId)
          .eq("passenger_id", ctx.user.openId)
          .in("status", ["pending", "assigned"])
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje cancelado por pasajero",
          rideId: input.rideId,
        });

        return data;
      }),
  }),

  driver: router({
    upsertStatus: protectedProcedure
      .input(
        z.object({
          status: driverStatusSchema,
          currentLat: z.number().optional(),
          currentLng: z.number().optional(),
          currentZone: z.string().min(2).default("Centro"),
          taxiCode: z.string().min(2).default("TX-000"),
          plate: z.string().min(2).default("SIN-MAT"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data, error } = await supabase
          .from("driver_live_status")
          .upsert({
            driver_id: ctx.user.openId,
            driver_name: ctx.user.name || "Conductor",
            taxi_code: input.taxiCode,
            plate: input.plate,
            status: input.status,
            current_lat: input.currentLat ?? null,
            current_lng: input.currentLng ?? null,
            current_zone: input.currentZone,
          })
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: `Estado conductor: ${input.status}`,
        });

        return data;
      }),

    getStatus: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);

      const { data, error } = await supabase
        .from("driver_live_status")
        .select("*")
        .eq("driver_id", ctx.user.openId)
        .maybeSingle();

      throwIfSupabaseError(error);
      return data ?? null;
    }),

    getPendingRides: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);

      const { data: live, error: liveError } = await supabase
        .from("driver_live_status")
        .select("current_zone")
        .eq("driver_id", ctx.user.openId)
        .maybeSingle();

      throwIfSupabaseError(liveError);

      const { data, error } = await supabase.rpc("taximun_find_pending_rides_for_driver", {
        p_driver_id: ctx.user.openId,
        p_current_zone: live?.current_zone ?? null,
        p_limit: 20,
      });

      throwIfSupabaseError(error);
      return data ?? [];
    }),

    getActiveRide: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);

      const { data, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .eq("driver_id", ctx.user.openId)
        .in("status", ["assigned", "in_progress"])
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      throwIfSupabaseError(error);
      return data ?? null;
    }),

    getRideHistory: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);

      const { data, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .eq("driver_id", ctx.user.openId)
        .in("status", ["completed", "cancelled", "rejected"])
        .order("requested_at", { ascending: false })
        .limit(30);

      throwIfSupabaseError(error);
      return data ?? [];
    }),

    acceptRide: protectedProcedure
      .input(
        z.object({
          rideId: z.string().uuid(),
          taxiCode: z.string().min(2).default("TX-000"),
          plate: z.string().min(2).default("SIN-MAT"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data, error } = await supabase.rpc("taximun_accept_ride", {
          p_ride_id: input.rideId,
          p_driver_id: ctx.user.openId,
          p_driver_name: ctx.user.name || "Conductor",
          p_taxi_code: input.taxiCode,
          p_plate: input.plate,
        });

        throwMatchingError(error);

        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje aceptado por conductor",
          rideId: input.rideId,
        });

        return data;
      }),

    startRide: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data, error } = await supabase
          .from("taxi_rides")
          .update({ status: "in_progress", started_at: new Date().toISOString() })
          .eq("id", input.rideId)
          .eq("driver_id", ctx.user.openId)
          .eq("status", "assigned")
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje iniciado",
          rideId: input.rideId,
        });

        return data;
      }),

    rejectRide: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data, error } = await supabase.rpc("taximun_reject_ride", {
          p_ride_id: input.rideId,
          p_driver_id: ctx.user.openId,
          p_reason: "Conductor no acepta este servicio",
        });

        throwMatchingError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje ocultado para este conductor",
          rideId: input.rideId,
        });

        return data;
      }),

    completeRide: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data, error } = await supabase
          .from("taxi_rides")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", input.rideId)
          .eq("driver_id", ctx.user.openId)
          .in("status", ["assigned", "in_progress"])
          .select()
          .single();

        throwIfSupabaseError(error);

        const fare = Number(data.estimated_fare ?? 0);
        const { data: status } = await supabase
          .from("driver_live_status")
          .select("total_earnings,total_rides")
          .eq("driver_id", ctx.user.openId)
          .maybeSingle();

        await supabase
          .from("driver_live_status")
          .upsert({
            driver_id: ctx.user.openId,
            driver_name: ctx.user.name || "Conductor",
            status: "available",
            total_earnings: Number(status?.total_earnings ?? 0) + fare,
            total_rides: Number(status?.total_rides ?? 0) + 1,
          });

        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje finalizado",
          rideId: input.rideId,
        });

        return data;
      }),
  }),

  activity: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_activity_logs")
      .select("*")
      .eq("actor_id", ctx.user.openId)
      .order("created_at", { ascending: false })
      .limit(20);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  admin: router({
    getAllRides: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(100);

      throwIfSupabaseError(error);
      return data ?? [];
    }),

    updateRideStatus: protectedProcedure
      .input(z.object({ rideId: z.string().uuid(), status: rideStatusSchema }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        const { data, error } = await supabase
          .from("taxi_rides")
          .update({ status: input.status })
          .eq("id", input.rideId)
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: "admin",
          message: `Admin cambió estado a ${input.status}`,
          rideId: input.rideId,
        });
        return data;
      }),
  }),
});
