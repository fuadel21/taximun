import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import * as db from "./db";

// Helper to create role-based procedures
const passengerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "passenger") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

const driverProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "driver") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  // Auth procedures
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie("auth-token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
      });
      return { success: true };
    }),

    setRole: protectedProcedure
      .input(
        z.object({
          role: z.enum(["passenger", "driver", "admin"]),
          language: z.enum(["es", "ca", "en"]).optional(),
          phoneNumber: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.openId) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        try {
          await db.upsertUser({
            openId: ctx.user.openId,
            role: input.role,
            language: input.language || ctx.user.language || "es",
            phone: input.phoneNumber || ctx.user.phone || null,
          });
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Could not update user role",
          });
        }

        // Keep Supabase profile tables in sync for app data. These writes are
        // best-effort because the authenticated session source is the primary DB.
        if (input.role === "passenger") {
          await supabase
            .from("passengers")
            .upsert({ id: String(ctx.user.id) })
            .throwOnError();
        } else if (input.role === "driver") {
          await supabase
            .from("drivers")
            .upsert({ id: String(ctx.user.id), status: "offline" })
            .throwOnError();
        }

        return { success: true, role: input.role };
      }),

    setLanguage: protectedProcedure
      .input(z.enum(["es", "ca", "en"]))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.openId) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        await db.upsertUser({
          openId: ctx.user.openId,
          language: input,
        });

        return { success: true };
      }),
  }),

  // Passenger procedures
  passenger: router({
    getProfile: passengerProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("passengers")
        .select("*")
        .eq("id", ctx.user?.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

    createRide: passengerProcedure
      .input(
        z.object({
          pickupLat: z.number(),
          pickupLng: z.number(),
          dropoffLat: z.number(),
          dropoffLng: z.number(),
          estimatedFare: z.number(),
          estimatedDuration: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { data, error } = await supabase
          .from("rides")
          .insert({
            passenger_id: ctx.user?.id,
            pickup_lat: input.pickupLat,
            pickup_lng: input.pickupLng,
            dropoff_lat: input.dropoffLat,
            dropoff_lng: input.dropoffLng,
            estimated_fare: input.estimatedFare,
            estimated_duration: input.estimatedDuration,
            status: "pending",
          })
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Find nearest driver and assign
        const { data: drivers } = await supabase.rpc("find_nearest_drivers", {
          user_lat: input.pickupLat,
          user_lng: input.pickupLng,
          radius_km: 5,
        });

        if (drivers && drivers.length > 0) {
          const nearestDriver = drivers[0];
          await supabase
            .from("rides")
            .update({
              driver_id: nearestDriver.driver_id,
              status: "assigned",
              assigned_at: new Date().toISOString(),
            })
            .eq("id", data.id);
        }

        return data;
      }),

    getRideHistory: passengerProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          `
          *,
          driver:drivers(id, rating),
          taxi:taxis(license_plate, vehicle_model)
        `
        )
        .eq("passenger_id", ctx.user?.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),

    getCurrentRide: passengerProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          `
          *,
          driver:drivers(id, current_lat, current_lng, rating),
          taxi:taxis(license_plate, vehicle_model)
        `
        )
        .eq("passenger_id", ctx.user?.id)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || null;
    }),

    rateRide: passengerProcedure
      .input(
        z.object({
          rideId: z.string().uuid(),
          rating: z.number().min(1).max(5),
          comment: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Get ride to find driver
        const { data: ride } = await supabase
          .from("rides")
          .select("driver_id")
          .eq("id", input.rideId)
          .single();

        if (!ride?.driver_id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Create rating
        const { error } = await supabase.from("ratings").insert({
          ride_id: input.rideId,
          rater_id: ctx.user?.id,
          rated_id: ride.driver_id,
          rating: input.rating,
          comment: input.comment,
        });

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Update driver rating
        const { data: ratings } = await supabase
          .from("ratings")
          .select("rating")
          .eq("rated_id", ride.driver_id);

        if (ratings && ratings.length > 0) {
          const avgRating =
            ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
          await supabase
            .from("drivers")
            .update({ rating: avgRating })
            .eq("id", ride.driver_id);
        }

        return { success: true };
      }),
  }),

  // Driver procedures
  driver: router({
    getProfile: driverProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", ctx.user?.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

    updateLocation: driverProcedure
      .input(
        z.object({
          lat: z.number(),
          lng: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("drivers")
          .update({
            current_lat: input.lat,
            current_lng: input.lng,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ctx.user?.id);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return { success: true };
      }),

    setStatus: driverProcedure
      .input(z.object({ status: z.enum(["available", "busy", "offline"]) }))
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("drivers")
          .update({ status: input.status })
          .eq("id", ctx.user?.id);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return { success: true };
      }),

    getPendingRide: driverProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          `
          *,
          passenger:passengers(id, rating),
          taxi:taxis(license_plate, vehicle_model)
        `
        )
        .eq("driver_id", ctx.user?.id)
        .in("status", ["assigned", "in_progress"])
        .order("assigned_at", { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || null;
    }),

    acceptRide: driverProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("rides")
          .update({
            status: "in_progress",
            started_at: new Date().toISOString(),
          })
          .eq("id", input.rideId)
          .eq("driver_id", ctx.user?.id);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return { success: true };
      }),

    rejectRide: driverProcedure
      .input(z.object({ rideId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("rides")
          .update({ status: "pending", driver_id: null })
          .eq("id", input.rideId);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return { success: true };
      }),

    completeRide: driverProcedure
      .input(
        z.object({
          rideId: z.string().uuid(),
          actualFare: z.number(),
          actualDuration: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("rides")
          .update({
            status: "completed",
            actual_fare: input.actualFare,
            actual_duration: input.actualDuration,
            completed_at: new Date().toISOString(),
          })
          .eq("id", input.rideId);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // Update driver earnings
        const { data: driver } = await supabase
          .from("drivers")
          .select("total_earnings, total_rides")
          .eq("id", ctx.user?.id)
          .single();

        if (driver) {
          await supabase
            .from("drivers")
            .update({
              total_earnings: (driver.total_earnings || 0) + input.actualFare,
              total_rides: (driver.total_rides || 0) + 1,
            })
            .eq("id", ctx.user?.id);
        }

        return { success: true };
      }),

    getQueuePosition: driverProcedure.query(async ({ ctx }) => {
      const { data: driver } = await supabase
        .from("drivers")
        .select("current_zone_id")
        .eq("id", ctx.user?.id)
        .single();

      if (!driver?.current_zone_id) {
        return { position: null, totalInQueue: 0 };
      }

      const { data: queue } = await supabase
        .from("driver_queues")
        .select("position")
        .eq("driver_id", ctx.user?.id)
        .eq("zone_id", driver.current_zone_id)
        .single();

      const { count } = await supabase
        .from("driver_queues")
        .select("*", { count: "exact", head: true })
        .eq("zone_id", driver.current_zone_id);

      return {
        position: queue?.position || null,
        totalInQueue: count || 0,
      };
    }),

    getRideHistory: driverProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          `
          *,
          passenger:passengers(id, rating),
          taxi:taxis(license_plate, vehicle_model)
        `
        )
        .eq("driver_id", ctx.user?.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),
  }),

  // Admin procedures
  admin: router({
    getStats: adminProcedure.query(async ({ ctx }) => {
      const { count: activeRides } = await supabase
        .from("rides")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "assigned", "in_progress"]);

      const { count: activeDrivers } = await supabase
        .from("drivers")
        .select("*", { count: "exact", head: true })
        .eq("status", "available");

      const { data: completedRides } = await supabase
        .from("rides")
        .select("actual_fare")
        .eq("status", "completed");

      const totalEarnings =
        completedRides?.reduce((sum, ride) => sum + (ride.actual_fare || 0), 0) || 0;

      const { data: drivers } = await supabase
        .from("drivers")
        .select("rating");

      const avgRating =
        drivers && drivers.length > 0
          ? drivers.reduce((sum, d) => sum + (d.rating || 0), 0) / drivers.length
          : 0;

      return {
        activeRides: activeRides || 0,
        activeDrivers: activeDrivers || 0,
        totalEarnings,
        avgRating: Math.round(avgRating * 10) / 10,
      };
    }),

    getAllDrivers: adminProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("drivers")
        .select(
          `
          *,
          user:users(id, phone_number),
          taxi:taxis(license_plate, vehicle_model)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),

    getAllPassengers: adminProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("passengers")
        .select(
          `
          *,
          user:users(id, phone_number)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),

    getAllTaxis: adminProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("taxis")
        .select(
          `
          *,
          driver:drivers(id, status, rating)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),

    getRecentRides: adminProcedure.query(async ({ ctx }) => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          `
          *,
          passenger:passengers(id, rating),
          driver:drivers(id, rating),
          taxi:taxis(license_plate)
        `
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data || [];
    }),

    updateTaxiStatus: adminProcedure
      .input(
        z.object({
          taxiId: z.string().uuid(),
          status: z.enum(["available", "maintenance", "retired"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { error } = await supabase
          .from("taxis")
          .update({ status: input.status })
          .eq("id", input.taxiId);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return { success: true };
      }),
  }),

  // Public procedures
  public: router({
    getAvailableDrivers: publicProcedure
      .input(
        z.object({
          lat: z.number(),
          lng: z.number(),
          radius: z.number().default(5),
        })
      )
      .query(async ({ input }) => {
        const { data, error } = await supabase.rpc("find_nearest_drivers", {
          user_lat: input.lat,
          user_lng: input.lng,
          radius_km: input.radius,
        });

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return data || [];
      }),

    estimateFare: publicProcedure
      .input(
        z.object({
          pickupLat: z.number(),
          pickupLng: z.number(),
          dropoffLat: z.number(),
          dropoffLng: z.number(),
        })
      )
      .query(({ input }) => {
        // Simple fare calculation based on distance
        const R = 6371; // Earth's radius in km
        const dLat = ((input.dropoffLat - input.pickupLat) * Math.PI) / 180;
        const dLng = ((input.dropoffLng - input.pickupLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((input.pickupLat * Math.PI) / 180) *
            Math.cos((input.dropoffLat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        const baseFare = 2.5;
        const perKm = 1.5;
        const fare = baseFare + distance * perKm;
        const duration = Math.round(distance * 2); // Rough estimate: 2 min per km

        return {
          fare: Math.round(fare * 100) / 100,
          duration,
          distance: Math.round(distance * 100) / 100,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
