import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const notificationTypeSchema = z.enum([
  "info",
  "success",
  "warning",
  "error",
  "document_uploaded",
  "document_approved",
  "document_rejected",
  "driver_approved",
  "driver_rejected",
]);

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

export async function createTaxiNotification(input: {
  recipientId: string;
  recipientRole?: "passenger" | "driver" | "admin" | "user";
  actorId?: string | null;
  actorRole?: "passenger" | "driver" | "admin" | "system" | null;
  type?: z.infer<typeof notificationTypeSchema>;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("taxi_notifications").insert({
    recipient_id: input.recipientId,
    recipient_role: input.recipientRole ?? "user",
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? "system",
    type: input.type ?? "info",
    title: input.title,
    body: input.body ?? null,
    action_url: input.actionUrl ?? null,
    metadata: input.metadata ?? {},
  });

  throwIfSupabaseError(error);
}

export async function notifyAdmins(input: {
  actorId: string;
  actorRole: "passenger" | "driver" | "admin" | "system";
  type: z.infer<typeof notificationTypeSchema>;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("taximun_notify_admins", {
    p_actor_id: input.actorId,
    p_actor_role: input.actorRole,
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? null,
    p_action_url: input.actionUrl ?? null,
    p_metadata: input.metadata ?? {},
  });

  throwIfSupabaseError(error);
}

export const taxiNotificationsRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_notifications")
      .select("*")
      .eq("recipient_id", ctx.user.openId)
      .order("created_at", { ascending: false })
      .limit(50);

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await supabase
      .from("taxi_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", ctx.user.openId)
      .is("read_at", null);

    throwIfSupabaseError(error);
    return count ?? 0;
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("taxi_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", input.notificationId)
        .eq("recipient_id", ctx.user.openId)
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { error } = await supabase
      .from("taxi_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", ctx.user.openId)
      .is("read_at", null);

    throwIfSupabaseError(error);
    return { success: true };
  }),
});
