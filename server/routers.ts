import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDriverByUserId,
  getPassengerByUserId,
  updateDriverStatus,
  updateDriverLocation,
  getDriverQueue,
  addDriverToQueue,
  removeDriverFromQueue,
  getAvailableDriversNear,
  createRide,
  getRideById,
  updateRideStatus,
  getPassengerRides,
  getDriverRides,
  createRating,
  upsertUser,
} from "./db";

// Role-based procedure creators
const passengerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "passenger") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Passenger access only" });
  }
  return next({ ctx });
});

const driverProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "driver") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Driver access only" });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access only" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    setLanguage: protectedProcedure
      .input(z.enum(["es", "ca", "en"]))
      .mutation(async ({ ctx, input }) => {
        await upsertUser({
          openId: ctx.user.openId,
          language: input,
        });
        return { success: true };
      }),
  }),

  // Passenger procedures
  passenger: router({
    getProfile: passengerProcedure.query(async ({ ctx }) => {
      const passenger = await getPassengerByUserId(ctx.user.id);
      return passenger;
    }),

    getRideHistory: passengerProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        const rides = await getPassengerRides(ctx.user.id, input.limit);
        return rides;
      }),

    getCurrentRide: passengerProcedure.query(async ({ ctx }) => {
      const rides = await getPassengerRides(ctx.user.id, 1);
      const activeRide = rides.find((r) => r.status === "in_progress" || r.status === "accepted");
      return activeRide || null;
    }),

    rateRide: passengerProcedure
      .input(
        z.object({
          rideId: z.number(),
          score: z.number().min(1).max(5),
          comment: z.string().optional(),
          categories: z.record(z.string(), z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideById(input.rideId);
        if (!ride || ride.passengerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const rating = await createRating({
          rideId: input.rideId,
          ratedById: ctx.user.id,
          ratedUserId: ride.driverId!,
          score: input.score,
          comment: input.comment || null,
          categories: input.categories || null,
        });

        return rating;
      }),
  }),

  // Driver procedures
  driver: router({
    getProfile: driverProcedure.query(async ({ ctx }) => {
      const driver = await getDriverByUserId(ctx.user.id);
      return driver;
    }),

    updateStatus: driverProcedure
      .input(z.enum(["available", "busy", "offline"]))
      .mutation(async ({ ctx, input }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        await updateDriverStatus(driver.id, input);
        return { success: true };
      }),

    updateLocation: driverProcedure
      .input(
        z.object({
          latitude: z.number(),
          longitude: z.number(),
          zoneId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        await updateDriverLocation(driver.id, input.latitude, input.longitude, input.zoneId);
        return { success: true };
      }),

    getQueuePosition: driverProcedure
      .input(z.string())
      .query(async ({ ctx, input: zoneId }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        const queue = await getDriverQueue(zoneId);
        const position = queue.findIndex((q) => q.driverId === driver.id);

        return {
          position: position >= 0 ? position + 1 : null,
          totalInQueue: queue.length,
        };
      }),

    joinQueue: driverProcedure
      .input(z.string())
      .mutation(async ({ ctx, input: zoneId }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        await addDriverToQueue(driver.id, zoneId);
        return { success: true };
      }),

    leaveQueue: driverProcedure
      .input(z.string())
      .mutation(async ({ ctx, input: zoneId }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        await removeDriverFromQueue(driver.id, zoneId);
        return { success: true };
      }),

    getRideHistory: driverProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        const rides = await getDriverRides(driver.id, input.limit);
        return rides;
      }),

    acceptRide: driverProcedure
      .input(z.number())
      .mutation(async ({ ctx, input: rideId }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        const ride = await getRideById(rideId);
        if (!ride || ride.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }

        await updateRideStatus(rideId, "accepted");
        return { success: true };
      }),

    rejectRide: driverProcedure
      .input(z.number())
      .mutation(async ({ ctx, input: rideId }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        const ride = await getRideById(rideId);
        if (!ride || ride.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }

        await updateRideStatus(rideId, "cancelled");
        return { success: true };
      }),

    ratePassenger: driverProcedure
      .input(
        z.object({
          rideId: z.number(),
          score: z.number().min(1).max(5),
          comment: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const driver = await getDriverByUserId(ctx.user.id);
        if (!driver) throw new TRPCError({ code: "NOT_FOUND" });

        const ride = await getRideById(input.rideId);
        if (!ride || ride.driverId !== driver.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const rating = await createRating({
          rideId: input.rideId,
          ratedById: ctx.user.id,
          ratedUserId: ride.passengerId,
          score: input.score,
          comment: input.comment || null,
          categories: null,
        });

        return rating;
      }),
  }),

  // Admin procedures
  admin: router({
    getStatistics: adminProcedure.query(async () => {
      // TODO: Implement statistics query
      return {
        totalRides: 0,
        totalUsers: 0,
        totalRevenue: 0,
        activeDrivers: 0,
      };
    }),

    getUsers: adminProcedure
      .input(
        z.object({
          role: z.enum(["passenger", "driver", "admin"]).optional(),
          limit: z.number().default(20),
        })
      )
      .query(async ({ input }) => {
        // TODO: Implement users query
        return [];
      }),

    getActiveTaxis: adminProcedure.query(async () => {
      const drivers = await getAvailableDriversNear(41.3851, 2.1734, 50);
      return drivers;
    }),
  }),

  // Public rides procedures (for booking)
  rides: router({
    findNearbyDrivers: publicProcedure
      .input(
        z.object({
          latitude: z.number(),
          longitude: z.number(),
          radiusKm: z.number().default(5),
        })
      )
      .query(async ({ input }) => {
        const drivers = await getAvailableDriversNear(input.latitude, input.longitude, input.radiusKm);
        return drivers;
      }),

    createRideRequest: passengerProcedure
      .input(
        z.object({
          pickupLatitude: z.number(),
          pickupLongitude: z.number(),
          pickupAddress: z.string(),
          dropoffLatitude: z.number(),
          dropoffLongitude: z.number(),
          dropoffAddress: z.string(),
          estimatedFare: z.number().optional(),
          estimatedDuration: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const ride = await createRide({
          passengerId: ctx.user.id,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          pickupAddress: input.pickupAddress,
          dropoffLatitude: input.dropoffLatitude,
          dropoffLongitude: input.dropoffLongitude,
          dropoffAddress: input.dropoffAddress,
          estimatedFare: input.estimatedFare,
          estimatedDuration: input.estimatedDuration,
          status: "pending",
        });

        return ride;
      }),

    getRideDetails: protectedProcedure
      .input(z.number())
      .query(async ({ input: rideId }) => {
        const ride = await getRideById(rideId);
        return ride;
      }),
  }),
});

export type AppRouter = typeof appRouter;
