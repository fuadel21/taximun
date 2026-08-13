import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { reconcileDriverTransferAfterRefund } from "./taxi-stripe-connect-router";
import { supabase } from "./supabase-client";

const STRIPE_API = "https://api.stripe.com/v1";
const PAYMENT_SUMMARY_SELECT = "id,ride_id,passenger_id,driver_id,provider,status,currency,amount_authorized,amount_captured,amount_refunded,platform_fee,driver_net,client_secret,provider_payment_intent_id,provider_charge_id,captured_at,created_at,updated_at";

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
  const { data, error } = await supabase
    .from("taxi_rides")
    .select("id,passenger_id,driver_id,status,estimated_fare,final_fare,fare_range_max,payment_method,quote_version")
    .eq("id", rideId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
  if (user.role !== "admin" && data.passenger_id !== user.openId && data.driver_id !== user.openId) throw new TRPCError({ code: "FORBIDDEN" });
  return data;
}

function authorizationAmountCents(ride: any) {
  const quotedMax = Number(ride.fare_range_max ?? 0);
  const quotedTotal = Number(ride.estimated_fare ?? 0);
  const amount = Math.max(quotedMax, quotedTotal);
  const cents = Math.ceil(amount * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 999900) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene un importe válido para autorizar." });
  }
  return cents;
}

async function paymentForRide(rideId: string) {
  const { data, error } = await supabase
    .from("taxi_payments")
    .select(PAYMENT_SUMMARY_SELECT)
    .eq("ride_id", rideId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return data ?? null;
}

function authorizationResponse(payment: any) {
  return {
    id: payment.id,
    ride_id: payment.ride_id,
    status: payment.status,
    amount_authorized: payment.amount_authorized,
    currency: payment.currency,
    client_secret: payment.client_secret,
    provider_payment_intent_id: payment.provider_payment_intent_id,
  };
}

async function updateExistingZeroBalancePayment(payment: any, ride: any, status?: string) {
  const patch: Record<string, unknown> = {
    driver_id: ride.driver_id ?? payment.driver_id ?? null,
    client_secret: null,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;

  const { data, error } = await supabase
    .from("taxi_payments")
    .update(patch)
    .eq("id", payment.id)
    .select(PAYMENT_SUMMARY_SELECT)
    .single();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return data;
}

async function recordZeroCardPayment(ride: any): Promise<any> {
  const existing = await paymentForRide(ride.id);

  if (!existing) {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("taxi_payments").insert({
      ride_id: ride.id,
      passenger_id: ride.passenger_id,
      driver_id: ride.driver_id ?? null,
      provider: "internal_zero_fare",
      provider_payment_intent_id: null,
      provider_charge_id: null,
      amount_authorized: 0,
      amount_captured: 0,
      amount_refunded: 0,
      platform_fee: 0,
      driver_net: 0,
      currency: "eur",
      status: "captured",
      client_secret: null,
      captured_at: now,
      updated_at: now,
    }).select(PAYMENT_SUMMARY_SELECT).single();

    if (error?.code === "23505") {
      return recordZeroCardPayment(ride);
    }
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data;
  }

  const captured = Number(existing.amount_captured || 0);
  const refunded = Number(existing.amount_refunded || 0);
  const netPaid = captured - refunded;

  if (!Number.isFinite(netPaid) || netPaid < 0) {
    throw new TRPCError({ code: "CONFLICT", message: "El libro contable del pago no es válido para cerrar el viaje a 0 €." });
  }

  if (netPaid > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Ya existe un cobro de tarjeta no reembolsado. Reembolsa primero el importe pendiente antes de cerrar el viaje a 0 €.",
    });
  }

  if (existing.provider === "internal_zero_fare") {
    if (captured !== 0 || refunded !== 0) {
      throw new TRPCError({ code: "CONFLICT", message: "El asiento interno de 0 € contiene importes incompatibles." });
    }
    return updateExistingZeroBalancePayment(existing, ride, "captured");
  }

  if (["pending", "authorized"].includes(String(existing.status))) {
    if (!existing.provider_payment_intent_id) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Existe una autorización de tarjeta incompleta sin identificador Stripe. Revisa el pago antes de cerrar el viaje a 0 €.",
      });
    }

    try {
      await stripeRequest(
        `/payment_intents/${existing.provider_payment_intent_id}/cancel`,
        new URLSearchParams(),
        `taximun-zero-cancel-${existing.id}`
      );
    } catch (error) {
      const message = error instanceof TRPCError ? error.message : "No se pudo cancelar la autorización Stripe.";
      throw new TRPCError({
        code: "CONFLICT",
        message: `La autorización Stripe no se pudo cancelar. No se modificó el libro contable. ${message}`,
      });
    }

    return updateExistingZeroBalancePayment(existing, ride, "cancelled");
  }

  if (String(existing.status) === "partially_refunded" && captured === refunded) {
    return updateExistingZeroBalancePayment(existing, ride, "refunded");
  }

  if (String(existing.status) === "captured" && captured > 0 && captured === refunded) {
    return updateExistingZeroBalancePayment(existing, ride, "refunded");
  }

  if (["cancelled", "failed", "refunded"].includes(String(existing.status))) {
    return updateExistingZeroBalancePayment(existing, ride);
  }

  if (String(existing.status) === "captured" && captured === 0) {
    return updateExistingZeroBalancePayment(existing, ride);
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "El pago existente no puede convertirse en un cierre de 0 € sin una cancelación o reembolso explícitos.",
  });
}

export const taxiPaymentsRouter = router({
  createAuthorization: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), paymentMethodId: z.string().min(3).optional() }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForUser(input.rideId, ctx.user);
      if (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el pasajero puede autorizar el pago." });
      if (!["pending", "assigned"].includes(ride.status)) throw new TRPCError({ code: "CONFLICT", message: "El viaje ya no admite una nueva autorización." });
      if (ride.payment_method !== "card") throw new TRPCError({ code: "CONFLICT", message: "Este viaje no fue reservado con pago por tarjeta." });
      if (!ride.quote_version) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene una cotización validada por el servidor." });

      const amountCents = authorizationAmountCents(ride);
      if (amountCents === 0) return recordZeroCardPayment(ride);

      const existing = await paymentForRide(ride.id);
      if (existing) {
        const reusable =
          existing.provider === "stripe" &&
          ["pending", "authorized"].includes(String(existing.status)) &&
          Boolean(existing.provider_payment_intent_id) &&
          Number(existing.amount_authorized || 0) === amountCents;

        if (reusable) return authorizationResponse(existing);

        throw new TRPCError({
          code: "CONFLICT",
          message: "Este viaje ya tiene un intento de pago registrado. No se sobrescribirá la trazabilidad Stripe; revisa o resuelve el pago existente antes de crear otra autorización.",
        });
      }

      const params = new URLSearchParams({
        amount: String(amountCents),
        currency: "eur",
        capture_method: "manual",
        confirm: input.paymentMethodId ? "true" : "false",
        "metadata[ride_id]": ride.id,
        "metadata[passenger_id]": ride.passenger_id,
      });
      if (input.paymentMethodId) params.set("payment_method", input.paymentMethodId);
      params.append("payment_method_types[]", "card");

      const intent = await stripeRequest("/payment_intents", params, `taximun-auth-${ride.id}-${amountCents}`);
      const { data, error } = await supabase.from("taxi_payments").insert({
        ride_id: ride.id,
        passenger_id: ride.passenger_id,
        driver_id: ride.driver_id ?? null,
        provider: "stripe",
        provider_payment_intent_id: intent.id,
        amount_authorized: amountCents,
        currency: "eur",
        status: intent.status === "requires_capture" ? "authorized" : "pending",
        client_secret: intent.client_secret,
        updated_at: new Date().toISOString(),
      }).select("id,ride_id,status,amount_authorized,currency,client_secret,provider_payment_intent_id").single();

      if (error?.code === "23505") {
        const raced = await paymentForRide(ride.id);
        if (raced && raced.provider === "stripe" && Number(raced.amount_authorized || 0) === amountCents) {
          return authorizationResponse(raced);
        }
        throw new TRPCError({ code: "CONFLICT", message: "Otro intento de pago se registró al mismo tiempo. Recarga el estado del viaje." });
      }
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  capture: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), finalAmount: z.number().min(0).max(9999) }))
    .mutation(async ({ ctx, input }) => {
      const ride = await rideForUser(input.rideId, ctx.user);
      if (ctx.user.role !== "driver" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      if (ctx.user.role === "driver" && ride.driver_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN" });
      if (ride.status !== "in_progress") throw new TRPCError({ code: "CONFLICT", message: "El viaje debe estar en curso para capturar el pago." });
      if (ride.payment_method !== "card") throw new TRPCError({ code: "CONFLICT", message: "Este viaje no está configurado para pago por tarjeta." });
      if (!ride.driver_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene conductor asignado." });

      const amountCents = Math.round(input.finalAmount * 100);
      if (amountCents === 0) return recordZeroCardPayment(ride);

      const { data: payment, error } = await supabase.from("taxi_payments").select("*").eq("ride_id", ride.id).maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!payment?.provider_payment_intent_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No existe una autorización de tarjeta." });
      if (amountCents > payment.amount_authorized) throw new TRPCError({ code: "BAD_REQUEST", message: "El importe final supera el importe autorizado." });

      const intent = await stripeRequest(
        `/payment_intents/${payment.provider_payment_intent_id}/capture`,
        new URLSearchParams({ amount_to_capture: String(amountCents) }),
        `taximun-capture-${payment.id}-${amountCents}`
      );
      const commissionBps = Number(process.env.TAXIMUN_COMMISSION_BPS || 1500);
      const platformFee = Math.round(amountCents * commissionBps / 10000);
      const driverNet = amountCents - platformFee;
      const { data, error: updateError } = await supabase.from("taxi_payments").update({
        driver_id: ride.driver_id,
        status: "captured",
        amount_captured: amountCents,
        platform_fee: platformFee,
        driver_net: driverNet,
        captured_at: new Date().toISOString(),
        provider_charge_id: intent.latest_charge || null,
        updated_at: new Date().toISOString(),
      }).eq("id", payment.id).select("*").single();
      if (updateError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      return data;
    }),

  refund: protectedProcedure
    .input(z.object({ rideId: z.string().uuid(), amount: z.number().positive().max(9999).optional(), reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).default("requested_by_customer") }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { data: payment, error } = await supabase.from("taxi_payments").select("*").eq("ride_id", input.rideId).maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!payment?.provider_payment_intent_id || !["captured", "partially_refunded"].includes(String(payment.status))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pago no se puede reembolsar." });
      }

      const params = new URLSearchParams({ payment_intent: payment.provider_payment_intent_id, reason: input.reason });
      if (input.amount) params.set("amount", String(Math.round(input.amount * 100)));
      const refundAttemptBase = Number(payment.amount_refunded || 0);
      const refund = await stripeRequest(
        "/refunds",
        params,
        `taximun-refund-${payment.id}-${input.amount ?? "full"}-${refundAttemptBase}`
      );
      const refunded = Number(refund.amount || 0);

      const { data: updatedPayment, error: ledgerError } = await supabase.rpc("taximun_record_payment_refund_atomic", {
        p_payment_id: payment.id,
        p_provider_refund_id: refund.id,
        p_amount: refunded,
        p_reason: input.reason,
        p_status: refund.status || "pending",
        p_requested_by: ctx.user.openId,
      });
      if (ledgerError) {
        const message = String(ledgerError.message || "");
        if (message.includes("REFUND_EXCEEDS_CAPTURE")) {
          throw new TRPCError({ code: "CONFLICT", message: "El reembolso supera el importe capturado registrado." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }

      const ledger = Array.isArray(updatedPayment) ? updatedPayment[0] : updatedPayment;
      const transferRecovery = refund.status === "succeeded"
        ? await reconcileDriverTransferAfterRefund(payment.id, ctx.user.openId)
        : null;
      return {
        id: refund.id,
        amount: refunded,
        status: refund.status,
        payment: ledger ?? null,
        transfer_recovery: transferRecovery,
      };
    }),

  getForRide: protectedProcedure.input(z.object({ rideId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await rideForUser(input.rideId, ctx.user);
    const { data, error } = await supabase.from("taxi_payments").select("id,ride_id,provider,status,currency,amount_authorized,amount_captured,amount_refunded,platform_fee,driver_net,provider_payment_intent_id,created_at,updated_at,captured_at").eq("ride_id", input.rideId).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? null;
  }),
});
