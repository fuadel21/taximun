import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const STRIPE_API = "https://api.stripe.com/v1";
const tipAmountSchema = z.number().min(0.5).max(500).multipleOf(0.01);

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe no está configurado." });
  return key;
}

function appUrl() {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Falta configurar PUBLIC_APP_URL para el retorno de Stripe." });
}

async function stripePost(path: string, params: URLSearchParams, idempotencyKey?: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: params.toString(),
  });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: json?.error?.message || "Stripe rechazó la operación." });
  return json;
}

async function stripeGet(path: string) {
  const response = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${stripeKey()}` } });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: json?.error?.message || "No se pudo verificar Stripe." });
  return json;
}

function fail(error: { message: string; code?: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

async function rideForParticipant(rideId: string, user: any) {
  const { data, error } = await supabase
    .from("taxi_rides")
    .select("id,passenger_id,passenger_name,driver_id,driver_name,pickup_address,dropoff_address,status,estimated_fare,final_fare,payment_method,payment_status,requested_at,completed_at,settled_at")
    .eq("id", rideId)
    .maybeSingle();
  fail(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  const allowed = user.role === "admin" || data.passenger_id === user.openId || data.driver_id === user.openId;
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });
  return data;
}

async function getTipForRide(rideId: string) {
  const { data, error } = await supabase.from("taxi_ride_tips").select("*").eq("ride_id", rideId).maybeSingle();
  fail(error);
  return data ?? null;
}

async function getPaymentForRide(rideId: string) {
  const { data, error } = await supabase
    .from("taxi_payments")
    .select("id,status,currency,amount_authorized,amount_captured,amount_refunded,platform_fee,driver_net,captured_at")
    .eq("ride_id", rideId)
    .maybeSingle();
  fail(error);
  return data ?? null;
}

export const taxiRideAftercareRouter = router({
  get: protectedProcedure.input(z.object({ rideId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const ride = await rideForParticipant(input.rideId, ctx.user);
    const [payment, tip] = await Promise.all([getPaymentForRide(input.rideId), getTipForRide(input.rideId)]);
    return { ride, payment, tip };
  }),

  createCardCheckout: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), amount: tipAmountSchema }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForParticipant(input.rideId, ctx.user);
      if (ride.passenger_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el pasajero puede añadir una propina." });
      if (ride.status !== "completed" || !ride.driver_id) throw new TRPCError({ code: "CONFLICT", message: "La propina solo está disponible después de completar el viaje." });
      const existing = await getTipForRide(ride.id);
      if (existing && !["failed", "cancelled"].includes(existing.status)) throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya tiene una propina registrada o en proceso." });

      const amountCents = Math.round(input.amount * 100);
      let tipId: string;
      if (existing) {
        const { data, error } = await supabase.from("taxi_ride_tips").update({
          amount_cents: amountCents,
          method: "card",
          status: "checkout_pending",
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          confirmed_at: null,
          confirmed_by: null,
        }).eq("id", existing.id).in("status", ["failed", "cancelled"]).select("id").maybeSingle();
        fail(error);
        if (!data) throw new TRPCError({ code: "CONFLICT", message: "La propina cambió mientras se preparaba el pago." });
        tipId = data.id;
      } else {
        const { data, error } = await supabase.from("taxi_ride_tips").insert({
          ride_id: ride.id,
          passenger_id: ride.passenger_id,
          driver_id: ride.driver_id,
          amount_cents: amountCents,
          method: "card",
          status: "checkout_pending",
        }).select("id").maybeSingle();
        if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Ya se está preparando otra propina para este viaje." });
        fail(error);
        if (!data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo reservar la propina." });
        tipId = data.id;
      }

      try {
        const base = appUrl();
        const params = new URLSearchParams({
          mode: "payment",
          success_url: `${base}/passenger/rides?tip=success&rideId=${ride.id}`,
          cancel_url: `${base}/passenger/rides?tip=cancelled&rideId=${ride.id}`,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(amountCents),
          "line_items[0][price_data][product_data][name]": "Propina Taximun",
          "line_items[0][price_data][product_data][description]": `Viaje ${ride.id.slice(0, 8).toUpperCase()} · para ${ride.driver_name || "el conductor"}`,
          "metadata[kind]": "ride_tip",
          "metadata[ride_id]": ride.id,
          "metadata[tip_id]": tipId,
          "metadata[passenger_id]": ride.passenger_id,
          "metadata[driver_id]": ride.driver_id,
        });
        params.append("payment_method_types[]", "card");
        const session = await stripePost("/checkout/sessions", params, `taximun-tip-${tipId}-${amountCents}`);
        const { data, error } = await supabase.from("taxi_ride_tips").update({ stripe_checkout_session_id: session.id }).eq("id", tipId).eq("status", "checkout_pending").select("*").single();
        fail(error);
        return { tip: data, checkoutUrl: session.url as string };
      } catch (error) {
        await supabase.from("taxi_ride_tips").update({ status: "failed" }).eq("id", tipId).is("stripe_checkout_session_id", null);
        throw error;
      }
    }),

  syncCardTip: protectedProcedure.input(z.object({ rideId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const ride = await rideForParticipant(input.rideId, ctx.user);
    if (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    if (!ride.driver_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene conductor." });
    const tip = await getTipForRide(ride.id);
    if (!tip?.stripe_checkout_session_id || tip.method !== "card") return tip;
    const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(tip.stripe_checkout_session_id)}`);
    const paid = session.payment_status === "paid";
    const { data, error } = await supabase.from("taxi_ride_tips").update({
      status: paid ? "paid" : session.status === "expired" ? "failed" : "checkout_pending",
      stripe_payment_intent_id: session.payment_intent || null,
      confirmed_at: paid ? new Date().toISOString() : null,
      confirmed_by: paid ? "stripe" : null,
    }).eq("id", tip.id).select("*").single();
    fail(error);
    if (paid && tip.status !== "paid") {
      await createTaxiNotification({
        recipientId: ride.driver_id,
        recipientRole: "driver",
        actorId: ride.passenger_id,
        actorRole: "passenger",
        type: "success",
        title: "Propina pagada",
        body: `${(tip.amount_cents / 100).toFixed(2)} € registrados para liquidación por el viaje ${ride.id.slice(0, 8).toUpperCase()}.`,
        actionUrl: "/driver/earnings",
        metadata: { rideId: ride.id, tipId: tip.id, amountCents: tip.amount_cents },
      });
    }
    return data;
  }),

  declareOfflineTip: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), amount: tipAmountSchema, method: z.enum(["cash", "bizum"]) }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForParticipant(input.rideId, ctx.user);
      if (ride.passenger_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el pasajero puede declarar la propina." });
      if (ride.status !== "completed" || !ride.driver_id) throw new TRPCError({ code: "CONFLICT", message: "El viaje todavía no admite propina." });
      const existing = await getTipForRide(ride.id);
      if (existing && !["cancelled", "failed"].includes(existing.status)) throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya tiene una propina registrada." });
      const values = {
        ride_id: ride.id,
        passenger_id: ride.passenger_id,
        driver_id: ride.driver_id,
        amount_cents: Math.round(input.amount * 100),
        method: input.method,
        status: "pending_confirmation",
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null,
        confirmed_at: null,
        confirmed_by: null,
      };
      const { data, error } = existing
        ? await supabase.from("taxi_ride_tips").update(values).eq("id", existing.id).in("status", ["cancelled", "failed"]).select("*").maybeSingle()
        : await supabase.from("taxi_ride_tips").insert(values).select("*").maybeSingle();
      if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Ya existe una propina para este viaje." });
      fail(error);
      if (!data) throw new TRPCError({ code: "CONFLICT", message: "La propina cambió mientras se registraba." });
      await createTaxiNotification({
        recipientId: ride.driver_id,
        recipientRole: "driver",
        actorId: ride.passenger_id,
        actorRole: "passenger",
        type: "info",
        title: "Propina pendiente de confirmar",
        body: `${input.amount.toFixed(2)} € por ${input.method === "bizum" ? "Bizum" : "efectivo"}. Confírmala solo cuando la hayas recibido.`,
        actionUrl: "/driver/earnings",
        metadata: { rideId: ride.id, tipId: data.id, method: input.method },
      });
      return data;
    }),

  listDriverPending: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "driver" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    let query = supabase.from("taxi_ride_tips").select("id,ride_id,passenger_id,driver_id,amount_cents,method,status,declared_at").eq("status", "pending_confirmation").order("declared_at", { ascending: false });
    if (ctx.user.role === "driver") query = query.eq("driver_id", ctx.user.openId);
    const { data, error } = await query.limit(20);
    fail(error);
    return data ?? [];
  }),

  confirmOfflineTip: protectedProcedure.input(z.object({ tipId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "driver" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const { data: tip, error } = await supabase.from("taxi_ride_tips").select("*").eq("id", input.tipId).maybeSingle();
    fail(error);
    if (!tip) throw new TRPCError({ code: "NOT_FOUND", message: "Propina no encontrada." });
    if (ctx.user.role === "driver" && tip.driver_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN" });
    if (tip.status !== "pending_confirmation") throw new TRPCError({ code: "CONFLICT", message: "La propina ya no está pendiente." });
    const { data, error: updateError } = await supabase.from("taxi_ride_tips").update({ status: "paid", confirmed_at: new Date().toISOString(), confirmed_by: ctx.user.openId }).eq("id", tip.id).eq("status", "pending_confirmation").select("*").maybeSingle();
    fail(updateError);
    if (!data) throw new TRPCError({ code: "CONFLICT", message: "La propina cambió mientras la confirmabas." });
    await createTaxiNotification({
      recipientId: tip.passenger_id,
      recipientRole: "passenger",
      actorId: ctx.user.openId,
      actorRole: ctx.user.role === "admin" ? "admin" : "driver",
      type: "success",
      title: "Propina confirmada",
      body: `El conductor ha confirmado ${(tip.amount_cents / 100).toFixed(2)} €.`,
      actionUrl: "/passenger/rides",
      metadata: { rideId: tip.ride_id, tipId: tip.id },
    });
    return data;
  }),
});
