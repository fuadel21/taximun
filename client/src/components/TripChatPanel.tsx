import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, Send, ShieldCheck } from "lucide-react";

type Role = "driver" | "passenger";
type Message = { id: string; sender_id: string; sender_role: string; message: string; created_at: string; read_at?: string | null };

const QUICK: Record<Role, string[]> = {
  driver: ["Estoy llegando", "Estoy en el punto de recogida", "Te espero unos minutos", "No encuentro el punto exacto", "Voy con un pequeño retraso"],
  passenger: ["Ya bajo", "Estoy en la puerta", "Llego en 2 minutos", "No encuentro el taxi", "Entendido"],
};

export function TripChatPanel({ rideId, role }: { rideId: string; role: Role }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.system.taxiTripChat.list.useQuery({ rideId }, { refetchInterval: 3000, refetchOnWindowFocus: true });
  const messages = (query.data ?? []) as Message[];
  const unread = useMemo(() => messages.filter((m) => m.sender_role !== role && !m.read_at).length, [messages, role]);

  const markRead = trpc.system.taxiTripChat.markRead.useMutation({
    onSuccess: () => utils.system.taxiTripChat.list.invalidate({ rideId }),
  });
  const send = trpc.system.taxiTripChat.send.useMutation({
    onSuccess: async () => {
      setText("");
      await utils.system.taxiTripChat.list.invalidate({ rideId });
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    },
  });

  useEffect(() => {
    if (open && unread > 0 && !markRead.isPending) markRead.mutate({ rideId });
  }, [open, unread, rideId]);

  useEffect(() => {
    if (!open && unread > 0 && "vibrate" in navigator) navigator.vibrate(120);
  }, [unread, open]);

  const submit = (message: string, messageType: "text" | "quick") => {
    const clean = message.trim();
    if (!clean || send.isPending) return;
    send.mutate({ rideId, message: clean, messageType });
  };

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white shadow-lg">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><MessageCircle className="h-5 w-5" /></span><span><span className="block font-black text-slate-950">Chat del viaje</span><span className="block text-xs font-bold text-slate-500">Sin compartir teléfonos personales</span></span></span>
        {unread > 0 && <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-black text-white">{unread}</span>}
      </button>

      {open && <div className="border-t border-slate-100 p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {QUICK[role].map((item) => <Button key={item} type="button" variant="outline" onClick={() => submit(item, "quick")} className="h-11 shrink-0 rounded-2xl font-black">{item}</Button>)}
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">
          {query.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-cyan-600" />}
          {!query.isLoading && messages.length === 0 && <p className="py-6 text-center text-sm font-bold text-slate-400">Todavía no hay mensajes.</p>}
          {messages.map((m) => {
            const mine = m.sender_role === role;
            return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm font-semibold ${mine ? "bg-cyan-600 text-white" : "bg-white text-slate-800 shadow-sm"}`}><p>{m.message}</p><p className={`mt-1 text-[10px] ${mine ? "text-cyan-100" : "text-slate-400"}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>;
          })}
          <div ref={bottomRef} />
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit(text, "text")} maxLength={500} placeholder="Escribe un mensaje" className="h-[52px] rounded-2xl" />
          <Button onClick={() => submit(text, "text")} disabled={!text.trim() || send.isPending} className="h-[52px] w-[52px] rounded-2xl bg-slate-950 p-0 text-white">{send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</Button>
        </div>
        <p className="mt-3 text-xs font-bold text-slate-400"><ShieldCheck className="mr-1 inline h-4 w-4" />El chat se limita al conductor, pasajero y administración.</p>
        {(query.error || send.error) && <p className="mt-2 text-xs font-bold text-red-600">{query.error?.message || send.error?.message}</p>}
      </div>}
    </div>
  );
}
