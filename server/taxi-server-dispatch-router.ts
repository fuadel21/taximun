import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function assertPassengerOrAdmin(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

async function runDispatch(rideId: string, offerSeconds = 25) {
  const { data, error } = await supabase.rpc("taximun_server_dispatch", {
    p_ride_id: rideId,
    p_offer_seconds: offerSeconds,
  });

  throwIfSupabaseError(error);
  return data ?? { ok: false, code: "EMPTY_RESPONSE", rideId };
}

export const taxiServerDispatchRouter = router({
  passenger: router({
    dispatchMine: protectedProcedure
      .input(z.object({ offerSeconds: z.number().int().min(10).max(90).default(25) }).optional())
      .mutation(async ({ ctx, input }) => {
        assertPassengerOrAdmin(ctx);

        const { data: ride, error } = await supabase
          .from("taxi_rides")
          .select("id,status,driver_id")
          .eq("passenger_id", ctx.user.openId)
          .eq("status", "pending")
          .is("driver_id", null)
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        throwIfSupabaseError(error);

        if (!ride) {
          return { ok: false, code: "NO_PENDING_RIDE" };
        }

        return runDispatch(ride.id, input?.offerSeconds ?? 25);
      }),
  }),

  admin: router({
    dispatchRide: adminProcedure
      .input(
        z.object({
          rideId: z.string().uuid(),
          offerSeconds: z.number().int().min(10).max(90).default(25),
        }),
      )
      .mutation(async ({ input }) => runDispatch(input.rideId, input.offerSeconds)),

    /**
     * Ejecuta el procesador de reservas programadas (recordatorios 24h/2h/30m
     * y conversión a viaje 15 minutos antes). En producción lo lanza pg_cron
     * cada 5 minutos; aquí se puede forzar a mano desde el panel de operaciones.
     */
    processScheduledBookings: adminProcedure.mutation(async () => {
      const { data, error } = await supabase.rpc("taximun_process_scheduled_bookings", {});
      throwIfSupabaseError(error);
      return data ?? { reminders_24h: 0, reminders_2h: 0, reminders_30m: 0, rides_dispatched: 0, rides_deferred: 0 };
    }),

    dispatchPendingBatch: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
      .mutation(async ({ input }) => {
        const { data: rides, error } = await supabase
          .from("taxi_rides")
          .select("id")
          .eq("status", "pending")
          .is("driver_id", null)
          .order("requested_at", { ascending: true })
          .limit(input?.limit ?? 20);

        throwIfSupabaseError(error);

        const results = [];
        for (const ride of rides ?? []) {
          results.push(await runDispatch(ride.id));
        }

        return {
          processed: results.length,
          created: results.filter((item: any) => item?.code === "OFFER_CREATED").length,
          noDriver: results.filter((item: any) => item?.code === "NO_DRIVER_AVAILABLE").length,
          results,
        };
      }),

    metrics: adminProcedure
      .input(z.object({ hours: z.number().int().min(1).max(720).default(24) }).optional())
      .query(async ({ input }) => {
        const since = new Date(Date.now() - (input?.hours ?? 24) * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("taxi_dispatch_decisions")
          .select("result_code,distance_km,estimated_eta_minutes,driver_rating,final_score,candidate_count,algorithm_version,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000);

        throwIfSupabaseError(error);
        const rows = data ?? [];
        const created = rows.filter((row) => row.result_code === "OFFER_CREATED");
        const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

        return {
          since,
          totalDecisions: rows.length,
          offersCreated: created.length,
          noDriverAvailable: rows.filter((row) => row.result_code === "NO_DRIVER_AVAILABLE").length,
          successRate: rows.length ? Number(((created.length / rows.length) * 100).toFixed(2)) : 0,
          averageDistanceKm: Number(average(created.map((row) => Number(row.distance_km || 0))).toFixed(3)),
          averageEtaMinutes: Number(average(created.map((row) => Number(row.estimated_eta_minutes || 0))).toFixed(2)),
          averageCandidates: Number(average(created.map((row) => Number(row.candidate_count || 0))).toFixed(2)),
          algorithmVersion: created[0]?.algorithm_version ?? "smart_dispatch_v1",
          recent: rows.slice(0, 100),
        };
      }),
  }),
});
