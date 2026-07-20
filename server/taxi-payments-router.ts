import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe no está configurado." });
  return key;
}

async function stripeRequest(path: string, params: URLSearchParams, idempotencyKey?: string) {
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

async function rideForUser(rideId: string, user: any) {
  const { data, error } = await supabase.from("taxi_rides").select("id,passenger_id,driver_id,status,estimated_fare,final_fare").eq("id", rideId).maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  if (user.role !== "admin" && data.passenger_id !== user.openId && data.driver_id !== user.openId) throw new TRPCError({ code: "FORBIDDEN" });
  return data;
}

export const taxiPaymentsRouter = router({
  createAuthorization: protectedProcedure.input(z.object({ rideId: z.string().uuid(), amount: z.number().positive().max(9999), paymentMethodId: z.string().min(3).optional() })).mutation(async ({ ctx, input }) => {
    const ride = await rideForUser(input.rideId, ctx.user);
    if (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el pasajero puede autorizar el pago." });
    if (!["pending", "assigned"].includes(ride.status)) throw new TRPCError({ code: "CONFLICT", message: "El viaje ya no admite una nueva autorización." });
    const amountCents = Math.round(input.amount * 100);
    const params = new URLSearchParams({ amount: String(amountCents), currency: "eur", capture_method: "manual", confirm: input.paymentMethodId ? "true" : "false", "metadata[ride_id]": ride.id, "metadata[passenger_id]": ride.passenger_id });
    if (input.paymentMethodId) params.set("payment_method", input.paymentMethodId);
    params.append("payment_method_types[]", "card");
    const intent = await stripeRequest("/payment_intents", params, `taximun-auth-${ride.id}-${amountCents}`);
    const { data, error } = await supabase.from("taxi_payments").upsert({ ride_id: ride.id, passenger_id: ride.passenger_id, driver_id: ride.driver_id, provider: "stripe", provider_payment_intent_id: intent.id, amount_authorized: amountCents, currency: "eur", status: intent.status === "requires_capture" ? "authorized" : "pending", client_secret: intent.client_secret, updated_at: new Date().toISOString() }, { onConflict: "ride_id" }).select("id,ride_id,status,amount_authorized,currency,client_secret,provider_payment_intent_id").single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data;
  }),

  capture: protectedProcedure.input(z.object({ rideId: z.string().uuid(), finalAmount: z.number().positive().max(9999) })).mutation(async ({ ctx, input }) => {
    const ride = await rideForUser(input.rideId, ctx.user);
    if (ctx.user.role !== "driver" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    if (ctx.user.role === "driver" && ride.driver_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN" });
    const { data: payment, error } = await supabase.from("taxi_payments").select("*").eq("ride_id", ride.id).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!payment?.provider_payment_intent_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No existe una autorización de tarjeta." });
    const amountCents = Math.round(input.finalAmount * 100);
    if (amountCents > payment.amount_authorized) throw new TRPCError({ code: "BAD_REQUEST", message: "El importe final supera el importe autorizado." });
    const intent = await stripeRequest(`/payment_intents/${payment.provider_payment_intent_id}/capture`, new URLSearchParams({ amount_to_capture: String(amountCents) }), `taximun-capture-${payment.id}-${amountCents}`);
    const commissionBps = Number(process.env.TAXIMUN_COMMISSION_BPS || 1500);
    const platformFee = Math.round(amountCents * commissionBps / 10000);
    const driverNet = amountCents - platformFee;
    const { data, error: updateError } = await supabase.from("taxi_payments").update({ status: "captured", amount_captured: amountCents, platform_fee: platformFee, driver_net: driverNet, captured_at: new Date().toISOString(), provider_charge_id: intent.latest_charge || null, updated_at: new Date().toISOString() }).eq("id", payment.id).select("*").single();
    if (updateError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
    return data;
  }),

  refund: protectedProcedure.input(z.object({ rideId: z.string().uuid(), amount: z.number().positive().max(9999).optional(), reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).default("requested_by_customer") })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const { data: payment, error } = await supabase.from("taxi_payments").select("*").eq("ride_id", input.rideId).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!payment?.provider_payment_intent_id || payment.status !== "captured") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pago no se puede reembolsar." });
    const params = new URLSearchParams({ payment_intent: payment.provider_payment_intent_id, reason: input.reason });
    if (input.amount) params.set("amount", String(Math.round(input.amount * 100)));
    const refund = await stripeRequest("/refunds", params, `taximun-refund-${payment.id}-${input.amount ?? "full"}`);
    const refunded = Number(refund.amount || 0);
    await supabase.from("taxi_payment_refunds").insert({ payment_id: payment.id, provider_refund_id: refund.id, amount: refunded, reason: input.reason, status: refund.status || "pending", requested_by: ctx.user.openId });
    await supabase.from("taxi_payments").update({ status: refunded >= payment.amount_captured ? "refunded" : "partially_refunded", amount_refunded: Number(payment.amount_refunded || 0) + refunded, updated_at: new Date().toISOString() }).eq("id", payment.id);
    return { id: refund.id, amount: refunded, status: refund.status };
  }),

  getForRide: protectedProcedure.input(z.object({ rideId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await rideForUser(input.rideId, ctx.user);
    const { data, error } = await supabase.from("taxi_payments").select("id,ride_id,status,currency,amount_authorized,amount_captured,amount_refunded,platform_fee,driver_net,provider_payment_intent_id,created_at,updated_at,captured_at").eq("ride_id", input.rideId).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? null;
  }),
});
