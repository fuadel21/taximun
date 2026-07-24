import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const passengerCancellationReason = z.enum([
  "changed_mind",
  "wait_too_long",
  "wrong_pickup",
  "driver_delay",
  "duplicate_request",
  "other",
]);

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function fail(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");

  if (message.includes("INVALID_CANCELLATION_REASON")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El motivo de cancelación no es válido." });
  }
  if (message.includes("RIDE_NOT_FOUND")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "El viaje ya no existe." });
  }
  if (message.includes("PASSENGER_MISMATCH")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este viaje no pertenece a tu cuenta." });
  }
  if (message.includes("RIDE_NOT_CANCELLABLE")) {
    throw new TRPCError({ code: "CONFLICT", message: "El viaje ya no se puede cancelar desde esta pantalla." });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export const taxiPassengerCancellationRouter = router({
  cancel: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        reason: passengerCancellationReason,
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);

      const { data, error } = await supabase.rpc("taximun_cancel_ride_by_passenger", {
        p_ride_id: input.rideId,
        p_passenger_id: ctx.user.openId,
        p_reason: input.reason,
        p_note: input.note || null,
      });

      fail(error);
      if (!data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo cancelar el viaje." });
      }

      return data;
    }),
});
