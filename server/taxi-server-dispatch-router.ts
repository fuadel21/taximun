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
          results,
        };
      }),
  }),
});
