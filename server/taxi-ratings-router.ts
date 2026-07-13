import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { createTaxiNotification } from "./taxi-notifications-router";
import { supabase } from "./supabase-client";

const ratingTagSchema = z.enum([
  "safe_driving",
  "professional",
  "punctual",
  "friendly",
  "clean_vehicle",
]);

function throwIfSupabaseError(error: { message: string; code?: string } | null) {
  if (error) {
    if (error.code === "23505") {
      throw new TRPCError({ code: "CONFLICT", message: "Este viaje ya ha sido valorado." });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function assertPassenger(ctx: any) {
  if (ctx.user?.role !== "passenger" && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

async function refreshDriverRating(driverId: string) {
  const { data: ratings, error } = await supabase
    .from("taxi_ride_ratings")
    .select("score")
    .eq("driver_id", driverId);

  throwIfSupabaseError(error);

  const values = (ratings ?? []).map((item) => Number(item.score)).filter(Number.isFinite);
  const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 5;

  const { error: updateError } = await supabase
    .from("taxi_user_profiles")
    .update({
      rating: Number(average.toFixed(2)),
      rating_count: values.length,
    })
    .eq("user_id", driverId)
    .eq("role", "driver");

  throwIfSupabaseError(updateError);
  return { rating: Number(average.toFixed(2)), ratingCount: values.length };
}

export const taxiRatingsRouter = router({
  getMyRatings: protectedProcedure.query(async ({ ctx }) => {
    assertPassenger(ctx);

    const { data, error } = await supabase
      .from("taxi_ride_ratings")
      .select("*")
      .eq("passenger_id", ctx.user.openId)
      .order("created_at", { ascending: false })
      .limit(100);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  getPublicDriverReputation: protectedProcedure
    .input(z.object({ driverId: z.string().min(1) }))
    .query(async ({ input }) => {
      const [profileResult, ratingsResult] = await Promise.all([
        supabase
          .from("taxi_user_profiles")
          .select("user_id,full_name,avatar_url,rating,rating_count,completed_rides,taxi_code,plate,vehicle_model,work_zone,is_verified,verification_status,created_at")
          .eq("user_id", input.driverId)
          .eq("role", "driver")
          .maybeSingle(),
        supabase
          .from("taxi_ride_ratings")
          .select("id,score,comment,tags,created_at")
          .eq("driver_id", input.driverId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      throwIfSupabaseError(profileResult.error);
      throwIfSupabaseError(ratingsResult.error);

      if (!profileResult.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Perfil público del conductor no encontrado." });
      }

      const ratings = ratingsResult.data ?? [];
      const tagCounts: Record<string, number> = {};
      for (const rating of ratings) {
        for (const tag of Array.isArray(rating.tags) ? rating.tags : []) {
          tagCounts[String(tag)] = (tagCounts[String(tag)] ?? 0) + 1;
        }
      }

      const badges: string[] = [];
      const average = Number(profileResult.data.rating ?? 5);
      const ratingCount = Number(profileResult.data.rating_count ?? ratings.length);
      const completedRides = Number(profileResult.data.completed_rides ?? 0);

      if (profileResult.data.is_verified) badges.push("verified");
      if (average >= 4.8 && ratingCount >= 5) badges.push("excellent_rating");
      if (completedRides >= 100) badges.push("experienced");
      if ((tagCounts.punctual ?? 0) >= 3) badges.push("punctual");
      if ((tagCounts.safe_driving ?? 0) >= 3) badges.push("safe_driver");
      if ((tagCounts.clean_vehicle ?? 0) >= 3) badges.push("clean_vehicle");

      return {
        profile: profileResult.data,
        badges,
        tagCounts,
        reviews: ratings.map((rating) => ({
          id: rating.id,
          score: rating.score,
          comment: rating.comment,
          tags: rating.tags,
          createdAt: rating.created_at,
        })),
      };
    }),

  createRating: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid(),
        score: z.number().int().min(1).max(5),
        comment: z.string().trim().max(600).optional(),
        tags: z.array(ratingTagSchema).max(5).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertPassenger(ctx);

      const { data: ride, error: rideError } = await supabase
        .from("taxi_rides")
        .select("id,passenger_id,driver_id,driver_name,status,pickup_address,dropoff_address")
        .eq("id", input.rideId)
        .eq("passenger_id", ctx.user.openId)
        .maybeSingle();

      throwIfSupabaseError(rideError);

      if (!ride) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Viaje no encontrado." });
      }
      if (ride.status !== "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo puedes valorar viajes finalizados." });
      }
      if (!ride.driver_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este viaje no tiene conductor asignado." });
      }

      const { data, error } = await supabase
        .from("taxi_ride_ratings")
        .insert({
          ride_id: ride.id,
          passenger_id: ctx.user.openId,
          driver_id: ride.driver_id,
          score: input.score,
          comment: input.comment || null,
          tags: input.tags,
        })
        .select()
        .single();

      throwIfSupabaseError(error);
      const aggregate = await refreshDriverRating(ride.driver_id);

      await createTaxiNotification({
        recipientId: ride.driver_id,
        recipientRole: "driver",
        actorId: ctx.user.openId,
        actorRole: "passenger",
        type: "success",
        title: "Nueva valoración recibida",
        body: `Has recibido ${input.score} de 5 estrellas por el viaje a ${ride.dropoff_address || "destino"}.`,
        actionUrl: "/driver/profile",
        metadata: {
          rideId: ride.id,
          ratingId: data.id,
          score: input.score,
          rating: aggregate.rating,
          ratingCount: aggregate.ratingCount,
        },
      });

      return {
        ...data,
        driverRating: aggregate.rating,
        driverRatingCount: aggregate.ratingCount,
      };
    }),
});
