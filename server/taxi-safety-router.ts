import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const categorySchema = z.enum(["sos", "safety", "lost_item", "route_issue", "payment_issue", "other"]);
const prioritySchema = z.enum(["low", "normal", "high", "critical"]);
const statusSchema = z.enum(["open", "in_review", "resolved", "dismissed"]);

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

function reporterRole(ctx: any): "passenger" | "driver" | "admin" {
  if (ctx.user?.role === "admin") return "admin";
  if (ctx.user?.role === "driver") return "driver";
  return "passenger";
}

export const taxiSafetyRouter = router({
  createReport: protectedProcedure
    .input(
      z.object({
        rideId: z.string().uuid().optional(),
        category: categorySchema.default("safety"),
        priority: prioritySchema.default("normal"),
        title: z.string().min(2).max(160),
        description: z.string().max(1000).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        contactPhone: z.string().max(40).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("taxi_safety_reports")
        .insert({
          reporter_id: ctx.user.openId,
          reporter_role: reporterRole(ctx),
          ride_id: input.rideId ?? null,
          category: input.category,
          priority: input.priority,
          title: input.title,
          description: input.description ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          contact_phone: input.contactPhone ?? null,
        })
        .select()
        .single();

      throwIfSupabaseError(error);

      await supabase.from("taxi_activity_logs").insert({
        actor_id: ctx.user.openId,
        actor_role: reporterRole(ctx),
        message: input.priority === "critical" ? "SOS enviado" : `Incidencia enviada: ${input.title}`,
        ride_id: input.rideId ?? null,
      });

      return data;
    }),

  getMyReports: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_safety_reports")
      .select("*")
      .eq("reporter_id", ctx.user.openId)
      .order("created_at", { ascending: false })
      .limit(30);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  adminList: protectedProcedure
    .input(
      z
        .object({
          status: statusSchema.optional(),
          priority: prioritySchema.optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      let query = supabase
        .from("taxi_safety_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (input?.status) query = query.eq("status", input.status);
      if (input?.priority) query = query.eq("priority", input.priority);

      const { data, error } = await query;
      throwIfSupabaseError(error);
      return data ?? [];
    }),

  adminUpdateStatus: protectedProcedure
    .input(
      z.object({
        reportId: z.string().uuid(),
        status: statusSchema,
        resolutionNote: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const patch: Record<string, unknown> = {
        status: input.status,
        assigned_admin_id: ctx.user.openId,
        resolution_note: input.resolutionNote ?? null,
      };

      if (input.status === "resolved" || input.status === "dismissed") {
        patch.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("taxi_safety_reports")
        .update(patch)
        .eq("id", input.reportId)
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),
});
