import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { ensureCardAuthorizationForStart } from "./taxi-card-payments-router";
import { supabase } from "./supabase-client";

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function fail(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");
  if (message.includes("INVALID_PICKUP_PIN")) throw new TRPCError({ code: "UNAUTHORIZED", message: "El PIN de recogida no es correcto." });
  if (message.includes("DRIVER_NOT_ARRIVED")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Primero debes marcar que has llegado al punto de recogida." });
  if (message.includes("CARD_AUTHORIZATION_REQUIRED")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pasajero debe autorizar la tarjeta antes de iniciar el viaje." });
  if (message.includes("RIDE_NOT_ASSIGNED")) throw new TRPCError({ code: "CONFLICT", message: "El viaje ya no está pendiente de inicio." });
  if (message.includes("RIDE_NOT_FOUND")) throw new TRPCError({ code: "NOT_FOUND", message: "El viaje ya no existe." });
  if (message.includes("DRIVER_MISMATCH")) throw new TRPCError({ code: "FORBIDDEN", message: "Este viaje no está asignado a tu cuenta." });
  if (message.includes("INVALID_CANCELLATION_REASON")) throw new TRPCError({ code: "BAD_REQUEST", message: "El motivo de cancelación no es válido." });
  if (message.includes("NO_SHOW_WAIT_REQUIRED")) {
    const seconds = Number(message.split(":").pop() || 0);
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Debes esperar aproximadamente ${minutes} minuto${minutes === 1 ? "" : "s"} más antes de registrar la ausencia.`,
    });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

const driverCancellationReasonSchema = z.enum([
  "vehicle_breakdown",
  "driver_emergency",
  "unsafe_pickup",
  "operational",
  "other",
]);

export const taxiTripLifecycleRouter = router({
  startWithPin: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), pickupPin: z.string().trim().length(4).regex(/^[A-F0-9]{4}$/i) }))
    .mutation(async ({ ctx, input }) => {
      assertDriver(ctx);

      await ensureCardAuthorizationForStart(input.rideId);

      const { data, error } = await supabase.rpc("taximun_start_ride_with_pin", {
        p_ride_id: input.rideId,
        p_driver_id: ctx.user.openId,
        p_pickup_pin: input.pickupPin.toUpperCase(),
      });
      fail(error);
      if (!data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo iniciar el viaje." });

      await supabase.from("taxi_activity_logs").insert({
        actor_id: ctx.user.openId,
        actor_role: ctx.user?.role === "admin" ? "admin" : "driver",
        message: "Viaje iniciado con PIN verificado",
        ride_id: input.rideId,
      });

      await createTaxiNotification({
        recipientId: data.passenger_id,
        recipientRole: "passenger",
        actorId: ctx.user.openId,
        actorRole: ctx.user?.role === "admin" ? "admin" : "driver",
        type: "info",
        title: "Viaje iniciado",
        body: `Tu viaje hacia ${data.dropoff_address || "tu destino"} ha comenzado con el PIN verificado.`,
        actionUrl: "/passenger/rides",
        metadata: { rideId: data.id, status: data.status, pinVerified: true },
      });

      return data;
    }),

  cancelPassengerNoShow: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertDriver(ctx);

      const { data, error } = await supabase.rpc("taximun_cancel_passenger_no_show", {
        p_ride_id: input.rideId,
        p_driver_id: ctx.user.openId,
        p_note: input.note || null,
      });

      fail(error);
      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo registrar la ausencia del pasajero.",
        });
      }

      return data;
    }),

  cancelByDriver: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        reason: driverCancellationReasonSchema,
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertDriver(ctx);

      const { data, error } = await supabase.rpc("taximun_cancel_ride_by_driver", {
        p_ride_id: input.rideId,
        p_driver_id: ctx.user.openId,
        p_reason: input.reason,
        p_note: input.note || null,
      });

      fail(error);
      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo cancelar el servicio.",
        });
      }

      return data;
    }),
});
