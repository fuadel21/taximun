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
