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

async function runDispatch(rideId: string, offerSeconds = 25, staleSeconds = 120) {
  const { data, error } = await supabase.rpc("taximun_smart_dispatch", {
    p_ride_id: rideId,
    p_offer_seconds: offerSeconds,
    p_stale_seconds: staleSeconds,
  });

  throwIfSupabaseError(error);
  return data ?? { ok: false, code: "EMPTY_RESPONSE", rideId };
}

export const taxiServerDispatchRouter = router({
  passenger: router({
    dispatchMine: protectedProcedure
      .input(
        z
          .object({
            offerSeconds: z.number().int().min(10).max(90).default(25),
            staleSeconds: z.number().int().min(30).max(900).default(120),
          })
          .optional(),
      )
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

        if (!ride) return { ok: false, code: "NO_PENDING_RIDE" };

        return runDispatch(ride.id, input?.offerSeconds ?? 25, input?.staleSeconds ?? 120);
      }),
  }),

  admin: router({
    dispatchRide: adminProcedure
      .input(
        z.object({
          rideId: z.string().uuid(),
          offerSeconds: z.number().int().min(10).max(90).default(25),
          staleSeconds: z.number().int().min(30).max(900).default(120),
        }),
      )
      .mutation(async ({ input }) => runDispatch(input.rideId, input.offerSeconds, input.staleSeconds)),

    dispatchPendingBatch: adminProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(50).default(20),
            offerSeconds: z.number().int().min(10).max(90).default(25),
            staleSeconds: z.number().int().min(30).max(900).default(120),
          })
          .optional(),
      )
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
          results.push(
            await runDispatch(
              ride.id,
              input?.offerSeconds ?? 25,
              input?.staleSeconds ?? 120,
            ),
          );
        }

        return {
          processed: results.length,
          created: results.filter((item: any) => item?.code === "OFFER_CREATED").length,
          unavailable: results.filter((item: any) => item?.code === "NO_DRIVER_AVAILABLE").length,
          results,
        };
      }),

    metrics: adminProcedure
      .input(z.object({ hours: z.number().int().min(1).max(720).default(24) }).optional())
      .query(async ({ input }) => {
        const since = new Date(Date.now() - (input?.hours ?? 24) * 3600_000).toISOString();
        const { data, error } = await supabase
          .from("taxi_dispatch_decisions")
          .select("decision_code,total_score,candidates_considered,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000);

        throwIfSupabaseError(error);
        const rows = data ?? [];
        const created = rows.filter((row) => row.decision_code === "OFFER_CREATED");
        const average = (values: number[]) =>
          values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

        return {
          hours: input?.hours ?? 24,
          decisions: rows.length,
          offersCreated: created.length,
          noDriverAvailable: rows.filter((row) => row.decision_code === "NO_DRIVER_AVAILABLE").length,
          successRate: rows.length ? created.length / rows.length : 0,
          averageCandidates: average(rows.map((row) => Number(row.candidates_considered || 0))),
          averageWinningScore: average(created.map((row) => Number(row.total_score || 0))),
          latestAt: rows[0]?.created_at ?? null,
        };
      }),
  }),
});