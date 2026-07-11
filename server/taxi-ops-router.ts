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
const paymentMethodSchema = z.enum(["cash", "card", "bizum"]);

type DriverOperationState = {
  canOperate: boolean;
  message: string;
  verificationStatus: string;
  isVerified: boolean;
};

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function throwDriverBlocked(message: string) {
  throw new TRPCError({ code: "FORBIDDEN", message });
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

async function getDriverOperationState(driverId: string): Promise<DriverOperationState> {
  const { data: canOperate, error: canOperateError } = await supabase.rpc("taximun_driver_can_operate", {
    p_driver_id: driverId,
  });
  throwIfSupabaseError(canOperateError);

  const { data: profile, error: profileError } = await supabase
    .from("taxi_user_profiles")
    .select("is_verified,verification_status,verification_note")
    .eq("user_id", driverId)
    .eq("role", "driver")
    .maybeSingle();
  throwIfSupabaseError(profileError);

  if (canOperate === true) {
    return {
      canOperate: true,
      message: "Conductor verificado y autorizado para operar.",
      verificationStatus: String(profile?.verification_status ?? "approved"),
      isVerified: true,
    };
  }

  const { data: message, error: messageError } = await supabase.rpc("taximun_driver_operation_message", {
    p_driver_id: driverId,
  });
  throwIfSupabaseError(messageError);

  return {
    canOperate: false,
    message: String(profile?.verification_note || message || "Tu cuenta de conductor todavía no está verificada."),
    verificationStatus: String(profile?.verification_status ?? "missing"),
    isVerified: Boolean(profile?.is_verified),
  };
}

async function assertDriverCanOperate(driverId: string) {
  const state = await getDriverOperationState(driverId);
  if (!state.canOperate) {
    throwDriverBlocked(state.message);
  }
  return state;
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

async function notifyUser(input: {
  recipientId: string;
  recipientRole: "passenger" | "driver" | "admin" | "user";
  actorId?: string | null;
  actorRole?: "passenger" | "driver" | "admin" | "system";
  type?: "info" | "success" | "warning" | "error";
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!input.recipientId) return;

  const { error } = await supabase.from("taxi_notifications").insert({
    recipient_id: input.recipientId,
    recipient_role: input.recipientRole,
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? "system",
    type: input.type ?? "info",
    title: input.title,
    body: input.body ?? null,
    action_url: input.actionUrl ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("Taximun notification skipped", { title: input.title, message: error.message });
  }
}

function actorRole(ctx: any): "passenger" | "driver" | "admin" {
  if (ctx.user?.role === "admin") return "admin";
  if (ctx.user?.role === "driver") return "driver";
  return "passenger";
}

function statusTitle(status: string) {
  if (status === "assigned") return "Taxi asignado";
  if (status === "in_progress") return "Viaje iniciado";
  if (status === "completed") return "Viaje finalizado";
  if (status === "cancelled") return "Viaje cancelado";
  if (status === "rejected") return "Viaje rechazado";
  return "Estado del viaje actualizado";
}

function throwAcceptRideError(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");

  if (message.includes("DRIVER_NOT_VERIFIED")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tu cuenta de conductor todavía no está verificada." });
  }

  if (message.includes("DRIVER_ALREADY_HAS_ACTIVE_RIDE") || message.includes("DRIVER_IS_BUSY")) {
    throw new TRPCError({ code: "CONFLICT", message: "Ya tienes un servicio activo o estás marcado como ocupado." });
  }

  if (message.includes("RIDE_NOT_FOUND")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "El viaje ya no existe." });
  }

  if (message.includes("RIDE_NOT_AVAILABLE")) {
    throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya fue aceptado o ya no está disponible." });
  }

  if (message.includes("DRIVER_ALREADY_REJECTED_RIDE")) {
    throw new TRPCError({ code: "CONFLICT", message: "Ya habías rechazado este servicio." });
  }

  if (message.includes("DRIVER_CANNOT_ACCEPT_OWN_RIDE")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No puedes aceptar tu propio viaje." });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
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
          paymentMethod: paymentMethodSchema.default("cash"),
          serviceType: serviceTypeSchema.default("taxi"),
          fareRangeMin: z.number().min(0).optional(),
          fareRangeMax: z.number().min(0).optional(),
          fareBreakdown: z.record(z.unknown()).default({}),
        })
      )
      .mutation(async ({ ctx, input }) => {
        assertPassenger(ctx);

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
            estimated_duration: input.estimatedDuration,
            distance_km: input.distanceKm,
            payment_method: input.paymentMethod,
            service_type: input.serviceType,
            fare_range_min: input.fareRangeMin ?? null,
            fare_range_max: input.fareRangeMax ?? null,
            fare_breakdown: input.fareBreakdown ?? {},
            status: "pending",
          })
          .select()
          .single();

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: `Taxi solicitado (${input.serviceType})`,
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
    getOperationalStatus: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);
      return getDriverOperationState(ctx.user.openId);
    }),

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

        if (input.status !== "offline") {
          await assertDriverCanOperate(ctx.user.openId);
        }

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

      const operationState = await getDriverOperationState(ctx.user.openId);
      if (!operationState.canOperate) return [];

      const { data, error } = await supabase.rpc("taximun_find_pending_rides_for_driver", {
        p_driver_id: ctx.user.openId,
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
        await assertDriverCanOperate(ctx.user.openId);

        const { data, error } = await supabase.rpc("taximun_accept_ride_transactional", {
          p_ride_id: input.rideId,
          p_driver_id: ctx.user.openId,
          p_driver_name: ctx.user.name || "Conductor",
          p_taxi_code: input.taxiCode,
          p_plate: input.plate,
        });

        throwAcceptRideError(error);

        if (!data) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo aceptar el viaje." });
        }

        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje aceptado por conductor",
          rideId: input.rideId,
        });

        await notifyUser({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          type: "success",
          title: "Taxi asignado",
          body: `${data.driver_name || ctx.user.name || "Tu conductor"} ha aceptado tu viaje. Taxi ${data.taxi_code || input.taxiCode} · matrícula ${data.plate || input.plate}.`,
          actionUrl: "/passenger",
          metadata: {
            rideId: data.id,
            status: data.status,
            taxiCode: data.taxi_code || input.taxiCode,
            plate: data.plate || input.plate,
          },
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

        await notifyUser({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          type: "info",
          title: "Viaje iniciado",
          body: `Tu viaje hacia ${data.dropoff_address || "tu destino"} ha comenzado.`,
          actionUrl: "/passenger",
          metadata: { rideId: data.id, status: data.status },
        });

        return data;
      }),

    rejectRide: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);

        const { data: ride, error: rideError } = await supabase
          .from("taxi_rides")
          .select("*")
          .eq("id", input.rideId)
          .eq("status", "pending")
          .maybeSingle();

        throwIfSupabaseError(rideError);

        if (!ride) {
          throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya no está disponible." });
        }

        const { error } = await supabase
          .from("taxi_ride_rejections")
          .upsert(
            {
              ride_id: input.rideId,
              driver_id: ctx.user.openId,
              reason: "driver_declined",
            },
            { onConflict: "ride_id,driver_id" }
          );

        throwIfSupabaseError(error);
        await logActivity({
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          message: "Viaje descartado por conductor",
          rideId: input.rideId,
        });

        return ride;
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

        await notifyUser({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: actorRole(ctx),
          type: "success",
          title: "Viaje finalizado",
          body: `Tu viaje ha finalizado. Importe estimado: ${fare.toFixed(2)} €.`,
          actionUrl: "/passenger",
          metadata: { rideId: data.id, status: data.status, estimatedFare: fare },
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

        await notifyUser({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: "admin",
          type: input.status === "cancelled" || input.status === "rejected" ? "warning" : input.status === "completed" ? "success" : "info",
          title: statusTitle(input.status),
          body: `El estado de tu viaje cambió a ${input.status}.`,
          actionUrl: "/passenger",
          metadata: { rideId: data.id, status: data.status },
        });

        return data;
      }),
  }),
});
