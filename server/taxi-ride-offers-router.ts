import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

function throwOfferError(error: { message: string } | null) {
  if (!error) return;
  const message = String(error.message || "");
  if (message.includes("OFFER_EXPIRED")) {
    throw new TRPCError({ code: "CONFLICT", message: "La oferta ha caducado y ya está pasando al siguiente conductor." });
  }
  if (message.includes("OFFER_NOT_FOUND")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "La oferta ya no está disponible." });
  }
  if (message.includes("RIDE_NOT_AVAILABLE")) {
    throw new TRPCError({ code: "CONFLICT", message: "El viaje ya ha sido asignado o cancelado." });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

async function reconcileDispatch() {
  const { data, error } = await supabase.rpc("taximun_reconcile_dispatch_state");
  throwIfSupabaseError(error);
  return data ?? null;
}

export const taxiRideOffersRouter = router({
  driver: router({
    getCurrentOffer: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);
      await reconcileDispatch();

      const { data: operational, error: operationalError } = await supabase.rpc("taximun_driver_can_operate", {
        p_driver_id: ctx.user.openId,
      });
      throwIfSupabaseError(operationalError);
      if (operational !== true) return null;

      const { data, error } = await supabase.rpc("taximun_claim_smart_offer", {
        p_driver_id: ctx.user.openId,
      });
      throwIfSupabaseError(error);
      return data ?? null;
    }),

    recoverSession: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);
      const reconciliation = await reconcileDispatch();

      const [{ data: offer, error: offerError }, { data: ride, error: rideError }] = await Promise.all([
        supabase
          .from("taxi_ride_offers")
          .select("*")
          .eq("driver_id", ctx.user.openId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("offered_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("taxi_rides")
          .select("id,status,pickup_address,dropoff_address,assigned_at,started_at")
          .eq("driver_id", ctx.user.openId)
          .in("status", ["assigned", "in_progress"])
          .order("assigned_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      throwIfSupabaseError(offerError);
      throwIfSupabaseError(rideError);

      return {
        reconciliation,
        pendingOffer: offer ?? null,
        activeRide: ride ?? null,
        resumePath: ride ? "/driver/navigation" : offer ? "/driver" : null,
      };
    }),

    acceptOffer: protectedProcedure
      .input(z.object({
        offerId: z.string().uuid(),
        taxiCode: z.string().min(2).default("TX-000"),
        plate: z.string().min(2).default("SIN-MAT"),
      }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);
        await reconcileDispatch();

        const { data, error } = await supabase.rpc("taximun_accept_smart_offer", {
          p_offer_id: input.offerId,
          p_driver_id: ctx.user.openId,
          p_driver_name: ctx.user.name || "Conductor",
          p_taxi_code: input.taxiCode,
          p_plate: input.plate,
        });
        throwOfferError(error);
        if (!data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo aceptar la oferta." });

        await supabase.from("taxi_activity_logs").insert({
          actor_id: ctx.user.openId,
          actor_role: ctx.user?.role === "admin" ? "admin" : "driver",
          message: "Oferta inteligente aceptada",
          ride_id: data.id,
        });

        await createTaxiNotification({
          recipientId: data.passenger_id,
          recipientRole: "passenger",
          actorId: ctx.user.openId,
          actorRole: ctx.user?.role === "admin" ? "admin" : "driver",
          type: "success",
          title: "Conductor localizado",
          body: `${data.driver_name || "Tu conductor"} ha aceptado el viaje. Taxi ${data.taxi_code || input.taxiCode} · matrícula ${data.plate || input.plate}.`,
          actionUrl: "/passenger/rides",
          metadata: { rideId: data.id, offerId: input.offerId, status: data.status },
        });

        return data;
      }),

    rejectOffer: protectedProcedure
      .input(z.object({
        offerId: z.string().uuid(),
        reason: z.enum(["driver_declined", "timeout", "not_suitable"]).default("driver_declined"),
      }))
      .mutation(async ({ ctx, input }) => {
        assertDriver(ctx);
        const { data, error } = await supabase.rpc("taximun_reject_smart_offer", {
          p_offer_id: input.offerId,
          p_driver_id: ctx.user.openId,
          p_reason: input.reason,
        });
        throwIfSupabaseError(error);
        await reconcileDispatch();
        return { success: Boolean(data) };
      }),

    getOfferStats: protectedProcedure.query(async ({ ctx }) => {
      assertDriver(ctx);
      const { data, error } = await supabase
        .from("driver_live_status")
        .select("offers_received,offers_accepted,offers_rejected,offers_expired,last_offer_at")
        .eq("driver_id", ctx.user.openId)
        .maybeSingle();
      throwIfSupabaseError(error);
      const received = Number(data?.offers_received ?? 0);
      const accepted = Number(data?.offers_accepted ?? 0);
      return {
        received,
        accepted,
        rejected: Number(data?.offers_rejected ?? 0),
        expired: Number(data?.offers_expired ?? 0),
        acceptanceRate: received > 0 ? Number(((accepted / received) * 100).toFixed(1)) : 0,
        lastOfferAt: data?.last_offer_at ?? null,
      };
    }),
  }),

  passenger: router({
    getDispatchStatus: protectedProcedure.query(async ({ ctx }) => {
      assertPassenger(ctx);
      await reconcileDispatch();

      const { data: ride, error: rideError } = await supabase
        .from("taxi_rides")
        .select("id,status,requested_at,driver_id,driver_name,taxi_code,plate")
        .eq("passenger_id", ctx.user.openId)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwIfSupabaseError(rideError);
      if (!ride) return null;

      const { data: offers, error: offersError } = await supabase
        .from("taxi_ride_offers")
        .select("status,offered_at,expires_at,responded_at,metadata")
        .eq("ride_id", ride.id)
        .order("created_at", { ascending: false })
        .limit(30);
      throwIfSupabaseError(offersError);

      const rows = offers ?? [];
      const activeOffer = rows.find((offer) => offer.status === "pending") ?? null;
      const requestedAt = new Date(ride.requested_at).getTime();
      const waitingSeconds = Number.isFinite(requestedAt) ? Math.max(0, Math.floor((Date.now() - requestedAt) / 1000)) : 0;

      return {
        rideId: ride.id,
        rideStatus: ride.status,
        phase: ride.status === "assigned" || ride.status === "in_progress"
          ? "driver_assigned"
          : activeOffer
            ? "waiting_driver_response"
            : waitingSeconds >= 120
              ? "search_delayed"
              : "searching_driver",
        attempts: rows.length,
        activeOfferExpiresAt: activeOffer?.expires_at ?? null,
        driverName: ride.driver_name,
        taxiCode: ride.taxi_code,
        plate: ride.plate,
        waitingSeconds,
        lastAttemptStatus: rows[0]?.status ?? null,
      };
    }),
  }),

  admin: router({
    getOfferAudit: protectedProcedure.query(async ({ ctx }) => {
      assertAdmin(ctx);
      const { data, error } = await supabase
        .from("taxi_ride_offers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);
      throwIfSupabaseError(error);
      return data ?? [];
    }),

    getDispatchHealth: protectedProcedure.query(async ({ ctx }) => {
      assertAdmin(ctx);
      const { data, error } = await supabase.rpc("taximun_dispatch_health");
      throwIfSupabaseError(error);
      return data ?? {};
    }),

    reconcileDispatch: protectedProcedure.mutation(async ({ ctx }) => {
      assertAdmin(ctx);
      return reconcileDispatch();
    }),
  }),
});
