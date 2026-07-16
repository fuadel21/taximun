import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const quickCodeSchema = z.enum([
  "arriving",
  "waiting",
  "cannot_find_pickup",
  "coming_down",
  "please_wait",
  "pickup_updated",
]);

const quickMessages: Record<z.infer<typeof quickCodeSchema>, string> = {
  arriving: "Estoy llegando al punto de recogida.",
  waiting: "Ya estoy esperando en el punto de recogida.",
  cannot_find_pickup: "No encuentro el punto exacto de recogida.",
  coming_down: "Ya bajo, gracias.",
  please_wait: "Espérame un momento, por favor.",
  pickup_updated: "Estoy en el punto indicado en el mapa.",
};

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

async function getActiveParticipantRide(userId: string, rideId?: string) {
  let query = supabase
    .from("taxi_rides")
    .select("id,passenger_id,driver_id,passenger_name,driver_name,status")
    .in("status", ["assigned", "in_progress"])
    .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
    .order("assigned_at", { ascending: false })
    .limit(1);

  if (rideId) query = query.eq("id", rideId);
  const { data, error } = await query.maybeSingle();
  throwIfSupabaseError(error);
  return data;
}

export const taxiRideMessagesRouter = router({
  getConversation: protectedProcedure
    .input(z.object({ rideId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ride = await getActiveParticipantRide(ctx.user.openId, input?.rideId);
      if (!ride) return { ride: null, messages: [], unread: 0 };

      const { data: messages, error } = await supabase
        .from("taxi_ride_messages")
        .select("id,ride_id,sender_id,sender_role,recipient_id,message_type,body,quick_code,read_at,created_at")
        .eq("ride_id", ride.id)
        .order("created_at", { ascending: true })
        .limit(200);
      throwIfSupabaseError(error);

      const unreadIds = (messages ?? [])
        .filter((message) => message.recipient_id === ctx.user.openId && !message.read_at)
        .map((message) => message.id);

      if (unreadIds.length > 0) {
        await supabase
          .from("taxi_ride_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds)
          .eq("recipient_id", ctx.user.openId);
      }

      return {
        ride,
        messages: messages ?? [],
        unread: unreadIds.length,
      };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      rideId: z.string().uuid(),
      body: z.string().trim().min(1).max(600),
    }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getActiveParticipantRide(ctx.user.openId, input.rideId);
      if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "No hay un viaje activo para enviar mensajes." });

      const isPassenger = ride.passenger_id === ctx.user.openId;
      const recipientId = isPassenger ? ride.driver_id : ride.passenger_id;
      if (!recipientId) throw new TRPCError({ code: "BAD_REQUEST", message: "El otro participante todavía no está disponible." });

      const { data, error } = await supabase
        .from("taxi_ride_messages")
        .insert({
          ride_id: ride.id,
          sender_id: ctx.user.openId,
          sender_role: isPassenger ? "passenger" : "driver",
          recipient_id: recipientId,
          message_type: "text",
          body: input.body,
        })
        .select()
        .single();
      throwIfSupabaseError(error);

      await createTaxiNotification({
        recipientId,
        recipientRole: isPassenger ? "driver" : "passenger",
        actorId: ctx.user.openId,
        actorRole: isPassenger ? "passenger" : "driver",
        type: "info",
        title: isPassenger ? "Mensaje del pasajero" : "Mensaje del conductor",
        body: input.body,
        actionUrl: isPassenger ? "/driver/navigation" : "/passenger/rides",
        metadata: { rideId: ride.id, messageId: data.id },
      });

      return data;
    }),

  sendQuickMessage: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), code: quickCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getActiveParticipantRide(ctx.user.openId, input.rideId);
      if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "No hay un viaje activo para enviar avisos." });

      const isPassenger = ride.passenger_id === ctx.user.openId;
      const recipientId = isPassenger ? ride.driver_id : ride.passenger_id;
      if (!recipientId) throw new TRPCError({ code: "BAD_REQUEST", message: "El otro participante todavía no está disponible." });
      const body = quickMessages[input.code];

      const { data, error } = await supabase
        .from("taxi_ride_messages")
        .insert({
          ride_id: ride.id,
          sender_id: ctx.user.openId,
          sender_role: isPassenger ? "passenger" : "driver",
          recipient_id: recipientId,
          message_type: "quick",
          body,
          quick_code: input.code,
        })
        .select()
        .single();
      throwIfSupabaseError(error);

      await createTaxiNotification({
        recipientId,
        recipientRole: isPassenger ? "driver" : "passenger",
        actorId: ctx.user.openId,
        actorRole: isPassenger ? "passenger" : "driver",
        type: "info",
        title: isPassenger ? "Aviso del pasajero" : "Aviso del conductor",
        body,
        actionUrl: isPassenger ? "/driver/navigation" : "/passenger/rides",
        metadata: { rideId: ride.id, messageId: data.id, quickCode: input.code },
      });

      return data;
    }),
});
