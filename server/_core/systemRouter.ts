import { z } from "zod";
import { adminControlRouter } from "../admin-control-router";
import { taxiNotificationsRouter } from "../taxi-notifications-router";
import { taxiOpsRouter } from "../taxi-ops-router";
import { taxiPassengerTrackingRouter } from "../taxi-passenger-tracking-router";
import { taxiProfilesRouter } from "../taxi-profiles-router";
import { taxiRatingsRouter } from "../taxi-ratings-router";
import { taxiSafetyRouter } from "../taxi-safety-router";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  adminControl: adminControlRouter,
  taxiNotifications: taxiNotificationsRouter,
  taxiOps: taxiOpsRouter,
  taxiPassengerTracking: taxiPassengerTrackingRouter,
  taxiProfiles: taxiProfilesRouter,
  taxiRatings: taxiRatingsRouter,
  taxiSafety: taxiSafetyRouter,

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
