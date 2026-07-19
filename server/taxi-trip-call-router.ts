import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

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
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a este viaje." });
  return data;
}

async function getSessionForUser(sessionId: string, user: any) {
  const { data, error } = await supabase
    .from("taxi_trip_call_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  fail(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Sesión de llamada no encontrada." });
  await getRideForUser(data.ride_id, user);
  return data;
}

async function expirePendingCalls(rideId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("taxi_trip_call_requests")
    .update({ status: "cancelled", responded_at: now })
    .eq("ride_id", rideId)
    .eq("status", "pending")
    .lte("expires_at", now);
  fail(error);
}

function getIceServers() {
  const urls = (process.env.TURN_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return {
    iceServers,
    iceTransportPolicy: process.env.TURN_FORCE_RELAY === "true" ? "relay" : "all",
    turnConfigured: iceServers.length > 1,
  } as const;
}

const signalPayloadSchema = z.record(z.string(), z.unknown());

export const taxiTripCallRouter = router({
  getIceConfig: protectedProcedure.query(() => getIceServers()),

  getLatest: protectedProcedure.input(z.object({ rideId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await getRideForUser(input.rideId, ctx.user);
    await expirePendingCalls(input.rideId);
    const { data, error } = await supabase
      .from("taxi_trip_call_requests")
      .select("id,ride_id,requester_id,requester_role,status,reason,created_at,responded_at,expires_at")
      .eq("ride_id", input.rideId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail(error);
    return data ?? null;
  }),

  request: protectedProcedure
    .input(z.object({ rideId: z.string().min(1), reason: z.enum(["contact", "pickup", "delay", "emergency"]).default("contact") }))
    .mutation(async ({ ctx, input }) => {
      const ride = await getRideForUser(input.rideId, ctx.user);
      if (!["assigned", "in_progress"].includes(ride.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La llamada solo está disponible durante un viaje activo." });
      }
      await expirePendingCalls(input.rideId);
      await supabase
        .from("taxi_trip_call_requests")
        .update({ status: "cancelled", responded_at: new Date().toISOString() })
        .eq("ride_id", input.rideId)
        .eq("status", "pending");
      const requesterRole = ctx.user.role === "driver" ? "driver" : "passenger";
      const { data, error } = await supabase
        .from("taxi_trip_call_requests")
        .insert({ ride_id: input.rideId, requester_id: ctx.user.openId, requester_role: requesterRole, reason: input.reason })
        .select("*")
        .single();
      fail(error);
      return data;
    }),

  respond: protectedProcedure
    .input(z.object({ requestId: z.string().uuid(), status: z.enum(["accepted", "declined"]) }))
    .mutation(async ({ ctx, input }) => {
      const { data: request, error } = await supabase
        .from("taxi_trip_call_requests")
        .select("id,ride_id,requester_id,status,expires_at")
        .eq("id", input.requestId)
        .maybeSingle();
      fail(error);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada." });
      const ride = await getRideForUser(request.ride_id, ctx.user);
      if (request.requester_id === ctx.user.openId) throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes responder a tu propia solicitud." });
      if (request.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "Esta llamada ya fue respondida o cancelada." });
      if (new Date(request.expires_at).getTime() <= Date.now()) {
        await expirePendingCalls(request.ride_id);
        throw new TRPCError({ code: "CONFLICT", message: "La solicitud de llamada ha caducado." });
      }
      const { data, error: updateError } = await supabase
        .from("taxi_trip_call_requests")
        .update({ status: input.status, responded_at: new Date().toISOString() })
        .eq("id", input.requestId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      fail(updateError);
      if (!data) throw new TRPCError({ code: "CONFLICT", message: "La solicitud cambió mientras respondías." });

      if (input.status === "accepted") {
        const participantId = ride.passenger_id === request.requester_id ? ride.driver_id : ride.passenger_id;
        if (!participantId) throw new TRPCError({ code: "CONFLICT", message: "El viaje todavía no tiene los dos participantes." });
        const { data: session, error: sessionError } = await supabase
          .from("taxi_trip_call_sessions")
          .insert({
            ride_id: request.ride_id,
            call_request_id: request.id,
            initiator_id: request.requester_id,
            participant_id: participantId,
            status: "connecting",
          })
          .select("*")
          .single();
        fail(sessionError);
        return { request: data, session };
      }

      return { request: data, session: null };
    }),

  cancel: protectedProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { data: request, error } = await supabase
      .from("taxi_trip_call_requests")
      .select("id,ride_id,requester_id,status")
      .eq("id", input.requestId)
      .maybeSingle();
    fail(error);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada." });
    await getRideForUser(request.ride_id, ctx.user);
    if (request.requester_id !== ctx.user.openId && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo quien inició la llamada puede cancelarla." });
    }
    if (request.status !== "pending") return request;
    const { data, error: updateError } = await supabase
      .from("taxi_trip_call_requests")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", input.requestId)
      .eq("status", "pending")
      .select("*")
      .single();
    fail(updateError);
    return data;
  }),

  getSession: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return getSessionForUser(input.sessionId, ctx.user);
  }),

  sendSignal: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), type: z.enum(["offer", "answer", "ice-candidate", "hangup"]), payload: signalPayloadSchema }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSessionForUser(input.sessionId, ctx.user);
      if (["ended", "failed"].includes(session.status)) throw new TRPCError({ code: "CONFLICT", message: "La llamada ya ha terminado." });
      const { data, error } = await supabase
        .from("taxi_trip_call_signals")
        .insert({ session_id: input.sessionId, sender_id: ctx.user.openId, signal_type: input.type, payload: input.payload })
        .select("id,session_id,sender_id,signal_type,payload,created_at")
        .single();
      fail(error);
      if (input.type === "answer") {
        await supabase.from("taxi_trip_call_sessions").update({ status: "active", started_at: new Date().toISOString() }).eq("id", input.sessionId);
      }
      if (input.type === "hangup") {
        await supabase.from("taxi_trip_call_sessions").update({ status: "ended", ended_at: new Date().toISOString(), end_reason: "hangup" }).eq("id", input.sessionId);
      }
      return data;
    }),

  pollSignals: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), afterId: z.number().int().nonnegative().default(0) }))
    .query(async ({ ctx, input }) => {
      await getSessionForUser(input.sessionId, ctx.user);
      const { data, error } = await supabase
        .from("taxi_trip_call_signals")
        .select("id,session_id,sender_id,signal_type,payload,created_at")
        .eq("session_id", input.sessionId)
        .gt("id", input.afterId)
        .neq("sender_id", ctx.user.openId)
        .order("id", { ascending: true })
        .limit(100);
      fail(error);
      return data ?? [];
    }),

  endSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), reason: z.enum(["hangup", "network", "timeout", "failed"]).default("hangup") }))
    .mutation(async ({ ctx, input }) => {
      await getSessionForUser(input.sessionId, ctx.user);
      const status = input.reason === "failed" ? "failed" : "ended";
      const { data, error } = await supabase
        .from("taxi_trip_call_sessions")
        .update({ status, ended_at: new Date().toISOString(), end_reason: input.reason })
        .eq("id", input.sessionId)
        .select("*")
        .single();
      fail(error);
      return data;
    }),
});