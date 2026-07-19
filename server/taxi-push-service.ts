import { supabase } from "./supabase-client";

type PushPayload = {
  recipientId: string;
  notificationId?: string | null;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
};

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendTaxiPush(input: PushPayload) {
  const { data: devices, error } = await supabase
    .from("taxi_push_devices")
    .select("id, expo_push_token")
    .eq("user_id", input.recipientId)
    .eq("enabled", true);

  if (error) throw new Error(error.message);
  if (!devices?.length) return { sent: 0, failed: 0 };

  const messages = devices.map((device) => ({
    to: device.expo_push_token,
    sound: "default",
    title: input.title,
    body: input.body ?? undefined,
    priority: input.priority ?? "high",
    channelId: "taximun-default",
    data: {
      actionUrl: input.actionUrl ?? null,
      notificationId: input.notificationId ?? null,
      ...(input.metadata ?? {}),
    },
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const json = (await response.json().catch(() => ({}))) as { data?: ExpoTicket[] };
  const tickets = Array.isArray(json.data) ? json.data : [];

  let sent = 0;
  let failed = 0;

  await Promise.all(
    devices.map(async (device, index) => {
      const ticket = tickets[index];
      const ok = response.ok && ticket?.status === "ok";
      if (ok) sent += 1;
      else failed += 1;

      await supabase.from("taxi_push_deliveries").insert({
        notification_id: input.notificationId ?? null,
        recipient_id: input.recipientId,
        push_device_id: device.id,
        provider: "expo",
        status: ok ? "sent" : "failed",
        provider_ticket_id: ticket?.id ?? null,
        error_code: ticket?.details?.error ?? (!response.ok ? `HTTP_${response.status}` : null),
        error_message: ticket?.message ?? (!response.ok ? response.statusText : null),
        attempted_at: new Date().toISOString(),
        delivered_at: ok ? new Date().toISOString() : null,
        payload: messages[index],
      });

      if (ticket?.details?.error === "DeviceNotRegistered") {
        await supabase
          .from("taxi_push_devices")
          .update({ enabled: false })
          .eq("id", device.id);
      }
    })
  );

  return { sent, failed };
}
