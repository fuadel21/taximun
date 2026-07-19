import { z } from "zod";
import { adminControlRouter } from "../admin-control-router";
import { taxiDriverAnalyticsRouter } from "../taxi-driver-analytics-router";
import { taxiJourneyValidationRouter } from "../taxi-journey-validation-router";
import { taxiLiveTripRouter } from "../taxi-live-trip-router";
import { taxiNotificationsRouter } from "../taxi-notifications-router";
import { taxiOpsRouter } from "../taxi-ops-router";
import { taxiPassengerTrackingRouter } from "../taxi-passenger-tracking-router";
import { taxiProfilesRouter } from "../taxi-profiles-router";
import { taxiRatingsRouter } from "../taxi-ratings-router";
import { taxiRideOffersRouter } from "../taxi-ride-offers-router";
import { taxiSafetyAuditRouter } from "../taxi-safety-audit-router";
import { taxiSafetyRouter } from "../taxi-safety-router";
import { taxiServerDispatchRouter } from "../taxi-server-dispatch-router";
import { taxiSystemHealthRouter } from "../taxi-system-health-router";
import { taxiTripAudioRouter } from "../taxi-trip-audio-router";
import { taxiTripCallRouter } from "../taxi-trip-call-router";
import { taxiTripChatRouter } from "../taxi-trip-chat-router";
import { taxiTripSettlementRouter } from "../taxi-trip-settlement-router";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  adminControl: adminControlRouter,
  taxiDriverAnalytics: taxiDriverAnalyticsRouter,
  taxiJourneyValidation: taxiJourneyValidationRouter,
  taxiLiveTrip: taxiLiveTripRouter,
  taxiNotifications: taxiNotificationsRouter,
  taxiOps: taxiOpsRouter,
  taxiPassengerTracking: taxiPassengerTrackingRouter,
  taxiProfiles: taxiProfilesRouter,
  taxiRatings: taxiRatingsRouter,
  taxiRideOffers: taxiRideOffersRouter,
  taxiSafety: taxiSafetyRouter,
  taxiSafetyAudit: taxiSafetyAuditRouter,
  taxiServerDispatch: taxiServerDispatchRouter,
  taxiSystemHealth: taxiSystemHealthRouter,
  taxiTripAudio: taxiTripAudioRouter,
  taxiTripCall: taxiTripCallRouter,
  taxiTripChat: taxiTripChatRouter,
  taxiTripSettlement: taxiTripSettlementRouter,

  health: publicProcedure.input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") })).query(() => ({ ok: true })),

  notifyOwner: adminProcedure.input(z.object({ title: z.string().min(1, "title is required"), content: z.string().min(1, "content is required") })).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return { success: delivered } as const;
  }),
});
