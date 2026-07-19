import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";
import { sendTaxiPush } from "./taxi-push-service";

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

const expoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, "Token Expo Push no válido");

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
  const { data, error } = await supabase
    .from("taxi_notifications")
    .insert({
      recipient_id: input.recipientId,
      recipient_role: input.recipientRole ?? "user",
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? "system",
      type: input.type ?? "info",
      title: input.title,
      body: input.body ?? null,
      action_url: input.actionUrl ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  throwIfSupabaseError(error);

  void sendTaxiPush({
    recipientId: input.recipientId,
    notificationId: data?.id ?? null,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl,
    metadata: input.metadata,
    priority: input.type === "error" || input.type === "warning" ? "high" : "default",
  }).catch((pushError) => {
    console.error("[taximun-push] delivery failed", pushError);
  });

  return data;
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
  const { data: admins, error: adminError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  throwIfSupabaseError(adminError);

  await Promise.all(
    (admins ?? []).map((admin) =>
      createTaxiNotification({
        recipientId: admin.id,
        recipientRole: "admin",
        actorId: input.actorId,
        actorRole: input.actorRole,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
        metadata: input.metadata,
      })
    )
  );
}

export const taxiNotificationsRouter = router({
  registerPushDevice: protectedProcedure
    .input(
      z.object({
        expoPushToken: expoPushTokenSchema,
        platform: z.enum(["android", "ios", "web", "unknown"]).default("unknown"),
        deviceName: z.string().max(120).optional(),
        appVersion: z.string().max(40).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = ["passenger", "driver", "admin"].includes(ctx.user.role)
        ? ctx.user.role
        : "user";

      const { data, error } = await supabase
        .from("taxi_push_devices")
        .upsert(
          {
            user_id: ctx.user.openId,
            user_role: role,
            expo_push_token: input.expoPushToken,
            platform: input.platform,
            device_name: input.deviceName ?? null,
            app_version: input.appVersion ?? null,
            enabled: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "expo_push_token" }
        )
        .select("id, platform, enabled, last_seen_at")
        .single();

      throwIfSupabaseError(error);
      return data;
    }),

  unregisterPushDevice: protectedProcedure
    .input(z.object({ expoPushToken: expoPushTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("taxi_push_devices")
        .update({ enabled: false, last_seen_at: new Date().toISOString() })
        .eq("expo_push_token", input.expoPushToken)
        .eq("user_id", ctx.user.openId);

      throwIfSupabaseError(error);
      return { success: true };
    }),

  pushStatus: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("taxi_push_devices")
      .select("id, platform, device_name, app_version, enabled, last_seen_at")
      .eq("user_id", ctx.user.openId)
      .order("last_seen_at", { ascending: false });

    throwIfSupabaseError(error);
    return data ?? [];
  }),

  sendTestPush: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await sendTaxiPush({
      recipientId: ctx.user.openId,
      title: "Taximun está conectado",
      body: "Las notificaciones push funcionan correctamente en este dispositivo.",
      actionUrl: "/notifications",
      metadata: { kind: "push_test" },
      priority: "high",
    });

    return { success: result.sent > 0, ...result };
  }),

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
