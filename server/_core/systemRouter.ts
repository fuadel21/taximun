import { z } from "zod";
import { adminControlRouter } from "../admin-control-router";
import { taxiAdminCancellationRouter } from "../taxi-admin-cancellation-router";
import { taxiAdminOperationsRouter } from "../taxi-admin-operations-router";
import { taxiCardPaymentsRouter } from "../taxi-card-payments-router";
import { taxiDriverAnalyticsRouter } from "../taxi-driver-analytics-router";
import { taxiFinanceAdminRouter } from "../taxi-finance-admin-router";
import { taxiJourneyValidationRouter } from "../taxi-journey-validation-router";
import { taxiLiveTripRouter } from "../taxi-live-trip-router";
import { taxiNotificationsRouter } from "../taxi-notifications-router";
import { taxiOpsRouter } from "../taxi-ops-router";
import { taxiPassengerBookingRouter } from "../taxi-passenger-booking-router";
import { taxiPassengerCancellationRouter } from "../taxi-passenger-cancellation-router";
import { taxiPassengerTrackingRouter } from "../taxi-passenger-tracking-router";
import { taxiPaymentsRouter } from "../taxi-payments-router";
import { taxiProfilesRouter } from "../taxi-profiles-router";
import { taxiPromotionsRouter } from "../taxi-promotions-router";
import { taxiRatingsRouter } from "../taxi-ratings-router";
import { taxiRideAftercareRouter } from "../taxi-ride-aftercare-router";
import { taxiRideOffersRouter } from "../taxi-ride-offers-router";
import { taxiSafetyAuditRouter } from "../taxi-safety-audit-router";
import { taxiSafetyRouter } from "../taxi-safety-router";
import { taxiServerDispatchRouter } from "../taxi-server-dispatch-router";
import { taxiStripeConnectRouter } from "../taxi-stripe-connect-router";
import { taxiSystemHealthRouter } from "../taxi-system-health-router";
import { taxiTripAudioRouter } from "../taxi-trip-audio-router";
import { taxiTripCallRouter } from "../taxi-trip-call-router";
import { taxiTripChatRouter } from "../taxi-trip-chat-router";
import { taxiTripLifecycleRouter } from "../taxi-trip-lifecycle-router";
import { taxiTripSettlementRouter } from "../taxi-trip-settlement-router";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  adminControl: adminControlRouter,
  taxiAdminCancellation: taxiAdminCancellationRouter,
  taxiAdminOperations: taxiAdminOperationsRouter,
  taxiCardPayments: taxiCardPaymentsRouter,
  taxiDriverAnalytics: taxiDriverAnalyticsRouter,
  taxiFinanceAdmin: taxiFinanceAdminRouter,
  taxiJourneyValidation: taxiJourneyValidationRouter,
  taxiLiveTrip: taxiLiveTripRouter,
  taxiNotifications: taxiNotificationsRouter,
  taxiOps: taxiOpsRouter,
  taxiPassengerBooking: taxiPassengerBookingRouter,
  taxiPassengerCancellation: taxiPassengerCancellationRouter,
  taxiPassengerTracking: taxiPassengerTrackingRouter,
  taxiPayments: taxiPaymentsRouter,
  taxiProfiles: taxiProfilesRouter,
  taxiPromotions: taxiPromotionsRouter,
  taxiRatings: taxiRatingsRouter,
  taxiRideAftercare: taxiRideAftercareRouter,
  taxiRideOffers: taxiRideOffersRouter,
  taxiSafety: taxiSafetyRouter,
  taxiSafetyAudit: taxiSafetyAuditRouter,
  taxiServerDispatch: taxiServerDispatchRouter,
  taxiStripeConnect: taxiStripeConnectRouter,
  taxiSystemHealth: taxiSystemHealthRouter,
  taxiTripAudio: taxiTripAudioRouter,
  taxiTripCall: taxiTripCallRouter,
  taxiTripChat: taxiTripChatRouter,
  taxiTripLifecycle: taxiTripLifecycleRouter,
  taxiTripSettlement: taxiTripSettlementRouter,
  health: publicProcedure.input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") })).query(() => ({ ok: true })),
  notifyOwner: adminProcedure.input(z.object({ title: z.string().min(1), content: z.string().min(1) })).mutation(async ({ input }) => ({ success: await notifyOwner(input) } as const)),
});
