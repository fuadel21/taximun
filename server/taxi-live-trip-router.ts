import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

async function loadDriverStatus(driverId: string | null) {
  if (!driverId) return null;
  const { data, error } = await supabase
    .from("driver_live_status")
    .select("driver_id,driver_name,taxi_code,plate,current_lat,current_lng,current_zone,status,updated_at")
    .eq("driver_id", driverId)
    .maybeSingle();
  throwIfSupabaseError(error);
  return data ?? null;
}

export const taxiLiveTripRouter = router({
  driver: router({
    markArrived: protectedProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("taxi_rides")
          .update({ driver_arrived_at: now })
          .eq("id", input.rideId)
          .eq("driver_id", ctx.user.openId)
          .eq("status", "assigned")
          .is("driver_arrived_at", null)
          .select("id,passenger_id,driver_name,taxi_code,plate,driver_arrived_at")
          .single();

        throwIfSupabaseError(error);

        await createTaxiNotification({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: ctx.user?.role === "admin" ? "admin" : "driver",
          type: "success",
          title: "Tu taxi ha llegado",
          body: `${data.driver_name || "Tu conductor"} ya está en el punto de recogida. Taxi ${data.taxi_code || ""} · ${data.plate || ""}.`,
          actionUrl: "/passenger/rides",
          metadata: { rideId: data.id, phase: "driver_arrived" },
        });

        return data;
      }),
  }),

  passenger: router({
    getLiveTrip: protectedProcedure.query(async ({ ctx }) => {
      assertPassenger(ctx);
      const { data: ride, error } = await supabase
        .from("taxi_rides")
        .select("id,status,driver_id,driver_name,taxi_code,plate,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,assigned_at,driver_arrived_at,started_at,completed_at,share_token,share_enabled")
        .eq("passenger_id", ctx.user.openId)
        .in("status", ["assigned", "in_progress"])
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwIfSupabaseError(error);
      if (!ride) return null;

      const driver = await loadDriverStatus(ride.driver_id);
      const phase = ride.status === "in_progress"
        ? "in_progress"
        : ride.driver_arrived_at
          ? "driver_arrived"
          : "driver_approaching";

      return { ride, driver, phase };
    }),
  }),

  public: router({
    getSharedTrip: publicProcedure
      .input(z.object({ token: z.string().uuid() }))
      .query(async ({ input }) => {
        const { data: ride, error } = await supabase
          .from("taxi_rides")
          .select("id,status,driver_id,driver_name,taxi_code,plate,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,assigned_at,driver_arrived_at,started_at,completed_at,share_enabled")
          .eq("share_token", input.token)
          .eq("share_enabled", true)
          .maybeSingle();
        throwIfSupabaseError(error);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Enlace de seguimiento no disponible." });

        const driver = await loadDriverStatus(ride.driver_id);
        const phase = ride.status === "completed"
          ? "completed"
          : ride.status === "in_progress"
            ? "in_progress"
            : ride.driver_arrived_at
              ? "driver_arrived"
              : "driver_approaching";

        return { ride, driver, phase };
      }),
  }),
});
