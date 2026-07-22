import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";
import { TRPCError } from "@trpc/server";

function fail(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiAdminOperationsRouter = router({
  snapshot: adminProcedure.query(async () => {
    const freshSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [driversResult, ridesResult, safetyResult, offersResult] = await Promise.all([
      supabase
        .from("driver_live_status")
        .select("driver_id,driver_name,taxi_code,plate,status,current_lat,current_lng,updated_at,last_offer_at,offers_received")
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("taxi_rides")
        .select("id,passenger_id,driver_id,status,pickup_address,dropoff_address,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,estimated_fare,final_fare,requested_at,driver_arrived_at,started_at,completed_at")
        .in("status", ["pending", "assigned", "in_progress"])
        .order("requested_at", { ascending: true })
        .limit(300),
      supabase
        .from("taxi_safety_reports")
        .select("id,ride_id,reporter_id,reporter_role,category,priority,status,title,description,lat,lng,created_at,assigned_admin_id")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("taxi_ride_offers")
        .select("id,ride_id,driver_id,status,offered_at,expires_at")
        .eq("status", "pending")
        .order("offered_at", { ascending: false })
        .limit(300),
    ]);

    fail(driversResult.error);
    fail(ridesResult.error);
    fail(safetyResult.error);
    fail(offersResult.error);

    const drivers = driversResult.data ?? [];
    const rides = ridesResult.data ?? [];
    const safety = safetyResult.data ?? [];
    const offers = offersResult.data ?? [];

    return {
      generatedAt: new Date().toISOString(),
      drivers,
      rides,
      safety,
      offers,
      summary: {
        totalDrivers: drivers.length,
        freshDrivers: drivers.filter((driver) => String(driver.updated_at || "") >= freshSince).length,
        availableDrivers: drivers.filter((driver) => driver.status === "available").length,
        busyDrivers: drivers.filter((driver) => driver.status === "busy").length,
        pendingRides: rides.filter((ride) => ride.status === "pending").length,
        assignedRides: rides.filter((ride) => ride.status === "assigned").length,
        inProgressRides: rides.filter((ride) => ride.status === "in_progress").length,
        activeAlerts: safety.length,
        criticalAlerts: safety.filter((report) => report.priority === "critical" || report.category === "sos").length,
        activeOffers: offers.length,
      },
    };
  }),
});
