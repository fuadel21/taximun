import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const WEBHOOK_PATH = "/api/webhooks/stripe";
const TOLERANCE_SECONDS = 300;
const STRIPE_API = "https://api.stripe.com/v1";

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

async function fetchCurrentPaymentIntent(intentId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada para conciliar PaymentIntent");
  const response = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(intentId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(json?.error?.message || "No se pudo consultar el estado actual del PaymentIntent");
  }
  return json;
}

function connectStatusForAccount(account: any) {
  const currentlyDue = account?.requirements?.currently_due || [];
  const disabledReason = account?.requirements?.disabled_reason || null;
  if (account?.charges_enabled && account?.payouts_enabled && currentlyDue.length === 0) return "enabled";
  if (disabledReason) return "disabled";
  if (account?.details_submitted || currentlyDue.length > 0) return "restricted";
  return "onboarding";
}

async function syncPaymentIntent(intent: any, eventType?: string) {
  if (intent?.metadata?.kind === "ride_tip") return;
  if (!intent?.id) return;

  // A payment_failed event may arrive after the same PaymentIntent was retried
  // successfully. Reconcile Stripe's current state before allowing an old
  // failure snapshot to downgrade an authorized/captured/cancelled payment.
  const authoritativeIntent = eventType === "payment_intent.payment_failed"
    ? await fetchCurrentPaymentIntent(intent.id)
    : intent;

  if (authoritativeIntent?.metadata?.kind === "ride_tip") return;
  const rideId = authoritativeIntent?.metadata?.ride_id;
  if (!rideId || authoritativeIntent?.id !== intent.id) return;

  const amountCaptured = Number(authoritativeIntent.amount_received || 0);
  const commissionBps = Number(process.env.TAXIMUN_COMMISSION_BPS || 1500);
  const platformFee = Math.round(amountCaptured * commissionBps / 10000);
  const { error } = await supabase.from("taxi_payments").update({
    status: paymentStatusForIntent(authoritativeIntent.status),
    amount_authorized: Number(authoritativeIntent.amount || 0),
    amount_captured: amountCaptured,
    platform_fee: platformFee,
    driver_net: Math.max(0, amountCaptured - platformFee),
    provider_charge_id: typeof authoritativeIntent.latest_charge === "string" ? authoritativeIntent.latest_charge : null,
    captured_at: authoritativeIntent.status === "succeeded" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("provider_payment_intent_id", authoritativeIntent.id);
  if (error) throw error;
}

async function syncCheckoutTip(session: any, eventType: string, eventId: string) {
  if (session?.metadata?.kind !== "ride_tip") return;
  const tipId = session?.metadata?.tip_id;
  const rideId = session?.metadata?.ride_id;
  const sessionId = session?.id;
  if (!tipId || !rideId || !sessionId) return;

  const { data: current, error: currentError } = await supabase
    .from("taxi_ride_tips")
    .select("id,status,method,amount_cents,driver_id,passenger_id,ride_id,stripe_checkout_session_id")
    .eq("id", tipId)
    .eq("ride_id", rideId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || current.method !== "card" || current.stripe_checkout_session_id !== sessionId) return;

  const paid = session.payment_status === "paid" || eventType === "checkout.session.async_payment_succeeded";
  const failed = eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed";
  const status = paid ? "paid" : failed ? "failed" : "checkout_pending";
  const payoutStatus = paid ? "paid" : failed ? "failed" : "destination_configured";
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const destination = session?.payment_intent?.transfer_data?.destination || null;
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase.from("taxi_ride_tips").update({
    status,
    payout_status: payoutStatus,
    stripe_payment_intent_id: paymentIntentId,
    stripe_destination_account_id: destination || undefined,
    confirmed_at: paid ? now : null,
    confirmed_by: paid ? "stripe_webhook" : null,
    last_stripe_event_id: eventId,
    last_stripe_event_at: now,
  }).eq("id", current.id).eq("method", "card").eq("stripe_checkout_session_id", sessionId).select("id").maybeSingle();
  if (error) throw error;
  if (!updated) return;

  if (paid && current.status !== "paid") {
    await createTaxiNotification({
      recipientId: current.driver_id,
      recipientRole: "driver",
      actorId: current.passenger_id,
      actorRole: "passenger",
      type: "success",
      title: "Propina pagada",
      body: `${(Number(current.amount_cents || 0) / 100).toFixed(2)} € enviados a tu saldo Stripe Connect por el viaje ${String(current.ride_id).slice(0, 8).toUpperCase()}.`,
      actionUrl: "/driver/earnings",
      metadata: { rideId: current.ride_id, tipId: current.id, amountCents: current.amount_cents },
    });
  }
}

async function syncRefund(refund: any) {
  if (!refund?.id || !refund?.payment_intent) return;
  const { data: payment, error: paymentError } = await supabase.from("taxi_payments").select("id,amount_captured,amount_refunded").eq("provider_payment_intent_id", refund.payment_intent).maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return;
  const { error: refundError } = await supabase.from("taxi_payment_refunds").upsert({
    payment_id: payment.id,
    provider_refund_id: refund.id,
    amount: Number(refund.amount || 0),
    reason: refund.reason || "requested_by_customer",
    status: refund.status || "pending",
    requested_by: "stripe_webhook",
  }, { onConflict: "provider_refund_id" });
  if (refundError) throw refundError;
  const { data: refunds, error: refundsError } = await supabase.from("taxi_payment_refunds").select("amount,status").eq("payment_id", payment.id).eq("status", "succeeded");
  if (refundsError) throw refundsError;
  const totalRefunded = (refunds || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const { error: updateError } = await supabase.from("taxi_payments").update({
    amount_refunded: totalRefunded,
    status: totalRefunded >= Number(payment.amount_captured || 0) ? "refunded" : "partially_refunded",
    updated_at: new Date().toISOString(),
  }).eq("id", payment.id);
  if (updateError) throw updateError;
}

async function syncConnectAccount(account: any, eventId: string) {
  if (!account?.id) return;
  const requirementsDue = [
    ...(account?.requirements?.currently_due || []),
    ...(account?.requirements?.past_due || []),
    ...(account?.requirements?.eventually_due || []),
  ];
  const { error } = await supabase.from("taxi_driver_connect_accounts").update({
    country: String(account.country || "ES").toUpperCase(),
    status: connectStatusForAccount(account),
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    requirements_due: Array.from(new Set(requirementsDue)),
    disabled_reason: account?.requirements?.disabled_reason || null,
    last_stripe_event_id: eventId,
    last_synced_at: new Date().toISOString(),
  }).eq("stripe_account_id", account.id);
  if (error) throw error;
}

async function syncTransfer(transfer: any, eventType: string, eventId: string) {
  if (!transfer?.id) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
    last_stripe_event_id: eventId,
    last_synced_at: now,
    failure_code: transfer?.failure_code || null,
    failure_message: transfer?.failure_message || null,
  };
  if (eventType === "transfer.reversed" || Number(transfer.amount_reversed || 0) > 0 || transfer.reversed === true) {
    patch.status = "reversed";
    patch.reversed_at = now;
    patch.reversal_id = typeof transfer.reversals?.data?.[0]?.id === "string" ? transfer.reversals.data[0].id : null;
  } else if (eventType === "transfer.failed") {
    patch.status = "failed";
  } else {
    patch.status = "paid";
    patch.paid_at = now;
  }
  const { error } = await supabase.from("taxi_driver_transfers").update(patch).eq("stripe_transfer_id", transfer.id);
  if (error) throw error;
}

function disputePayoutAction(status: string, eventType: string) {
  if (eventType === "charge.dispute.closed" && status === "won") return "released";
  if (eventType === "charge.dispute.closed" && status === "lost") return "reverse";
  return "hold";
}

async function syncDispute(dispute: any, eventType: string, eventId: string) {
  if (!dispute?.id || !dispute?.charge) return;
  const { data: payment, error: paymentError } = await supabase
    .from("taxi_payments")
    .select("id,ride_id,driver_id")
    .eq("provider_charge_id", dispute.charge)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return;

  const action = disputePayoutAction(String(dispute.status || "warning_needs_response"), eventType);
  const now = new Date().toISOString();
  const { data: saved, error: disputeError } = await supabase
    .from("taxi_payment_disputes")
    .upsert({
      payment_id: payment.id,
      ride_id: payment.ride_id,
      driver_id: payment.driver_id,
      stripe_dispute_id: dispute.id,
      stripe_charge_id: dispute.charge,
      amount: Number(dispute.amount || 0),
      currency: String(dispute.currency || "eur").toLowerCase(),
      reason: dispute.reason || null,
      status: dispute.status || "warning_needs_response",
      evidence_due_at: dispute?.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
      is_charge_refundable: typeof dispute.is_charge_refundable === "boolean" ? dispute.is_charge_refundable : null,
      balance_transaction_id: typeof dispute.balance_transactions?.[0] === "string" ? dispute.balance_transactions[0] : dispute.balance_transactions?.[0]?.id || null,
      payout_action: action,
      last_stripe_event_id: eventId,
      payload: dispute,
      closed_at: eventType === "charge.dispute.closed" ? now : null,
    }, { onConflict: "stripe_dispute_id" })
    .select("id")
    .single();
  if (disputeError) throw disputeError;

  const transferPatch: Record<string, unknown> = {
    dispute_id: saved.id,
    dispute_hold: action !== "released",
    payout_blocked_reason: action === "released" ? null : `stripe_dispute:${dispute.id}:${dispute.status || "open"}`,
  };
  if (action === "reverse") {
    transferPatch.status = "reversed";
    transferPatch.reversed_at = now;
  }
  const { error: transferError } = await supabase
    .from("taxi_driver_transfers")
    .update(transferPatch)
    .eq("payment_id", payment.id);
  if (transferError) throw transferError;
}

async function processEvent(event: any) {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled":
      await syncPaymentIntent(event.data.object, event.type);
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      await syncCheckoutTip(event.data.object, event.type, event.id);
      break;
    case "refund.created":
    case "refund.updated":
      await syncRefund(event.data.object);
      break;
    case "account.updated":
      await syncConnectAccount(event.data.object, event.id);
      break;
    case "transfer.created":
    case "transfer.updated":
    case "transfer.failed":
    case "transfer.reversed":
      await syncTransfer(event.data.object, event.type, event.id);
      break;
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
      await syncDispute(event.data.object, event.type, event.id);
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
    if (!event?.id || !event?.type) return res.status(400).json({ ok: false, error: "Evento Stripe incompleto" });

    const { data: existing, error: existingError } = await supabase.from("taxi_stripe_webhook_events").select("id,status,attempts").eq("stripe_event_id", event.id).maybeSingle();
    if (existingError) return res.status(500).json({ ok: false, error: "No se pudo consultar la auditoría" });
    if (existing?.status === "processed") return res.json({ ok: true, duplicate: true });

    const auditPayload: Record<string, unknown> = {
      stripe_event_id: event.id,
      event_type: event.type,
      api_version: event.api_version || null,
      livemode: Boolean(event.livemode),
      payload: event,
      status: "processing",
      attempts: Number(existing?.attempts || 0) + 1,
      last_error: null,
    };
    if (!existing) auditPayload.received_at = new Date().toISOString();

    const { data: audit, error: auditError } = await supabase.from("taxi_stripe_webhook_events").upsert(auditPayload, { onConflict: "stripe_event_id" }).select("id").single();
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
