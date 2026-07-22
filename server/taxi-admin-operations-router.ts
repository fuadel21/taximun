import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";
import { TRPCError } from "@trpc/server";

function fail(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiAdminOperationsRouter = router({
  snapshot: adminProcedure.query(async () => {
    const freshSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const [driversResult, ridesResult, safetyResult, offersResult] = await Promise.all([
      supabase
        .from("driver_live_status")
        .select("driver_id,driver_name,taxi_code,plate,status,current_lat,current_lng,updated_at")
        .order("updated_at", { ascending: false })
        .limit(300),
      supabase
        .from("taxi_rides")
        .select("id,passenger_id,driver_id,status,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,estimated_fare,requested_at,created_at")
        .in("status", ["pending", "assigned", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("taxi_safety_reports")
        .select("id,ride_id,category,priority,status,title,lat,lng,created_at")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("taxi_ride_offers")
        .select("id,ride_id,driver_id,status,offered_at,expires_at")
        .eq("status", "pending")
        .order("offered_at", { ascending: false })
        .limit(150),
    ]);

    fail(driversResult.error);
    fail(ridesResult.error);
    fail(safetyResult.error);
    fail(offersResult.error);

    const drivers = driversResult.data ?? [];
    const rides = ridesResult.data ?? [];
    const safety = safetyResult.data ?? [];
    const offers = offersResult.data ?? [];
    const freshDrivers = drivers.filter((driver) => driver.updated_at && driver.updated_at >= freshSince);

    return {
      generatedAt: new Date().toISOString(),
      drivers,
      rides,
      safety,
      offers,
      summary: {
        driversOnline: freshDrivers.length,
        driversAvailable: freshDrivers.filter((driver) => driver.status === "available").length,
        driversBusy: freshDrivers.filter((driver) => driver.status !== "available").length,
        pendingRides: rides.filter((ride) => ride.status === "pending").length,
        activeRides: rides.filter((ride) => ride.status === "assigned" || ride.status === "in_progress").length,
        criticalAlerts: safety.filter((report) => report.priority === "critical" || report.category === "sos").length,
        pendingOffers: offers.length,
      },
    };
  }),
});
