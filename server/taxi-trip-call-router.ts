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
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a este viaje." });
  return data;
}

export const taxiTripCallRouter = router({
  getLatest: protectedProcedure.input(z.object({ rideId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await getRideForUser(input.rideId, ctx.user);
    const { data, error } = await supabase.from("taxi_trip_call_requests").select("id,ride_id,requester_id,requester_role,status,reason,created_at,responded_at,expires_at").eq("ride_id", input.rideId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    fail(error);
    return data ?? null;
  }),
  request: protectedProcedure.input(z.object({ rideId: z.string().min(1), reason: z.enum(["contact","pickup","delay","emergency"]).default("contact") })).mutation(async ({ ctx, input }) => {
    const ride = await getRideForUser(input.rideId, ctx.user);
    if (!["assigned", "in_progress"].includes(ride.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "La llamada solo está disponible durante un viaje activo." });
    await supabase.from("taxi_trip_call_requests").update({ status: "cancelled", responded_at: new Date().toISOString() }).eq("ride_id", input.rideId).eq("status", "pending");
    const requesterRole = ctx.user.role === "driver" ? "driver" : "passenger";
    const { data, error } = await supabase.from("taxi_trip_call_requests").insert({ ride_id: input.rideId, requester_id: ctx.user.openId, requester_role: requesterRole, reason: input.reason }).select("*").single();
    fail(error);
    return data;
  }),
  respond: protectedProcedure.input(z.object({ requestId: z.string().uuid(), status: z.enum(["accepted","declined"]) })).mutation(async ({ ctx, input }) => {
    const { data: request, error } = await supabase.from("taxi_trip_call_requests").select("id,ride_id,requester_id,status").eq("id", input.requestId).maybeSingle();
    fail(error);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada." });
    await getRideForUser(request.ride_id, ctx.user);
    if (request.requester_id === ctx.user.openId) throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes responder a tu propia solicitud." });
    const { data, error: updateError } = await supabase.from("taxi_trip_call_requests").update({ status: input.status, responded_at: new Date().toISOString() }).eq("id", input.requestId).eq("status", "pending").select("*").single();
    fail(updateError);
    return data;
  }),
});