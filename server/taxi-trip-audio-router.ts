import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function fail(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

async function getRideForUser(rideId: string, user: any) {
  const { data, error } = await supabase.from("taxi_rides").select("id,passenger_id,driver_id,status").eq("id", rideId).maybeSingle();
  fail(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  const allowed = user.role === "admin" || data.passenger_id === user.openId || data.driver_id === user.openId;
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a esta sala." });
  return data;
}

async function getRoomForUser(roomId: string, user: any) {
  const { data, error } = await supabase.from("taxi_trip_audio_rooms").select("id,ride_id,status,expires_at,driver_joined_at,passenger_joined_at").eq("id", roomId).maybeSingle();
  fail(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Sala no encontrada." });
  await getRideForUser(data.ride_id, user);
  return data;
}

const signalPayload = z.record(z.string(), z.unknown());

export const taxiTripAudioRouter = router({
  getLatest: protectedProcedure.input(z.object({ rideId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await getRideForUser(input.rideId, ctx.user);
    const { data, error } = await supabase.from("taxi_trip_audio_rooms").select("id,ride_id,call_request_id,status,driver_joined_at,passenger_joined_at,started_at,ended_at,expires_at,created_at").eq("ride_id", input.rideId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    fail(error);
    return data ?? null;
  }),

  open: protectedProcedure.input(z.object({ rideId: z.string().min(1), callRequestId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const ride = await getRideForUser(input.rideId, ctx.user);
    if (!["assigned", "in_progress"].includes(ride.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "La sala solo está disponible durante un viaje activo." });
    const { data: request, error: requestError } = await supabase.from("taxi_trip_call_requests").select("id,ride_id,status").eq("id", input.callRequestId).eq("ride_id", input.rideId).maybeSingle();
    fail(requestError);
    if (!request || request.status !== "accepted") throw new TRPCError({ code: "BAD_REQUEST", message: "La llamada debe estar aceptada antes de abrir la sala." });
    const { data, error } = await supabase.from("taxi_trip_audio_rooms").upsert({ ride_id: input.rideId, call_request_id: input.callRequestId, created_by: ctx.user.openId }, { onConflict: "call_request_id" }).select("*").single();
    fail(error);
    return data;
  }),

  join: protectedProcedure.input(z.object({ roomId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const room = await getRoomForUser(input.roomId, ctx.user);
    if (["ended", "expired"].includes(room.status) || new Date(room.expires_at).getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "La sala ya no está disponible." });
    const joinedField = ctx.user.role === "driver" ? "driver_joined_at" : "passenger_joined_at";
    const otherJoined = ctx.user.role === "driver" ? room.passenger_joined_at : room.driver_joined_at;
    const now = new Date().toISOString();
    const patch: Record<string, string> = { [joinedField]: now, status: otherJoined ? "active" : "waiting" };
    if (otherJoined) patch.started_at = now;
    const { data, error: updateError } = await supabase.from("taxi_trip_audio_rooms").update(patch).eq("id", input.roomId).select("*").single();
    fail(updateError);
    return data;
  }),

  listSignals: protectedProcedure.input(z.object({ roomId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await getRoomForUser(input.roomId, ctx.user);
    const { data, error } = await supabase.from("taxi_trip_audio_signals").select("id,room_id,sender_id,sender_role,signal_type,payload,created_at").eq("room_id", input.roomId).order("created_at", { ascending: true }).limit(200);
    fail(error);
    return data ?? [];
  }),

  sendSignal: protectedProcedure.input(z.object({ roomId: z.string().uuid(), signalType: z.enum(["offer", "answer", "ice"]), payload: signalPayload })).mutation(async ({ ctx, input }) => {
    const room = await getRoomForUser(input.roomId, ctx.user);
    if (!["waiting", "active"].includes(room.status) || new Date(room.expires_at).getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "La sala ya no acepta señalización." });
    const senderRole = ctx.user.role === "driver" ? "driver" : "passenger";
    const { data, error } = await supabase.from("taxi_trip_audio_signals").insert({ room_id: input.roomId, sender_id: ctx.user.openId, sender_role: senderRole, signal_type: input.signalType, payload: input.payload }).select("id,signal_type,created_at").single();
    fail(error);
    return data;
  }),

  end: protectedProcedure.input(z.object({ roomId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const room = await getRoomForUser(input.roomId, ctx.user);
    const { data, error: updateError } = await supabase.from("taxi_trip_audio_rooms").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", room.id).select("*").single();
    fail(updateError);
    return data;
  }),
});
