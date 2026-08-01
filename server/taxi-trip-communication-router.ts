import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function fail(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiTripCommunicationRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.user.role === "driver" ? "driver" : "passenger";
    const participantColumn = role === "driver" ? "driver_id" : "passenger_id";

    const { data: ride, error: rideError } = await supabase
      .from("taxi_rides")
      .select("id,passenger_id,driver_id,passenger_name,driver_name,pickup_address,dropoff_address,status")
      .eq(participantColumn, ctx.user.openId)
      .in("status", ["assigned", "in_progress"])
      .order(role === "driver" ? "assigned_at" : "requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    fail(rideError);

    if (!ride) {
      return {
        selfId: ctx.user.openId,
        role,
        ride: null,
        messages: [],
        unread: 0,
        latestCallRequest: null,
        activeCallSession: null,
      };
    }

    const [{ data: messages, error: messageError }, { data: latestCallRequest, error: callError }, { data: activeCallSession, error: sessionError }] = await Promise.all([
      supabase
        .from("taxi_trip_messages")
        .select("id,ride_id,sender_id,sender_role,message,message_type,created_at,read_at")
        .eq("ride_id", ride.id)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("taxi_trip_call_requests")
        .select("id,ride_id,requester_id,requester_role,status,reason,created_at,responded_at,expires_at")
        .eq("ride_id", ride.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("taxi_trip_call_sessions")
        .select("id,ride_id,call_request_id,initiator_id,participant_id,status,started_at,ended_at,end_reason,created_at")
        .eq("ride_id", ride.id)
        .in("status", ["connecting", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    fail(messageError);
    fail(callError);
    fail(sessionError);

    const safeMessages = messages ?? [];

    return {
      selfId: ctx.user.openId,
      role,
      ride,
      messages: safeMessages,
      unread: safeMessages.filter((message) => message.sender_id !== ctx.user.openId && !message.read_at).length,
      latestCallRequest: latestCallRequest ?? null,
      activeCallSession: activeCallSession ?? null,
    };
  }),
});
