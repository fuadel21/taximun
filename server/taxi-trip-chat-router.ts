import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const ACTIVE_STATUSES = ["assigned", "in_progress"];

function fail(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

async function getRideForUser(rideId: string, user: any) {
  const { data, error } = await supabase
    .from("taxi_rides")
    .select("id,passenger_id,driver_id,status")
    .eq("id", rideId)
    .maybeSingle();
  fail(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });

  const allowed = user.role === "admin" || data.passenger_id === user.openId || data.driver_id === user.openId;
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a este chat." });
  return data;
}

export const taxiTripChatRouter = router({
  list: protectedProcedure
    .input(z.object({ rideId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await getRideForUser(input.rideId, ctx.user);
      const { data, error } = await supabase
        .from("taxi_trip_messages")
        .select("id,ride_id,sender_id,sender_role,message,message_type,created_at,read_at")
        .eq("ride_id", input.rideId)
        .order("created_at", { ascending: true })
        .limit(100);
      fail(error);
      return data ?? [];
    }),

  send: protectedProcedure
    .input(z.object({
      rideId: z.string().min(1),
      message: z.string().trim().min(1).max(500),
      messageType: z.enum(["text", "quick"]).default("text"),
    }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getRideForUser(input.rideId, ctx.user);
      if (!ACTIVE_STATUSES.includes(ride.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El chat solo está disponible durante un viaje activo." });
      }
      const senderRole = ctx.user.role === "driver" ? "driver" : ctx.user.role === "admin" ? "admin" : "passenger";
      const { data, error } = await supabase
        .from("taxi_trip_messages")
        .insert({
          ride_id: input.rideId,
          sender_id: ctx.user.openId,
          sender_role: senderRole,
          message: input.message,
          message_type: input.messageType,
        })
        .select("id,ride_id,sender_id,sender_role,message,message_type,created_at,read_at")
        .single();
      fail(error);
      return data;
    }),

  markRead: protectedProcedure
    .input(z.object({ rideId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await getRideForUser(input.rideId, ctx.user);
      const { error } = await supabase
        .from("taxi_trip_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("ride_id", input.rideId)
        .neq("sender_id", ctx.user.openId)
        .is("read_at", null);
      fail(error);
      return { success: true };
    }),
});
