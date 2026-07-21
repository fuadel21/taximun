import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { supabase } from "./supabase-client";

const WEBHOOK_PATH = "/api/webhooks/stripe";
const TOLERANCE_SECONDS = 300;

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyStripeSignature(payload: Buffer, header: string, secret: string) {
  const parts = header.split(",").map(part => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload.toString("utf8")}`).digest("hex");
  return signatures.some(signature => secureEqual(expected, signature));
}

function paymentStatusForIntent(status: string) {
  if (status === "requires_capture") return "authorized";
  if (status === "succeeded") return "captured";
  if (status === "canceled") return "cancelled";
  if (status === "requires_payment_method") return "failed";
  return "pending";
}

async function syncPaymentIntent(intent: any) {
  const rideId = intent?.metadata?.ride_id;
  if (!rideId || !intent?.id) return;
  const amountCaptured = Number(intent.amount_received || 0);
  const commissionBps = Number(process.env.TAXIMUN_COMMISSION_BPS || 1500);
  const platformFee = Math.round(amountCaptured * commissionBps / 10000);
  await supabase.from("taxi_payments").update({
    status: paymentStatusForIntent(intent.status),
    amount_authorized: Number(intent.amount || 0),
    amount_captured: amountCaptured,
    platform_fee: platformFee,
    driver_net: Math.max(0, amountCaptured - platformFee),
    provider_charge_id: typeof intent.latest_charge === "string" ? intent.latest_charge : null,
    captured_at: intent.status === "succeeded" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("provider_payment_intent_id", intent.id);
}

async function syncRefund(refund: any) {
  if (!refund?.id || !refund?.payment_intent) return;
  const { data: payment } = await supabase.from("taxi_payments").select("id,amount_captured,amount_refunded").eq("provider_payment_intent_id", refund.payment_intent).maybeSingle();
  if (!payment) return;
  await supabase.from("taxi_payment_refunds").upsert({
    payment_id: payment.id,
    provider_refund_id: refund.id,
    amount: Number(refund.amount || 0),
    reason: refund.reason || "requested_by_customer",
    status: refund.status || "pending",
    requested_by: "stripe_webhook",
  }, { onConflict: "provider_refund_id" });
  const { data: refunds } = await supabase.from("taxi_payment_refunds").select("amount,status").eq("payment_id", payment.id).eq("status", "succeeded");
  const totalRefunded = (refunds || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  await supabase.from("taxi_payments").update({
    amount_refunded: totalRefunded,
    status: totalRefunded >= Number(payment.amount_captured || 0) ? "refunded" : "partially_refunded",
    updated_at: new Date().toISOString(),
  }).eq("id", payment.id);
}

async function processEvent(event: any) {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled":
      await syncPaymentIntent(event.data.object);
      break;
    case "refund.created":
    case "refund.updated":
      await syncRefund(event.data.object);
      break;
    default:
      break;
  }
}

export function registerStripeWebhook(app: Express) {
  app.post(WEBHOOK_PATH, async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.header("stripe-signature") || "";
    const rawBody = req.body as Buffer;
    if (!secret) return res.status(503).json({ ok: false, error: "Stripe webhook no configurado" });
    if (!Buffer.isBuffer(rawBody) || !verifyStripeSignature(rawBody, signature, secret)) return res.status(400).json({ ok: false, error: "Firma inválida" });

    let event: any;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { return res.status(400).json({ ok: false, error: "JSON inválido" }); }

    const { data: existing } = await supabase.from("taxi_stripe_webhook_events").select("id,status").eq("stripe_event_id", event.id).maybeSingle();
    if (existing?.status === "processed") return res.json({ ok: true, duplicate: true });

    const { data: audit, error: auditError } = await supabase.from("taxi_stripe_webhook_events").upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      api_version: event.api_version || null,
      livemode: Boolean(event.livemode),
      payload: event,
      status: "processing",
      attempts: Number(existing ? 1 : 0) + 1,
      last_error: null,
      received_at: new Date().toISOString(),
    }, { onConflict: "stripe_event_id" }).select("id").single();
    if (auditError) return res.status(500).json({ ok: false, error: "No se pudo registrar el evento" });

    try {
      await processEvent(event);
      await supabase.from("taxi_stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), last_error: null }).eq("id", audit.id);
      return res.json({ ok: true });
    } catch (error: any) {
      await supabase.from("taxi_stripe_webhook_events").update({ status: "failed", last_error: String(error?.message || error).slice(0, 1000) }).eq("id", audit.id);
      return res.status(500).json({ ok: false, error: "Error procesando evento" });
    }
  });
}
