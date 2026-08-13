import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { tryTransferCapturedRideEarnings } from "./taxi-stripe-connect-router";
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

function throwIfSettlementError(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");

  if (message.includes("CARD_PAYMENT_LEDGER_MISSING")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No existe un registro de pago por tarjeta para este viaje." });
  }
  if (message.includes("CARD_PAYMENT_NOT_CAPTURED")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pago por tarjeta todavía no está capturado." });
  }
  if (message.includes("CARD_ZERO_BALANCE_NOT_READY")) {
    throw new TRPCError({ code: "CONFLICT", message: "El viaje queda en 0 €, pero la autorización o el reembolso de tarjeta todavía no está resuelto." });
  }
  if (message.includes("CARD_NET_AMOUNT_MISMATCH")) {
    throw new TRPCError({ code: "CONFLICT", message: "El saldo neto de tarjeta no coincide con el importe final del viaje." });
  }
  if (message.includes("CARD_PAYMENT_LEDGER_INVALID")) {
    throw new TRPCError({ code: "CONFLICT", message: "El libro contable del pago contiene un saldo inválido y debe revisarse antes de cerrar el viaje." });
  }
  if (message.includes("CARD_PAYMENT_MUST_BE_PAID")) {
    throw new TRPCError({ code: "CONFLICT", message: "Los viajes con tarjeta solo pueden cerrarse cuando el pago está resuelto." });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
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

      throwIfSettlementError(error);
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

      if (paymentMethod === "card" && input.paymentStatus === "paid" && input.finalFare > 0) {
        const payout = await tryTransferCapturedRideEarnings(input.rideId, ctx.user.openId);
        await supabase.from("taxi_activity_logs").insert({
          actor_id: ctx.user.openId,
          actor_role: "system",
          message: payout.ok
            ? "Liquidación Stripe Connect creada automáticamente"
            : `Liquidación Stripe Connect pendiente · ${String(payout.message || "sin detalle").slice(0, 500)}`,
          ride_id: input.rideId,
        });
      }

      return ride;
    }),
});
