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

export const taxiStripeConnectRouter = router({
  createOrGetAccount: protectedProcedure
    .input(z.object({ country: z.string().length(2).default("ES"), email: z.string().email().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireDriver(ctx.user);
      const driverId = ctx.user.openId;
      const { data: existing, error } = await supabase.from("taxi_driver_connect_accounts").select("*").eq("driver_id", driverId).maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (existing?.stripe_account_id) return existing;

      const params = new URLSearchParams({
        type: "express",
        country: input.country.toUpperCase(),
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[driver_id]": driverId,
      });
      if (input.email) params.set("email", input.email);

      const account = await stripeRequest("/accounts", params, "POST", `taximun-connect-account-${driverId}`);
      const { data, error: upsertError } = await supabase.from("taxi_driver_connect_accounts").upsert({
        driver_id: driverId,
        stripe_account_id: account.id,
        country: account.country || input.country.toUpperCase(),
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
    .input(z.object({ refreshUrl: z.string().url(), returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      requireDriver(ctx.user);
      const { data: account, error } = await supabase.from("taxi_driver_connect_accounts").select("stripe_account_id").eq("driver_id", ctx.user.openId).maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!account?.stripe_account_id) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Primero crea la cuenta Stripe Connect." });
      const link = await stripeRequest("/account_links", new URLSearchParams({
        account: account.stripe_account_id,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: "account_onboarding",
      }));
      return { url: link.url, expiresAt: link.expires_at };
    }),

  refreshStatus: protectedProcedure.mutation(async ({ ctx }) => {
    requireDriver(ctx.user);
    const { data: local, error } = await supabase.from("taxi_driver_connect_accounts").select("*").eq("driver_id", ctx.user.openId).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!local?.stripe_account_id) return null;
    const account = await stripeRequest(`/accounts/${local.stripe_account_id}`, undefined, "GET");
    const status = account.payouts_enabled ? "enabled" : account.requirements?.disabled_reason ? "restricted" : "onboarding";
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
      const { data: payment, error } = await supabase.from("taxi_payments").select("id,ride_id,driver_id,status,currency,driver_net,provider_charge_id").eq("ride_id", input.rideId).maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!payment || payment.status !== "captured" || payment.driver_net <= 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El viaje no tiene saldo capturado para liquidar." });
      if (ctx.user.role === "driver" && payment.driver_id !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN" });

      const { data: connect } = await supabase.from("taxi_driver_connect_accounts").select("stripe_account_id,payouts_enabled").eq("driver_id", payment.driver_id).maybeSingle();
      if (!connect?.stripe_account_id || !connect.payouts_enabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La cuenta del conductor todavía no admite liquidaciones." });

      const existing = await supabase.from("taxi_driver_transfers").select("*").eq("payment_id", payment.id).maybeSingle();
      if (existing.data?.stripe_transfer_id) return existing.data;

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
      const { data, error: insertError } = await supabase.from("taxi_driver_transfers").upsert({
        payment_id: payment.id,
        ride_id: payment.ride_id,
        driver_id: payment.driver_id,
        stripe_account_id: connect.stripe_account_id,
        stripe_transfer_id: transfer.id,
        amount: payment.driver_net,
        currency: payment.currency,
        status: transfer.reversed ? "reversed" : "paid",
        paid_at: new Date().toISOString(),
      }, { onConflict: "payment_id" }).select("*").single();
      if (insertError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: insertError.message });
      return data;
    }),

  getMyAccount: protectedProcedure.query(async ({ ctx }) => {
    requireDriver(ctx.user);
    const { data, error } = await supabase.from("taxi_driver_connect_accounts").select("*").eq("driver_id", ctx.user.openId).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? null;
  }),
});
