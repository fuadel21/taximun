import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function assertDriver(ctx: any) {
  if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  const result = startOfDay(date);
  result.setDate(result.getDate() - day + 1);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export const taxiDriverAnalyticsRouter = router({
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    assertDriver(ctx);

    const { data: rides, error } = await supabase
      .from("taxi_rides")
      .select("id,pickup_address,dropoff_address,estimated_fare,final_fare,payment_status,settled_at,estimated_duration,distance_km,payment_method,service_type,status,requested_at,completed_at")
      .eq("driver_id", ctx.user.openId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(500);

    throwIfSupabaseError(error);

    const { data: profile, error: profileError } = await supabase
      .from("taxi_user_profiles")
      .select("rating,rating_count,completed_rides")
      .eq("user_id", ctx.user.openId)
      .eq("role", "driver")
      .maybeSingle();

    throwIfSupabaseError(profileError);

    const now = new Date();
    const dayStart = startOfDay(now).getTime();
    const weekStart = startOfWeek(now).getTime();
    const monthStart = startOfMonth(now).getTime();

    const normalized = (rides ?? []).map((ride) => {
      const completedAt = ride.settled_at || ride.completed_at || ride.requested_at;
      const hasFinalFare = ride.final_fare !== null && ride.final_fare !== undefined;
      return {
        ...ride,
        fare: Number(hasFinalFare ? ride.final_fare : ride.estimated_fare ?? 0),
        fareSource: hasFinalFare ? "final" : "estimated",
        completedTimestamp: completedAt ? new Date(completedAt).getTime() : 0,
      };
    });

    const sumSince = (timestamp: number) => normalized
      .filter((ride) => ride.completedTimestamp >= timestamp)
      .reduce((sum, ride) => sum + ride.fare, 0);

    const ridesSince = (timestamp: number) => normalized.filter((ride) => ride.completedTimestamp >= timestamp).length;
    const totalRevenue = normalized.reduce((sum, ride) => sum + ride.fare, 0);
    const paymentBreakdown = normalized.reduce<Record<string, { rides: number; revenue: number }>>((acc, ride) => {
      const key = String(ride.payment_method || "cash");
      acc[key] = acc[key] || { rides: 0, revenue: 0 };
      acc[key].rides += 1;
      acc[key].revenue += ride.fare;
      return acc;
    }, {});

    return {
      summary: {
        todayRevenue: Number(sumSince(dayStart).toFixed(2)),
        weekRevenue: Number(sumSince(weekStart).toFixed(2)),
        monthRevenue: Number(sumSince(monthStart).toFixed(2)),
        todayRides: ridesSince(dayStart),
        weekRides: ridesSince(weekStart),
        monthRides: ridesSince(monthStart),
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalRides: normalized.length,
        averageTicket: normalized.length ? Number((totalRevenue / normalized.length).toFixed(2)) : 0,
        rating: Number(profile?.rating ?? 5),
        ratingCount: Number(profile?.rating_count ?? 0),
        completedRides: Number(profile?.completed_rides ?? normalized.length),
      },
      paymentBreakdown,
      rides: normalized,
    };
  }),
});