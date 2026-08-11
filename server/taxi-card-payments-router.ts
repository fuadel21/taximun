import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe no está configurado." });
  return key;
}

function stripePublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
  return /^pk_(test|live)_/.test(key) ? key : "";
}

async function stripeGet(path: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey()}` },
  });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: json?.error?.message || "Stripe rechazó la consulta." });
  }
  return json;
}

async function stripePost(path: string, params = new URLSearchParams(), idempotencyKey?: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: params.toString(),
  });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: json?.error?.message || "Stripe rechazó la operación." });
  }
  return json;
}

async function rideForUser(rideId: string, user: any) {
  const { data, error } = await supabase
    .from("taxi_rides")
    .select("id,passenger_id,driver_id,status,payment_method,estimated_fare,fare_range_max")
    .eq("id", rideId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  if (user.role !== "admin" && data.passenger_id !== user.openId && data.driver_id !== user.openId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return data;
}

async function paymentForRide(rideId: string) {
  const { data, error } = await supabase
    .from("taxi_payments")
    .select("id,ride_id,passenger_id,driver_id,provider,status,currency,amount_authorized,amount_captured,amount_refunded,client_secret,provider_payment_intent_id,provider_charge_id,updated_at")
    .eq("ride_id", rideId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return data ?? null;
}

async function updatePaymentState(paymentId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("taxi_payments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", paymentId)
    .select("id,ride_id,provider,status,currency,amount_authorized,amount_captured,amount_refunded,provider_payment_intent_id,updated_at")
    .single();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return data;
}

export async function syncCardAuthorizationForRide(rideId: string) {
  const payment = await paymentForRide(rideId);
  if (!payment) return null;
  if (payment.provider === "internal_zero_fare") return payment;
  if (!payment.provider_payment_intent_id) return payment;
  if (["captured", "partially_refunded", "refunded", "cancelled"].includes(String(payment.status))) {
    return payment;
  }

  const intent = await stripeGet(`/payment_intents/${encodeURIComponent(payment.provider_payment_intent_id)}`);
  if (intent?.metadata?.ride_id && intent.metadata.ride_id !== rideId) {
    throw new TRPCError({ code: "CONFLICT", message: "La autorización Stripe no pertenece a este viaje." });
  }

  if (intent.status === "requires_capture") {
    return updatePaymentState(payment.id, { status: "authorized" });
  }
  if (intent.status === "canceled") {
    return updatePaymentState(payment.id, { status: "cancelled", client_secret: null });
  }
  if (intent.status === "succeeded") {
    if (String(payment.status) === "captured") return payment;
    throw new TRPCError({ code: "CONFLICT", message: "Stripe indica un cobro completado que todavía no está conciliado en Taximun." });
  }

  return updatePaymentState(payment.id, { status: "pending" });
}

export async function ensureCardAuthorizationForStart(rideId: string, driverId?: string | null) {
  const { data: ride, error } = await supabase
    .from("taxi_rides")
    .select("id,driver_id,payment_method,estimated_fare,fare_range_max")
    .eq("id", rideId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  if (driverId && ride.driver_id !== driverId) throw new TRPCError({ code: "FORBIDDEN", message: "Este viaje no está asignado a tu cuenta." });
  if (ride.payment_method !== "card") return;

  const expectedCents = Math.ceil(Math.max(Number(ride.fare_range_max || 0), Number(ride.estimated_fare || 0)) * 100);
  if (expectedCents === 0) return;

  const payment = await syncCardAuthorizationForRide(rideId);
  if (!payment || payment.status !== "authorized" || Number(payment.amount_authorized || 0) < expectedCents) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pasajero debe autorizar la tarjeta antes de iniciar el viaje." });
  }
}

export async function releaseCardAuthorizationForCancelledRide(rideId: string) {
  try {
    const payment = await paymentForRide(rideId);
    if (!payment) return { released: true, status: "not_required" as const };
    if (payment.provider === "internal_zero_fare") return { released: true, status: "zero_fare" as const };
    if (["cancelled", "failed", "refunded"].includes(String(payment.status))) {
      return { released: true, status: String(payment.status) };
    }
    if (Number(payment.amount_captured || 0) > Number(payment.amount_refunded || 0)) {
      return { released: false, status: String(payment.status), message: "Existe un cobro real que requiere revisión o reembolso." };
    }
    if (!payment.provider_payment_intent_id) {
      return { released: false, status: String(payment.status), message: "Falta el identificador de la autorización Stripe." };
    }

    const intent = await stripeGet(`/payment_intents/${encodeURIComponent(payment.provider_payment_intent_id)}`);
    if (intent.status === "canceled") {
      await updatePaymentState(payment.id, { status: "cancelled", client_secret: null });
      return { released: true, status: "cancelled" as const };
    }
    if (intent.status === "succeeded") {
      return { released: false, status: "captured", message: "Stripe indica que el pago ya fue capturado; requiere reembolso administrativo." };
    }

    await stripePost(
      `/payment_intents/${encodeURIComponent(payment.provider_payment_intent_id)}/cancel`,
      new URLSearchParams({ cancellation_reason: "requested_by_customer" }),
      `taximun-cancel-auth-${payment.id}`
    );
    await updatePaymentState(payment.id, { status: "cancelled", client_secret: null });
    return { released: true, status: "cancelled" as const };
  } catch (error) {
    return {
      released: false,
      status: "release_failed" as const,
      message: error instanceof Error ? error.message : "No se pudo liberar la retención Stripe.",
    };
  }
}

export const taxiCardPaymentsRouter = router({
  getClientConfig: protectedProcedure.query(() => {
    const publishableKey = stripePublishableKey();
    return {
      configured: Boolean(publishableKey && process.env.STRIPE_SECRET_KEY),
      publishableKey: publishableKey || null,
    };
  }),

  syncAuthorization: protectedProcedure
    .input(z.object({ rideId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForUser(input.rideId, ctx.user);
      if (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo el pasajero puede comprobar su autorización." });
      }
      return syncCardAuthorizationForRide(input.rideId);
    }),

  releaseAuthorization: protectedProcedure
    .input(z.object({ rideId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForUser(input.rideId, ctx.user);
      if (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (!["cancelled", "rejected"].includes(String(ride.status))) {
        throw new TRPCError({ code: "CONFLICT", message: "La retención solo se puede liberar desde un viaje cancelado o rechazado." });
      }
      const result = await releaseCardAuthorizationForCancelledRide(input.rideId);
      if (!result.released) throw new TRPCError({ code: "CONFLICT", message: result.message || "No se pudo liberar la retención." });
      return result;
    }),
});
