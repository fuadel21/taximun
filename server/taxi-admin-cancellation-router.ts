import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const adminCancellationReason = z.enum([
  "safety_incident",
  "payment_issue",
  "admin_intervention",
  "duplicate_request",
  "other",
]);

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede realizar esta acción." });
  }
}

function fail(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");

  if (message.includes("INVALID_CANCELLATION_REASON")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El motivo administrativo no es válido." });
  }
  if (message.includes("ADMIN_ID_REQUIRED")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No se pudo identificar al administrador." });
  }
  if (message.includes("RIDE_NOT_FOUND")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "El viaje ya no existe." });
  }
  if (message.includes("RIDE_NOT_CANCELLABLE")) {
    throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya no admite cancelación administrativa." });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export const taxiAdminCancellationRouter = router({
  cancel: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        reason: adminCancellationReason,
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);

      const { data, error } = await supabase.rpc("taximun_cancel_ride_by_admin", {
        p_ride_id: input.rideId,
        p_admin_id: ctx.user.openId,
        p_reason: input.reason,
        p_note: input.note || null,
      });

      fail(error);
      if (!data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo cancelar el viaje." });
      }

      if (data.passenger_id) {
        const { error: notificationError } = await supabase.from("taxi_notifications").insert({
          recipient_id: data.passenger_id,
          recipient_role: "passenger",
          actor_id: ctx.user.openId,
          actor_role: "admin",
          type: "warning",
          title: "Viaje cancelado por administración",
          body: input.note?.trim() || "Administración ha cancelado el servicio por una incidencia operativa.",
          action_url: "/passenger/rides",
          metadata: {
            rideId: data.id,
            event: "admin_ride_cancellation",
            reason: input.reason,
          },
        });

        if (notificationError) {
          console.warn("Admin cancellation passenger notification skipped", notificationError.message);
        }
      }

      return data;
    }),
});
