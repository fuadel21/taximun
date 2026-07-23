import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TripAudioRoomPanel } from "@/components/TripAudioRoomPanel";
import { BellRing, Check, Clock3, Loader2, MessageCircle, PhoneCall, PhoneOff, Send, ShieldCheck, X } from "lucide-react";

type Role = "driver" | "passenger";
type Message = { id: string; sender_id: string; sender_role: string; message: string; created_at: string; read_at?: string | null };
type CallRequest = { id: string; requester_role: string; status: string; reason: string; expires_at: string };
type QuickCode = "arriving" | "waiting" | "cannot_find_pickup" | "coming_down" | "please_wait" | "at_pickup";
type ChatListResponse = { messages: Message[]; unread: number };

const QUICK: Record<Role, Array<{ code: QuickCode; label: string }>> = {
  driver: [
    { code: "arriving", label: "Estoy llegando" },
    { code: "waiting", label: "Estoy en el punto de recogida" },
    { code: "cannot_find_pickup", label: "No encuentro el punto exacto" },
  ],
  passenger: [
    { code: "coming_down", label: "Ya bajo" },
    { code: "please_wait", label: "Espérame un momento" },
    { code: "at_pickup", label: "Estoy en el punto indicado" },
  ],
};

const REASON_LABEL: Record<string, string> = {
  contact: "Quiere hablar contigo",
  pickup: "Necesita confirmar la recogida",
  delay: "Quiere avisarte de un retraso",
  emergency: "Llamada prioritaria del viaje",
};

function playRing() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.value = 0.06;
    gain.connect(context.destination);
    [0, 0.28].forEach((offset) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 740;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.18);
    });
    window.setTimeout(() => context.close().catch(() => undefined), 900);
  } catch {}
}

export function TripChatPanel({ rideId, role }: { rideId: string; role: Role }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const alertedCallRef = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.system.taxiTripChat.list.useQuery({ rideId }, { refetchInterval: 3000, refetchOnWindowFocus: true });
  const callQuery = trpc.system.taxiTripCall.getLatest.useQuery({ rideId }, { refetchInterval: 2000, refetchOnWindowFocus: true });
  const chat = (query.data ?? null) as ChatListResponse | null;
  const messages = chat?.messages ?? [];
  const call = (callQuery.data ?? null) as CallRequest | null;
  const unread = Number(chat?.unread ?? 0);
  const remainingSeconds = call?.status === "pending" ? Math.max(0, Math.ceil((new Date(call.expires_at).getTime() - now) / 1000)) : 0;
  const incoming = call?.status === "pending" && call.requester_role !== role && remainingSeconds > 0;
  const outgoing = call?.status === "pending" && call.requester_role === role && remainingSeconds > 0;

  const refreshChat = () => utils.system.taxiTripChat.list.invalidate({ rideId });
  const refreshCall = () => utils.system.taxiTripCall.getLatest.invalidate({ rideId });
  const requestCall = trpc.system.taxiTripCall.request.useMutation({ onSuccess: refreshCall });
  const respondCall = trpc.system.taxiTripCall.respond.useMutation({ onSuccess: refreshCall });
  const cancelCall = trpc.system.taxiTripCall.cancel.useMutation({ onSuccess: refreshCall });
  const markRead = trpc.system.taxiTripChat.markRead.useMutation({ onSuccess: refreshChat });
  const send = trpc.system.taxiTripChat.send.useMutation({
    onSuccess: async () => {
      setText("");
      await refreshChat();
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    },
  });
  const sendQuick = trpc.system.taxiTripChat.sendQuick.useMutation({
    onSuccess: async () => {
      await refreshChat();
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    },
  });

  useEffect(() => {
    if (!call || call.status !== "pending") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [call?.id, call?.status]);

  useEffect(() => { if (open && unread > 0 && !markRead.isPending) markRead.mutate({ rideId }); }, [open, unread, rideId]);
  useEffect(() => {
    if (!incoming || !call || alertedCallRef.current === call.id) return;
    alertedCallRef.current = call.id;
    navigator.vibrate?.([220, 100, 220, 100, 350]);
    playRing();
    const timer = window.setInterval(() => {
      navigator.vibrate?.([180, 90, 180]);
      playRing();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [incoming, call?.id]);
  useEffect(() => { if (!open && unread > 0 && !incoming) navigator.vibrate?.(120); }, [unread, open, incoming]);

  const submit = (message: string) => {
    const clean = message.trim();
    if (!clean || send.isPending) return;
    send.mutate({ rideId, message: clean, messageType: "text" });
  };

  const callBusy = requestCall.isPending || respondCall.isPending || cancelCall.isPending;
  const callError = callQuery.error || requestCall.error || respondCall.error || cancelCall.error;
  const chatError = query.error || send.error || sendQuick.error || markRead.error;

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white shadow-lg">
      <div className="border-b border-slate-100 p-4">
        {incoming ? (
          <div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-14 w-14 shrink-0 animate-pulse items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg"><BellRing className="h-7 w-7" /></span>
              <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Llamada entrante</p><p className="mt-1 text-xl font-black text-slate-950">{role === "driver" ? "El pasajero te llama" : "El conductor te llama"}</p><p className="mt-1 text-xs font-bold text-slate-600">{REASON_LABEL[call?.reason || "contact"]}</p></div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-cyan-800"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{remainingSeconds}s</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button onClick={() => respondCall.mutate({ requestId: call!.id, status: "declined" })} disabled={callBusy} variant="outline" className="h-14 rounded-2xl border-red-200 bg-white text-base font-black text-red-700"><PhoneOff className="mr-2 h-5 w-5" />Rechazar</Button>
              <Button onClick={() => respondCall.mutate({ requestId: call!.id, status: "accepted" })} disabled={callBusy} className="h-14 rounded-2xl bg-emerald-600 text-base font-black text-white"><Check className="mr-2 h-5 w-5" />Aceptar</Button>
            </div>
          </div>
        ) : outgoing ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><PhoneCall className="h-6 w-6 animate-pulse" /></span><div className="min-w-0 flex-1"><p className="font-black text-emerald-950">Llamando…</p><p className="text-xs font-bold text-emerald-700">Esperando respuesta · {remainingSeconds}s</p></div><Button onClick={() => cancelCall.mutate({ requestId: call!.id })} disabled={callBusy} variant="outline" className="h-11 rounded-2xl border-red-200 bg-white font-black text-red-700"><X className="mr-1 h-4 w-4" />Cancelar</Button></div>
          </div>
        ) : (
          <Button onClick={() => requestCall.mutate({ rideId, reason: "contact" })} disabled={requestCall.isPending || call?.status === "accepted"} className="h-12 w-full rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500">
            {requestCall.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PhoneCall className="mr-2 h-5 w-5" />}Solicitar llamada
          </Button>
        )}
        <p className="mt-2 text-xs font-bold text-slate-500">La llamada es privada y no muestra números personales. Las solicitudes caducan automáticamente.</p>
        {call?.status === "accepted" && <TripAudioRoomPanel rideId={rideId} callRequestId={call.id} role={role} />}
        {callError && <p className="mt-2 text-xs font-bold text-red-600">{callError.message}</p>}
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><MessageCircle className="h-5 w-5" /></span><span><span className="block font-black text-slate-950">Chat del viaje</span><span className="block text-xs font-bold text-slate-500">Sin compartir teléfonos personales</span></span></span>
        {unread > 0 && <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-black text-white">{unread}</span>}
      </button>

      {open && <div className="border-t border-slate-100 p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{QUICK[role].map((item) => <Button key={item.code} type="button" variant="outline" onClick={() => sendQuick.mutate({ rideId, code: item.code })} disabled={sendQuick.isPending} className="h-11 shrink-0 rounded-2xl font-black">{item.label}</Button>)}</div>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">
          {query.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-600" />}
          {!query.isLoading && messages.length === 0 && <p className="py-6 text-center text-sm font-bold text-slate-400">Todavía no hay mensajes.</p>}
          {messages.map((m) => { const mine = m.sender_role === role; return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm font-semibold ${mine ? "bg-cyan-600 text-white" : "bg-white text-slate-800 shadow-sm"}`}><p>{m.message}</p><p className={`mt-1 text-[10px] ${mine ? "text-cyan-100" : "text-slate-400"}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>; })}
          <div ref={bottomRef} />
        </div>
        <div className="mt-3 flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit(text)} maxLength={500} placeholder="Escribe un mensaje" className="h-[52px] rounded-2xl" /><Button onClick={() => submit(text)} disabled={!text.trim() || send.isPending} className="h-[52px] w-[52px] rounded-2xl bg-slate-950 p-0 text-white">{send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</Button></div>
        <p className="mt-3 text-xs font-bold text-slate-400"><ShieldCheck className="mr-1 inline h-4 w-4" />El chat se limita al conductor, pasajero y administración.</p>
        {chatError && <p className="mt-2 text-xs font-bold text-red-600">{chatError.message}</p>}
      </div>}
    </div>
  );
}
