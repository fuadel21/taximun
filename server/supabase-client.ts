import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

// Create Supabase client for server-side operations
export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper function to get user session from JWT token
export async function getUserFromToken(token: string) {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error getting user from token:", error);
    return null;
  }
}

// Helper function to create a ride
export async function createRide(
  passengerId: string,
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  estimatedFare: number,
  estimatedDuration: number
) {
  const { data, error } = await supabase.from("rides").insert([
    {
      passenger_id: passengerId,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      estimated_fare: estimatedFare,
      estimated_duration: estimatedDuration,
      status: "pending",
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("Error creating ride:", error);
    return null;
  }

  return data;
}

// Helper function to find nearest available drivers
export async function findNearestDrivers(
  lat: number,
  lng: number,
  radius: number = 5 // km
) {
  // Using Supabase PostGIS extension for geographic queries
  const { data, error } = await supabase.rpc("find_nearest_drivers", {
    user_lat: lat,
    user_lng: lng,
    radius_km: radius,
  });

  if (error) {
    console.error("Error finding nearest drivers:", error);
    return [];
  }

  return data || [];
}

// Helper function to update driver location
export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number
) {
  const { data, error } = await supabase
    .from("drivers")
    .update({
      current_lat: lat,
      current_lng: lng,
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverId);

  if (error) {
    console.error("Error updating driver location:", error);
    return null;
  }

  return data;
}

// Helper function to get driver queue position
export async function getDriverQueuePosition(driverId: string, zoneId: string) {
  const { data, error } = await supabase
    .from("driver_queues")
    .select("position")
    .eq("driver_id", driverId)
    .eq("zone_id", zoneId)
    .single();

  if (error) {
    console.error("Error getting queue position:", error);
    return null;
  }

  return data?.position || null;
}

// Helper function to assign ride to driver
export async function assignRideToDriver(rideId: string, driverId: string) {
  const { data, error } = await supabase
    .from("rides")
    .update({
      driver_id: driverId,
      status: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .eq("id", rideId);

  if (error) {
    console.error("Error assigning ride:", error);
    return null;
  }

  return data;
}

// Helper function to get active rides
export async function getActiveRides() {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .in("status", ["pending", "assigned", "in_progress"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting active rides:", error);
    return [];
  }

  return data || [];
}

// Helper function to get driver statistics
export async function getDriverStats(driverId: string) {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "completed");

  if (error) {
    console.error("Error getting driver stats:", error);
    return { totalRides: 0, totalEarnings: 0 };
  }

  const rides = data || [];
  const totalEarnings = rides.reduce((sum, ride) => sum + (ride.fare || 0), 0);

  return {
    totalRides: rides.length,
    totalEarnings,
  };
}
