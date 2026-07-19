import { supabase } from "./supabase-client";

type DispatchCycleOptions = {
  maxDrivers?: number;
  staleAfterSeconds?: number;
};

type DispatchAttempt = {
  driverId: string;
  offered: boolean;
  rideId: string | null;
  error: string | null;
};

/**
 * Runs dispatch from the backend so matching no longer depends on a driver
 * keeping the app open. Existing Supabase RPCs remain the source of truth for
 * eligibility, locking and duplicate-offer protection.
 */
export async function runServerDispatchCycle(options: DispatchCycleOptions = {}) {
  const startedAt = Date.now();
  const maxDrivers = Math.min(Math.max(options.maxDrivers ?? 20, 1), 100);
  const staleAfterSeconds = Math.min(Math.max(options.staleAfterSeconds ?? 120, 30), 900);

  const { data: reconciliation, error: reconciliationError } = await supabase.rpc(
    "taximun_reconcile_dispatch_state",
  );

  if (reconciliationError) {
    return {
      ok: false,
      reason: "reconciliation_failed",
      error: reconciliationError.message,
      reconciliation: null,
      scannedDrivers: 0,
      offersCreated: 0,
      attempts: [] as DispatchAttempt[],
      latencyMs: Date.now() - startedAt,
    };
  }

  const freshSince = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
  const { data: drivers, error: driversError } = await supabase
    .from("driver_live_status")
    .select("driver_id,status,updated_at")
    .eq("status", "available")
    .gte("updated_at", freshSince)
    .order("updated_at", { ascending: false })
    .limit(maxDrivers);

  if (driversError) {
    return {
      ok: false,
      reason: "drivers_query_failed",
      error: driversError.message,
      reconciliation,
      scannedDrivers: 0,
      offersCreated: 0,
      attempts: [] as DispatchAttempt[],
      latencyMs: Date.now() - startedAt,
    };
  }

  const attempts: DispatchAttempt[] = [];

  for (const driver of drivers ?? []) {
    const driverId = String(driver.driver_id || "");
    if (!driverId) continue;

    const { data: canOperate, error: eligibilityError } = await supabase.rpc(
      "taximun_driver_can_operate",
      { p_driver_id: driverId },
    );

    if (eligibilityError || canOperate !== true) {
      attempts.push({
        driverId,
        offered: false,
        rideId: null,
        error: eligibilityError?.message ?? "driver_not_eligible",
      });
      continue;
    }

    const { data: offer, error: offerError } = await supabase.rpc(
      "taximun_claim_smart_offer",
      { p_driver_id: driverId },
    );

    const rideId = offer && typeof offer === "object"
      ? String((offer as Record<string, unknown>).ride_id ?? (offer as Record<string, unknown>).id ?? "") || null
      : null;

    attempts.push({
      driverId,
      offered: Boolean(offer) && !offerError,
      rideId,
      error: offerError?.message ?? null,
    });
  }

  const offersCreated = attempts.filter((attempt) => attempt.offered).length;

  return {
    ok: true,
    reason: offersCreated > 0 ? "offers_created" : "no_matching_rides",
    error: null,
    reconciliation,
    scannedDrivers: attempts.length,
    offersCreated,
    attempts,
    latencyMs: Date.now() - startedAt,
  };
}
