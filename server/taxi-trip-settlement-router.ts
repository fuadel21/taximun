import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const paymentMethodSchema = z.enum(["cash", "card", "bizum"]);
const paymentStatusSchema = z.enum(["paid", "waived"]);

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiTripSettlementRouter = router({
  settleAndComplete: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        finalFare: z.number().min(0).max(9999),
        paymentMethod: paymentMethodSchema,
        paymentStatus: paymentStatusSchema,
        notes: z.string().trim().max(800).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertDriver(ctx);

      const now = new Date().toISOString();
      const { data: ride, error } = await supabase
        .from("taxi_rides")
        .update({
          final_fare: input.finalFare,
          payment_method: input.paymentMethod,
          payment_status: input.paymentStatus,
          settlement_notes: input.notes || null,
          settled_at: now,
          settled_by: ctx.user.openId,
          completed_at: now,
          status: "completed",
        })
        .eq("id", input.rideId)
        .eq("driver_id", ctx.user.openId)
        .eq("status", "in_progress")
        .select()
        .single();

      throwIfSupabaseError(error);

      const { data: liveStatus } = await supabase
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
          total_earnings: Number(liveStatus?.total_earnings ?? 0) + input.finalFare,
          total_rides: Number(liveStatus?.total_rides ?? 0) + 1,
        });

      await supabase.from("taxi_activity_logs").insert({
        actor_id: ctx.user.openId,
        actor_role: ctx.user?.role === "admin" ? "admin" : "driver",
        message: `Viaje cerrado · ${input.finalFare.toFixed(2)} € · ${input.paymentMethod}`,
        ride_id: input.rideId,
      });

      await createTaxiNotification({
        recipientId: ride.passenger_id,
        recipientRole: "passenger",
        actorId: ctx.user.openId,
        actorRole: ctx.user?.role === "admin" ? "admin" : "driver",
        type: "success",
        title: "Viaje finalizado",
        body: `Importe final: ${input.finalFare.toFixed(2)} € · pago ${input.paymentStatus === "paid" ? "confirmado" : "sin cobro"}.`,
        actionUrl: "/passenger/rides",
        metadata: {
          rideId: ride.id,
          finalFare: input.finalFare,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
        },
      });

      return ride;
    }),
});