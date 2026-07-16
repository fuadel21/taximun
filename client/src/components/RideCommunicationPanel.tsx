import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Send, Sparkles } from "lucide-react";

type Role = "passenger" | "driver";
type QuickCode = "arriving" | "waiting" | "cannot_find_pickup" | "coming_down" | "please_wait" | "pickup_updated";

type Message = {
  id: string;
  sender_id: string;
  sender_role: Role | "admin";
  body: string;
  message_type: "text" | "quick";
  created_at: string;
};

type Conversation = {
  ride: { id: string; passenger_id: string; driver_id: string | null } | null;
  messages: Message[];
  unread: number;
};

const driverQuick: Array<{ code: QuickCode; label: string }> = [
  { code: "arriving", label: "Estoy llegando" },
  { code: "waiting", label: "Te espero aquí" },
  { code: "cannot_find_pickup", label: "No encuentro el punto" },
];

const passengerQuick: Array<{ code: QuickCode; label: string }> = [
  { code: "coming_down", label: "Ya bajo" },
  { code: "please_wait", label: "Espérame un momento" },
  { code: "pickup_updated", label: "Estoy en el punto" },
];

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function RideCommunicationPanel({ role }: { role: Role }) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const conversationQuery = trpc.system.taxiRideMessages.getConversation.useQuery(undefined, {
    retry: false,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });
  const conversation = (conversationQuery.data ?? null) as Conversation | null;
  const ride = conversation?.ride;

  const refresh = async () => {
    await utils.system.taxiRideMessages.getConversation.invalidate();
  };

  const sendMessage = trpc.system.taxiRideMessages.sendMessage.useMutation({
    onSuccess: async () => {
      setBody("");
      setError("");
      await refresh();
    },
    onError: (err) => setError(err.message),
  });

  const sendQuick = trpc.system.taxiRideMessages.sendQuickMessage.useMutation({
    onSuccess: async () => {
      setError("");
      await refresh();
    },
    onError: (err) => setError(err.message),
  });

  if (!ride) return null;

  const quickMessages = role === "driver" ? driverQuick : passengerQuick;
  const messages = conversation?.messages ?? [];
  const saving = sendMessage.isPending || sendQuick.isPending;

  const submit = () => {
    const value = body.trim();
    if (!value) return;
    sendMessage.mutate({ rideId: ride.id, body: value });
  };

  return (
    <section className="mx-auto max-w-5xl px-4 pb-4">
      <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Comunicación del viaje</p>
              <h2 className="text-xl font-black">Mensajes seguros</h2>
            </div>
            <Badge className="bg-cyan-50 text-cyan-800 hover:bg-cyan-50"><MessageCircle className="mr-1 h-4 w-4" />Sin teléfono</Badge>
          </div>

          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickMessages.map((item) => (
              <button
                key={item.code}
                type="button"
                disabled={saving}
                onClick={() => sendQuick.mutate({ rideId: ride.id, code: item.code })}
                className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                <Sparkles className="mr-1 inline h-3.5 w-3.5" />{item.label}
              </button>
            ))}
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-3xl bg-slate-50 p-3">
            {conversationQuery.isLoading && <p className="text-center text-sm font-bold text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando mensajes...</p>}
            {!conversationQuery.isLoading && messages.length === 0 && <p className="p-3 text-center text-sm font-bold text-slate-500">Todavía no hay mensajes.</p>}
            {messages.map((message) => {
              const mine = message.sender_role === role;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm font-semibold ${mine ? "bg-slate-950 text-white" : "bg-white text-slate-800 shadow-sm"}`}>
                    <p>{message.body}</p>
                    <p className={`mt-1 text-[10px] font-bold ${mine ? "text-slate-400" : "text-slate-400"}`}>{time(message.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
              maxLength={600}
              placeholder={role === "driver" ? "Escribe al pasajero" : "Escribe al conductor"}
              className="h-[52px] rounded-2xl"
            />
            <Button onClick={submit} disabled={saving || !body.trim()} className="h-[52px] w-[52px] rounded-2xl bg-cyan-600 p-0 text-white hover:bg-cyan-500">
              {sendMessage.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
          <p className="text-center text-xs font-bold text-slate-500">Los mensajes quedan ligados al viaje y se cierran al finalizarlo.</p>
        </CardContent>
      </Card>
    </section>
  );
}
