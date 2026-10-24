import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const taxiPassengerTrackingRouter = router({
  getAssignedDriverLiveStatus: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx);

    const { data: ride, error: rideError } = await supabase
      .from("taxi_rides")
      .select("id,driver_id,pickup_lat,pickup_lng,status,assigned_at,started_at")
      .eq("passenger_id", ctx.user.openId)
      .in("status", ["assigned", "in_progress"])
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    throwIfSupabaseError(rideError);

    if (!ride?.driver_id) {
      return null;
    }

    const { data: liveStatus, error: liveError } = await supabase
      .from("driver_live_status")
      .select("driver_id,driver_name,taxi_code,plate,status,current_lat,current_lng,current_zone,updated_at")
      .eq("driver_id", ride.driver_id)
      .maybeSingle();

    throwIfSupabaseError(liveError);

    if (!liveStatus) {
      return {
        rideId: ride.id,
        driverId: ride.driver_id,
        available: false,
        status: "unknown",
        message: "Esperando ubicación del conductor.",
      };
    }

    const driverLat = Number(liveStatus.current_lat);
    const driverLng = Number(liveStatus.current_lng);
    const pickupLat = Number(ride.pickup_lat);
    const pickupLng = Number(ride.pickup_lng);
    const hasDriverLocation = Number.isFinite(driverLat) && Number.isFinite(driverLng);
    const hasPickupLocation = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);

    let distanceToPickupKm: number | null = null;
    let etaMinutes: number | null = null;

    if (hasDriverLocation && hasPickupLocation && ride.status === "assigned") {
      distanceToPickupKm = Number(haversineKm({ lat: driverLat, lng: driverLng }, { lat: pickupLat, lng: pickupLng }).toFixed(1));
      etaMinutes = Math.max(2, Math.round((distanceToPickupKm / 22) * 60 + 2));
    }

    return {
      rideId: ride.id,
      driverId: ride.driver_id,
      available: true,
      status: liveStatus.status,
      driverName: liveStatus.driver_name,
      taxiCode: liveStatus.taxi_code,
      plate: liveStatus.plate,
      currentZone: liveStatus.current_zone,
      currentLat: hasDriverLocation ? driverLat : null,
      currentLng: hasDriverLocation ? driverLng : null,
      updatedAt: liveStatus.updated_at,
      distanceToPickupKm,
      etaMinutes,
      message: hasDriverLocation ? "Ubicación del conductor actualizada." : "Conductor asignado, esperando ubicación GPS.",
    };
  }),

  /** Recibo conforme del servicio (regla 22 T3): datos, desglose y licencia. */
  getRideReceipt: protectedProcedure
    .input(z.object({ rideId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      assertPassenger(ctx);
      const { data: ride, error } = await supabase
        .from("taxi_rides")
        .select("*")
        .eq("id", input.rideId)
        .maybeSingle();
      throwIfSupabaseError(error);
      if (!ride || (ride.passenger_id !== ctx.user.openId && ctx.user.role !== "admin")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
      }
      if (!["completed", "in_progress"].includes(String(ride.status))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El recibo está disponible al completar el servicio." });
      }
      let driverProfile: Record<string, unknown> | null = null;
      if (ride.driver_id) {
        const { data: profile } = await supabase
          .from("taxi_user_profiles")
          .select("full_name, driver_license_number, taxi_code, plate, vehicle_model")
          .eq("user_id", ride.driver_id)
          .maybeSingle();
        driverProfile = profile ?? null;
      }
      return { ride, driverProfile };
    }),
});
