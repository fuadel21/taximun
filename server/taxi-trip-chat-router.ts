import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const ACTIVE_STATUSES = ["assigned", "in_progress"];

const quickMessageSchema = z.enum([
  "arriving",
  "waiting",
  "cannot_find_pickup",
  "coming_down",
  "please_wait",
  "at_pickup",
]);

const QUICK_MESSAGES: Record<z.infer<typeof quickMessageSchema>, string> = {
  arriving: "Estoy llegando al punto de recogida.",
  waiting: "Ya estoy esperando en el punto de recogida.",
  cannot_find_pickup: "No encuentro el punto exacto de recogida.",
  coming_down: "Ya bajo, gracias.",
  please_wait: "Espérame un momento, por favor.",
  at_pickup: "Estoy en el punto indicado en el mapa.",
};

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

function getParticipantContext(ride: any, user: any) {
  const senderRole = user.role === "driver" ? "driver" : user.role === "admin" ? "admin" : "passenger";

  if (senderRole === "admin") {
    return { senderRole, recipientId: null, recipientRole: "user" as const };
  }

  const recipientId = senderRole === "driver" ? ride.passenger_id : ride.driver_id;
  const recipientRole = senderRole === "driver" ? "passenger" : "driver";

  return { senderRole, recipientId, recipientRole };
}

async function sendChatMessage(input: {
  ride: any;
  user: any;
  message: string;
  messageType: "text" | "quick";
}) {
  if (!ACTIVE_STATUSES.includes(input.ride.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El chat solo está disponible durante un viaje activo." });
  }

  const { senderRole, recipientId, recipientRole } = getParticipantContext(input.ride, input.user);

  if (senderRole !== "admin" && !recipientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El otro participante todavía no está asignado." });
  }

  const { data, error } = await supabase
    .from("taxi_trip_messages")
    .insert({
      ride_id: input.ride.id,
      sender_id: input.user.openId,
      sender_role: senderRole,
      message: input.message,
      message_type: input.messageType,
    })
    .select("id,ride_id,sender_id,sender_role,message,message_type,created_at,read_at")
    .single();

  fail(error);

  if (recipientId) {
    await createTaxiNotification({
      recipientId,
      recipientRole,
      actorId: input.user.openId,
      actorRole: senderRole,
      type: "info",
      title: senderRole === "driver" ? "Mensaje de tu conductor" : "Mensaje de tu pasajero",
      body: input.message,
      actionUrl: senderRole === "driver" ? "/passenger/rides" : "/driver/navigation",
      metadata: {
        kind: "trip_chat_message",
        rideId: input.ride.id,
        messageId: data.id,
        messageType: input.messageType,
      },
    });
  }

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
        .limit(200);

      fail(error);

      const messages = data ?? [];
      return {
        messages,
        unread: messages.filter((message) => message.sender_id !== ctx.user.openId && !message.read_at).length,
      };
    }),

  send: protectedProcedure
    .input(z.object({
      rideId: z.string().min(1),
      message: z.string().trim().min(1).max(500),
      messageType: z.enum(["text", "quick"]).default("text"),
    }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getRideForUser(input.rideId, ctx.user);
      return sendChatMessage({
        ride,
        user: ctx.user,
        message: input.message,
        messageType: input.messageType,
      });
    }),

  sendQuick: protectedProcedure
    .input(z.object({
      rideId: z.string().min(1),
      code: quickMessageSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getRideForUser(input.rideId, ctx.user);
      const driverOnly = ["arriving", "waiting", "cannot_find_pickup"];
      const passengerOnly = ["coming_down", "please_wait", "at_pickup"];

      if (ctx.user.role === "driver" && !driverOnly.includes(input.code)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este mensaje rápido es exclusivo del pasajero." });
      }

      if (ctx.user.role === "passenger" && !passengerOnly.includes(input.code)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este mensaje rápido es exclusivo del conductor." });
      }

      return sendChatMessage({
        ride,
        user: ctx.user,
        message: QUICK_MESSAGES[input.code],
        messageType: "quick",
      });
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
