import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

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
        paymentStatus: paymentStatusSchema.default("paid"),
        notes: z.string().trim().max(800).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertDriver(ctx);

      const { data: currentRide, error: rideError } = await supabase
        .from("taxi_rides")
        .select("id,driver_id,passenger_id,status,payment_method")
        .eq("id", input.rideId)
        .maybeSingle();

      throwIfSupabaseError(rideError);
      if (!currentRide) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
      if (ctx.user.role === "driver" && currentRide.driver_id !== ctx.user.openId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (currentRide.status !== "in_progress") {
        throw new TRPCError({ code: "CONFLICT", message: "El viaje debe estar en curso antes del cierre." });
      }

      const driverId = currentRide.driver_id;
      if (!driverId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene conductor asignado." });

      const paymentMethod = String(currentRide.payment_method || "");
      if (!["cash", "card", "bizum"].includes(paymentMethod)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene un método de pago válido." });
      }
      if (ctx.user.role !== "admin" && input.paymentStatus !== "paid") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede cerrar un viaje sin cobro." });
      }

      const { data, error } = await supabase.rpc("taximun_settle_trip_atomic", {
        p_ride_id: input.rideId,
        p_driver_id: driverId,
        p_settled_by: ctx.user.openId,
        p_driver_name: ctx.user.role === "driver" ? ctx.user.name || "Conductor" : "Conductor",
        p_final_fare: input.finalFare,
        p_payment_method: paymentMethod,
        p_payment_status: input.paymentStatus,
        p_notes: input.notes || null,
      });

      throwIfSupabaseError(error);
      const ride = Array.isArray(data) ? data[0] : data;
      if (!ride) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo cerrar el viaje." });

      await supabase.from("taxi_activity_logs").insert({
        actor_id: ctx.user.openId,
        actor_role: ctx.user?.role === "admin" ? "admin" : "driver",
        message: `Viaje cerrado · ${input.finalFare.toFixed(2)} € · ${paymentMethod}`,
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
          paymentMethod,
          paymentStatus: input.paymentStatus,
        },
      });

      return ride;
    }),
});
