import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const profileRoleSchema = z.enum(["passenger", "driver", "admin"]);

const profileInputSchema = z.object({
  role: profileRoleSchema,
  fullName: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  preferredPaymentMethod: z.string().min(2).max(40).default("cash"),
  favoriteAddress: z.string().max(180).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  driverLicenseNumber: z.string().max(80).optional(),
  taxiCode: z.string().max(40).optional(),
  plate: z.string().max(40).optional(),
  vehicleModel: z.string().max(120).optional(),
  workZone: z.string().max(120).optional(),
});

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function assertCanManageRole(ctx: any, role: "passenger" | "driver" | "admin") {
  if (ctx.user?.role === "admin") return;
  if (ctx.user?.role === role) return;
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const taxiProfilesRouter = router({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_user_profiles")
      .select("*")
      .eq("user_id", ctx.user.openId)
      .maybeSingle();

    throwIfSupabaseError(error);
    return data ?? null;
  }),

  upsertMe: protectedProcedure.input(profileInputSchema).mutation(async ({ ctx, input }) => {
    assertCanManageRole(ctx, input.role);

    const { data, error } = await supabase
      .from("taxi_user_profiles")
      .upsert({
        user_id: ctx.user.openId,
        role: input.role,
        full_name: input.fullName,
        phone: input.phone || null,
        avatar_url: input.avatarUrl || null,
        preferred_payment_method: input.preferredPaymentMethod,
        favorite_address: input.favoriteAddress || null,
        emergency_contact_name: input.emergencyContactName || null,
        emergency_contact_phone: input.emergencyContactPhone || null,
        driver_license_number: input.driverLicenseNumber || null,
        taxi_code: input.taxiCode || null,
        plate: input.plate || null,
        vehicle_model: input.vehicleModel || null,
        work_zone: input.workZone || null,
      })
      .select()
      .single();

    throwIfSupabaseError(error);
    return data;
  }),

  getDriverPublicProfile: protectedProcedure
    .input(z.object({ driverId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from("taxi_user_profiles")
        .select("user_id,full_name,avatar_url,rating,completed_rides,taxi_code,plate,vehicle_model,is_verified")
        .eq("user_id", input.driverId)
        .eq("role", "driver")
        .maybeSingle();

      throwIfSupabaseError(error);
      return data ?? null;
    }),

  adminList: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const { data, error } = await supabase
      .from("taxi_user_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  adminVerifyUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1), isVerified: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data, error } = await supabase
        .from("taxi_user_profiles")
        .update({ is_verified: input.isVerified })
        .eq("user_id", input.userId)
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),
});
