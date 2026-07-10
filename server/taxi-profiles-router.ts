import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const profileRoleSchema = z.enum(["passenger", "driver", "admin"]);
const documentTypeSchema = z.enum(["identity", "driver_license", "taxi_license", "insurance", "vehicle_inspection", "other"]);
const documentStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);

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

const driverDocumentInputSchema = z.object({
  documentType: documentTypeSchema,
  title: z.string().min(2).max(120).optional(),
  documentNumber: z.string().max(120).optional(),
  fileUrl: z.string().url().optional().or(z.literal("")),
  storageBucket: z.string().max(120).optional(),
  storagePath: z.string().max(500).optional(),
  mimeType: z.string().max(120).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  issuedAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
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

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
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
        verification_status: input.role === "driver" ? "in_review" : "approved",
        is_verified: input.role === "driver" ? false : true,
      })
      .select()
      .single();

    throwIfSupabaseError(error);
    return data;
  }),

  getMyDocuments: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_driver_documents")
      .select("*")
      .eq("driver_id", ctx.user.openId)
      .order("created_at", { ascending: false });

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  submitDriverDocument: protectedProcedure
    .input(driverDocumentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "driver" && ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!input.fileUrl && !input.storagePath && !input.documentNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Añade un archivo, una URL o una referencia del documento.",
        });
      }

      const { data, error } = await supabase
        .from("taxi_driver_documents")
        .insert({
          driver_id: ctx.user.openId,
          document_type: input.documentType,
          title: input.title || null,
          document_number: input.documentNumber || null,
          file_url: input.fileUrl || null,
          storage_bucket: input.storageBucket || null,
          storage_path: input.storagePath || null,
          mime_type: input.mimeType || null,
          file_size_bytes: input.fileSizeBytes ?? null,
          issued_at: input.issuedAt || null,
          expires_at: input.expiresAt || null,
          status: "pending",
        })
        .select()
        .single();

      throwIfSupabaseError(error);

      await supabase
        .from("taxi_user_profiles")
        .update({ verification_status: "in_review", is_verified: false })
        .eq("user_id", ctx.user.openId)
        .eq("role", "driver");

      return data;
    }),

  getDriverPublicProfile: protectedProcedure
    .input(z.object({ driverId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from("taxi_user_profiles")
        .select("user_id,full_name,avatar_url,rating,completed_rides,taxi_code,plate,vehicle_model,is_verified,verification_status")
        .eq("user_id", input.driverId)
        .eq("role", "driver")
        .maybeSingle();

      throwIfSupabaseError(error);
      return data ?? null;
    }),

  adminList: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);

    const { data, error } = await supabase
      .from("taxi_user_profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  adminListDriverDocuments: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);

    const [driversResult, documentsResult] = await Promise.all([
      supabase
        .from("taxi_driver_verification_overview")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("taxi_driver_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    throwIfSupabaseError(driversResult.error);
    throwIfSupabaseError(documentsResult.error);

    return {
      drivers: driversResult.data ?? [],
      documents: documentsResult.data ?? [],
    };
  }),

  adminVerifyUser: protectedProcedure
    .input(z.object({ userId: z.string().min(1), isVerified: z.boolean(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);

      const { data, error } = await supabase
        .from("taxi_user_profiles")
        .update({
          is_verified: input.isVerified,
          verification_status: input.isVerified ? "approved" : "rejected",
          verification_note: input.note || null,
          verified_by: ctx.user.openId,
          verified_at: new Date().toISOString(),
        })
        .eq("user_id", input.userId)
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),

  adminReviewDriverDocument: protectedProcedure
    .input(z.object({ documentId: z.string().uuid(), status: documentStatusSchema, rejectionReason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);

      const { data, error } = await supabase
        .from("taxi_driver_documents")
        .update({
          status: input.status,
          reviewed_by: ctx.user.openId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: input.rejectionReason || null,
        })
        .eq("id", input.documentId)
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),
});
