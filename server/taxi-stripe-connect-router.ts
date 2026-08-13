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

async function stripeRequest(path: string, params?: URLSearchParams, method: "POST" | "GET" = "POST", idempotencyKey?: string) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? params?.toString() : undefined,
  });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new TRPCError({ code: "BAD_REQUEST", message: json?.error?.message || "Stripe rechazó la operación." });
  return json;
}

function requireDriver(user: any) {
  if (user.role !== "driver" && user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
}

function appUrl() {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:5173";
}

async function getConnectAccount(driverId: string) {
  const { data, error } = await supabase
    .from("taxi_driver_connect_accounts")
    .select("*")
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return data ?? null;
}

async function assertNoPayoutHold(paymentId: string) {
  const { data, error } = await supabase
    .from("taxi_payment_disputes")
    .select("id,status,payout_action")
    .eq("payment_id", paymentId)
    .in("payout_action", ["hold", "reverse"])
    .limit(1);
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if ((data || []).length > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "La liquidación está bloqueada por una disputa o contracargo." });
  }
}

export async function transferCapturedRideEarnings(rideId: string, requestedBy: string) {
  const { data: payment, error: paymentError } = await supabase
    .from("taxi_payments")
    .select("id,ride_id,driver_id,status,currency,driver_net,provider_charge_id,amount_captured,amount_refunded")
    .eq("ride_id", rideId)
    .maybeSingle();
  if (paymentError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: paymentError.message });
  if (!payment || payment.status !== "captured" || Number(payment.driver_net || 0) <= 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene saldo capturado para liquidar." });
  }
  if (!payment.driver_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El pago no tiene conductor asociado." });
  if (Number(payment.amount_refunded || 0) > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "El pago ya tiene reembolsos y no puede iniciar una liquidación nueva." });
  }

  const { data: ride, error: rideError } = await supabase
    .from("taxi_rides")
    .select("id,driver_id,status,payment_method,payment_status")
    .eq("id", rideId)
    .maybeSingle();
  if (rideError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: rideError.message });
  if (!ride || ride.status !== "completed" || ride.payment_method !== "card" || ride.payment_status !== "paid") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje debe estar completado y cobrado por tarjeta antes de liquidarlo." });
  }
  if (ride.driver_id !== payment.driver_id) {
    throw new TRPCError({ code: "CONFLICT", message: "El conductor del viaje no coincide con el libro de pagos." });
  }

  await assertNoPayoutHold(payment.id);

  const connect = await getConnectAccount(payment.driver_id);
  if (!connect?.stripe_account_id || !connect.payouts_enabled || connect.status !== "enabled") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La cuenta Stripe Connect del conductor todavía no admite liquidaciones." });
  }

  const { data: existing, error: existingError } = await supabase
    .from("taxi_driver_transfers")
    .select("*")
    .eq("payment_id", payment.id)
    .maybeSingle();
  if (existingError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existingError.message });
  if (existing?.stripe_transfer_id) return existing;

  const params = new URLSearchParams({
    amount: String(payment.driver_net),
    currency: payment.currency,
    destination: connect.stripe_account_id,
    transfer_group: `ride_${payment.ride_id}`,
    "metadata[ride_id]": payment.ride_id,
    "metadata[payment_id]": payment.id,
    "metadata[driver_id]": payment.driver_id,
  });
  if (payment.provider_charge_id) params.set("source_transaction", payment.provider_charge_id);

  const transfer = await stripeRequest("/transfers", params, "POST", `taximun-transfer-${payment.id}`);
  const now = new Date().toISOString();
  const { data, error: insertError } = await supabase.from("taxi_driver_transfers").upsert({
    payment_id: payment.id,
    ride_id: payment.ride_id,
    driver_id: payment.driver_id,
    stripe_account_id: connect.stripe_account_id,
    stripe_transfer_id: transfer.id,
    amount: Number(payment.driver_net),
    currency: payment.currency,
    status: transfer.reversed ? "reversed" : "paid",
    amount_reversed: Number(transfer.amount_reversed || 0),
    refund_reversal_pending: false,
    paid_at: transfer.reversed ? null : now,
    reversed_at: transfer.reversed ? now : null,
    failure_code: null,
    failure_message: null,
    last_attempt_at: now,
    attempt_count: Number(existing?.attempt_count || 0) + 1,
    last_requested_by: requestedBy,
  }, { onConflict: "payment_id" }).select("*").single();
  if (insertError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: insertError.message });
  return data;
}

export async function tryTransferCapturedRideEarnings(rideId: string, requestedBy: string) {
  try {
    const transfer = await transferCapturedRideEarnings(rideId, requestedBy);
    return { ok: true as const, transfer };
  } catch (error) {
    return {
      ok: false as const,
      transfer: null,
      message: error instanceof Error ? error.message : "No se pudo liquidar el viaje al conductor.",
    };
  }
}

async function reconcileTransferRecovery(paymentId: string, recoveredCustomerCents: number, reasonKey: string, requestedBy: string) {
  const { data: transfer, error: transferError } = await supabase
    .from("taxi_driver_transfers")
    .select("*")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (transferError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: transferError.message });
  if (!transfer?.stripe_transfer_id || transfer.status === "failed") {
    return { ok: true as const, action: "not_required" as const, transfer: transfer ?? null };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("taxi_payments")
    .select("id,amount_captured,amount_refunded,driver_net")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: paymentError.message });
  if (!payment || Number(payment.amount_captured || 0) <= 0) {
    return { ok: true as const, action: "not_required" as const, transfer };
  }

  const captured = Number(payment.amount_captured || 0);
  const recovered = Math.min(captured, Math.max(0, Math.round(recoveredCustomerCents)));
  const targetReversed = Math.min(Number(transfer.amount || 0), Math.round(Number(transfer.amount || 0) * recovered / captured));
  const alreadyReversed = Number(transfer.amount_reversed || 0);

  if (targetReversed <= alreadyReversed) {
    if (transfer.refund_reversal_pending) {
      await supabase.from("taxi_driver_transfers").update({
        refund_reversal_pending: false,
        failure_code: null,
        failure_message: null,
      }).eq("id", transfer.id);
    }
    return { ok: true as const, action: "already_reconciled" as const, transfer };
  }

  const delta = targetReversed - alreadyReversed;
  const params = new URLSearchParams({
    amount: String(delta),
    "metadata[payment_id]": paymentId,
    "metadata[reason]": reasonKey,
  });
  const attemptCount = Number(transfer.attempt_count || 0) + 1;
  const now = new Date().toISOString();

  try {
    const reversal = await stripeRequest(
      `/transfers/${encodeURIComponent(transfer.stripe_transfer_id)}/reversals`,
      params,
      "POST",
      `taximun-transfer-reversal-${transfer.id}-${targetReversed}`
    );

    const fullyReversed = targetReversed >= Number(transfer.amount || 0);
    const { data: updated, error } = await supabase.from("taxi_driver_transfers").update({
      amount_reversed: targetReversed,
      last_reversal_id: reversal.id || transfer.last_reversal_id || null,
      refund_reversal_pending: false,
      status: fullyReversed ? "reversed" : "paid",
      reversed_at: fullyReversed ? now : null,
      failure_code: null,
      failure_message: null,
      payout_blocked_reason: fullyReversed ? reasonKey : null,
      last_attempt_at: now,
      attempt_count: attemptCount,
      last_requested_by: requestedBy,
    }).eq("id", transfer.id).select("*").single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return { ok: true as const, action: "reversed" as const, reversedAmount: delta, transfer: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe no pudo revertir la transferencia.";
    const { data: updated } = await supabase.from("taxi_driver_transfers").update({
      refund_reversal_pending: true,
      failure_message: message.slice(0, 1000),
      payout_blocked_reason: reasonKey,
      last_attempt_at: now,
      attempt_count: attemptCount,
      last_requested_by: requestedBy,
    }).eq("id", transfer.id).select("*").maybeSingle();
    return { ok: false as const, action: "reversal_pending" as const, message, transfer: updated ?? transfer };
  }
}

export async function reconcileDriverTransferAfterRefund(paymentId: string, requestedBy = "stripe_refund") {
  const { data: payment, error } = await supabase
    .from("taxi_payments")
    .select("amount_refunded")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return reconcileTransferRecovery(paymentId, Number(payment?.amount_refunded || 0), "refund_reversal", requestedBy);
}

export async function reconcileDriverTransferAfterLostDispute(paymentId: string, disputeAmount: number, disputeId: string) {
  const { data: payment, error } = await supabase
    .from("taxi_payments")
    .select("amount_captured,amount_refunded")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  const recovered = Math.min(
    Number(payment?.amount_captured || 0),
    Number(payment?.amount_refunded || 0) + Math.max(0, Number(disputeAmount || 0))
  );
  return reconcileTransferRecovery(paymentId, recovered, `stripe_dispute_lost:${disputeId}`, "stripe_dispute");
}

export const taxiStripeConnectRouter = router({
  createOrGetAccount: protectedProcedure
    .input(z.object({ country: z.string().length(2).default("ES"), email: z.string().email().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      requireDriver(ctx.user);
      const driverId = ctx.user.openId;
      const existing = await getConnectAccount(driverId);
      if (existing?.stripe_account_id) return existing;

      const country = (input?.country || "ES").toUpperCase();
      const params = new URLSearchParams({
        type: "express",
        country,
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[driver_id]": driverId,
      });
      if (input?.email) params.set("email", input.email);

      const account = await stripeRequest("/accounts", params, "POST", `taximun-connect-account-${driverId}`);
      const { data, error: upsertError } = await supabase.from("taxi_driver_connect_accounts").upsert({
        driver_id: driverId,
        stripe_account_id: account.id,
        country: account.country || country,
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        requirements_due: account.requirements?.currently_due || [],
        status: account.payouts_enabled ? "enabled" : "onboarding",
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" }).select("*").single();
      if (upsertError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: upsertError.message });
      return data;
    }),

  createOnboardingLink: protectedProcedure
    .input(z.object({ refreshUrl: z.string().url().optional(), returnUrl: z.string().url().optional() }).optional())
    .mutation(async ({ ctx }) => {
      requireDriver(ctx.user);
      const account = await getConnectAccount(ctx.user.openId);
      if (!account?.stripe_account_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Primero crea la cuenta Stripe Connect." });
      const base = appUrl();
      const link = await stripeRequest("/account_links", new URLSearchParams({
        account: account.stripe_account_id,
        refresh_url: `${base}/driver/earnings?connect=refresh`,
        return_url: `${base}/driver/earnings?connect=return`,
        type: "account_onboarding",
      }));
      return { url: link.url, expiresAt: link.expires_at };
    }),

  refreshStatus: protectedProcedure.mutation(async ({ ctx }) => {
    requireDriver(ctx.user);
    const local = await getConnectAccount(ctx.user.openId);
    if (!local?.stripe_account_id) return null;
    const account = await stripeRequest(`/accounts/${local.stripe_account_id}`, undefined, "GET");
    const status = account.payouts_enabled && account.charges_enabled
      ? "enabled"
      : account.requirements?.disabled_reason
        ? "restricted"
        : "onboarding";
    const { data, error: updateError } = await supabase.from("taxi_driver_connect_accounts").update({
      charges_enabled: Boolean(account.charges_enabled),
      payouts_enabled: Boolean(account.payouts_enabled),
      details_submitted: Boolean(account.details_submitted),
      requirements_due: account.requirements?.currently_due || [],
      disabled_reason: account.requirements?.disabled_reason || null,
      status,
      updated_at: new Date().toISOString(),
    }).eq("driver_id", ctx.user.openId).select("*").single();
    if (updateError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
    return data;
  }),

  transferRideEarnings: protectedProcedure
    .input(z.object({ rideId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      requireDriver(ctx.user);
      if (ctx.user.role === "driver") {
        const { data: ride } = await supabase.from("taxi_rides").select("driver_id").eq("id", input.rideId).maybeSingle();
        if (!ride || ride.driver_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN" });
      }
      return transferCapturedRideEarnings(input.rideId, ctx.user.openId);
    }),

  retryRecovery: protectedProcedure
    .input(z.object({ paymentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return reconcileDriverTransferAfterRefund(input.paymentId, ctx.user.openId);
    }),

  getPayoutOverview: protectedProcedure.query(async ({ ctx }) => {
    requireDriver(ctx.user);
    const driverId = ctx.user.openId;
    const [accountResult, transferResult, paymentResult] = await Promise.all([
      supabase.from("taxi_driver_connect_accounts").select("*").eq("driver_id", driverId).maybeSingle(),
      supabase.from("taxi_driver_transfers").select("*").eq("driver_id", driverId).order("created_at", { ascending: false }).limit(100),
      supabase.from("taxi_payments").select("id,ride_id,status,currency,driver_net,amount_captured,amount_refunded,captured_at").eq("driver_id", driverId).order("captured_at", { ascending: false }).limit(100),
    ]);
    if (accountResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: accountResult.error.message });
    if (transferResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: transferResult.error.message });
    if (paymentResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: paymentResult.error.message });

    const payments = paymentResult.data || [];
    const rideIds = payments.map((payment: any) => payment.ride_id).filter(Boolean);
    const { data: rides, error: ridesError } = rideIds.length
      ? await supabase.from("taxi_rides").select("id,status,payment_method,payment_status,dropoff_address,completed_at").in("id", rideIds)
      : { data: [], error: null } as any;
    if (ridesError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ridesError.message });

    const rideMap = new Map((rides || []).map((ride: any) => [ride.id, ride]));
    const transferMap = new Map((transferResult.data || []).map((transfer: any) => [transfer.payment_id, transfer]));
    const account = accountResult.data ?? null;

    const items = payments.map((payment: any) => {
      const ride: any = rideMap.get(payment.ride_id) || null;
      const transfer: any = transferMap.get(payment.id) || null;
      const connectReady = Boolean(account?.stripe_account_id && account?.payouts_enabled && account?.status === "enabled");
      const eligible = Boolean(
        ride?.status === "completed" &&
        ride?.payment_method === "card" &&
        ride?.payment_status === "paid" &&
        payment.status === "captured" &&
        Number(payment.driver_net || 0) > 0 &&
        Number(payment.amount_refunded || 0) === 0 &&
        !transfer
      );
      let state = "not_eligible";
      if (transfer?.refund_reversal_pending) state = "recovery_pending";
      else if (transfer && Number(transfer.amount_reversed || 0) >= Number(transfer.amount || 0)) state = "reversed";
      else if (transfer && Number(transfer.amount_reversed || 0) > 0) state = "partially_reversed";
      else if (transfer) state = String(transfer.status || "paid");
      else if (eligible && connectReady) state = "ready";
      else if (eligible) state = "connect_required";

      return { payment, ride, transfer, state };
    });

    return { account, items };
  }),

  getMyAccount: protectedProcedure.query(async ({ ctx }) => {
    requireDriver(ctx.user);
    return getConnectAccount(ctx.user.openId);
  }),
});
