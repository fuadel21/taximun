import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, MessageCircle, Mic, Phone, PhoneOff, Send, X } from "lucide-react";

type Props = { role: "passenger" | "driver"; tone?: "light" | "dark" };
type Signal = { id: number; signal_type: "offer" | "answer" | "ice-candidate" | "hangup"; payload: Record<string, unknown> };

const passengerQuick = [
  { code: "coming_down", label: "Ya bajo" },
  { code: "please_wait", label: "Espérame un momento" },
  { code: "at_pickup", label: "Estoy en el punto" },
] as const;

const driverQuick = [
  { code: "arriving", label: "Estoy llegando" },
  { code: "waiting", label: "Estoy esperando" },
  { code: "cannot_find_pickup", label: "No encuentro el punto" },
] as const;

const callReasons = [
  { id: "contact", label: "Contactar" },
  { id: "pickup", label: "Recogida" },
  { id: "delay", label: "Retraso" },
  { id: "emergency", label: "Urgente" },
] as const;

export function TripCommunicationPanel({ role, tone = "light" }: Props) {
  const dark = tone === "dark";
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState<(typeof callReasons)[number]["id"]>("contact");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lastSignalId, setLastSignalId] = useState(0);
  const [callPhase, setCallPhase] = useState<"idle" | "connecting" | "active">("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const stateQuery = trpc.system.taxiTripCommunication.getState.useQuery(undefined, {
    retry: false,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
  const iceQuery = trpc.system.taxiTripCall.getIceConfig.useQuery(undefined, { retry: false });
  const sessionId = stateQuery.data?.activeCallSession?.id ?? null;
  const signalsQuery = trpc.system.taxiTripCall.pollSignals.useQuery(
    { sessionId: sessionId ?? "00000000-0000-0000-0000-000000000000", afterId: lastSignalId },
    { enabled: Boolean(sessionId), retry: false, refetchInterval: 1000 }
  );

  const sendMessage = trpc.system.taxiTripChat.send.useMutation();
  const sendQuick = trpc.system.taxiTripChat.sendQuick.useMutation();
  const markRead = trpc.system.taxiTripChat.markRead.useMutation();
  const requestCall = trpc.system.taxiTripCall.request.useMutation();
  const respondCall = trpc.system.taxiTripCall.respond.useMutation();
  const cancelCall = trpc.system.taxiTripCall.cancel.useMutation();
  const sendSignal = trpc.system.taxiTripCall.sendSignal.useMutation();
  const endSession = trpc.system.taxiTripCall.endSession.useMutation();

  const state = stateQuery.data;
  const ride = state?.ride;
  const messages = state?.messages ?? [];
  const latestRequest = state?.latestCallRequest;
  const session = state?.activeCallSession;
  const quickMessages = role === "driver" ? driverQuick : passengerQuick;
  const incomingRequest = Boolean(latestRequest?.status === "pending" && latestRequest.requester_id !== state?.selfId);
  const ownPendingRequest = Boolean(latestRequest?.status === "pending" && latestRequest.requester_id === state?.selfId);
  const busy = sendMessage.isPending || sendQuick.isPending || requestCall.isPending || respondCall.isPending || cancelCall.isPending;

  const participantName = useMemo(() => {
    if (!ride) return "";
    return role === "driver" ? ride.passenger_name || "Pasajero" : ride.driver_name || "Conductor";
  }, [ride, role]);

  const refresh = async () => {
    await utils.system.taxiTripCommunication.getState.invalidate();
  };

  useEffect(() => {
    if (!ride || !state?.unread || markRead.isPending) return;
    markRead.mutate({ rideId: ride.id }, { onSuccess: refresh });
  }, [ride?.id, state?.unread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const cleanupPeer = () => {
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sessionRef.current = null;
    setLastSignalId(0);
    setCallPhase("idle");
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  useEffect(() => cleanupPeer, []);

  useEffect(() => {
    if (!sessionId || !session || !state?.selfId || !iceQuery.data || sessionRef.current === sessionId) return;
    let cancelled = false;

    const connect = async () => {
      try {
        setError("");
        setCallPhase("connecting");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const peer = new RTCPeerConnection({
          iceServers: iceQuery.data.iceServers,
          iceTransportPolicy: iceQuery.data.iceTransportPolicy,
        });
        sessionRef.current = sessionId;
        streamRef.current = stream;
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));

        peer.ontrack = (event) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            void remoteAudioRef.current.play().catch(() => undefined);
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "connected") setCallPhase("active");
          if (["failed", "closed", "disconnected"].includes(peer.connectionState)) setCallPhase("connecting");
        };
        peer.onicecandidate = (event) => {
          if (!event.candidate) return;
          sendSignal.mutate({ sessionId, type: "ice-candidate", payload: event.candidate.toJSON() });
        };

        if (session.initiator_id === state.selfId) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal.mutateAsync({ sessionId, type: "offer", payload: offer.toJSON() });
        }
      } catch (err) {
        cleanupPeer();
        setError(err instanceof Error ? err.message : "No se pudo activar el micrófono.");
      }
    };

    void connect();
    return () => { cancelled = true; };
  }, [sessionId, iceQuery.data, state?.selfId]);

  useEffect(() => {
    const peer = peerRef.current;
    const currentSession = sessionRef.current;
    const signals = (signalsQuery.data ?? []) as Signal[];
    if (!peer || !currentSession || !signals.length) return;

    const processSignals = async () => {
      for (const signal of signals) {
        try {
          if (signal.signal_type === "offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendSignal.mutateAsync({ sessionId: currentSession, type: "answer", payload: answer.toJSON() });
          } else if (signal.signal_type === "answer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          } else if (signal.signal_type === "ice-candidate") {
            await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
          } else if (signal.signal_type === "hangup") {
            cleanupPeer();
          }
          setLastSignalId((value) => Math.max(value, signal.id));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falló la señalización de la llamada.");
        }
      }
    };

    void processSignals();
  }, [signalsQuery.data]);

  const submitMessage = async () => {
    if (!ride || !message.trim()) return;
    try {
      setError("");
      await sendMessage.mutateAsync({ rideId: ride.id, message: message.trim(), messageType: "text" });
      setMessage("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
    }
  };

  const startCall = async () => {
    if (!ride) return;
    try {
      setError("");
      setNotice("");
      await requestCall.mutateAsync({ rideId: ride.id, reason });
      setNotice("Solicitud de llamada enviada.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar la llamada.");
    }
  };

  const hangUp = async () => {
    if (!sessionId) return;
    try {
      await sendSignal.mutateAsync({ sessionId, type: "hangup", payload: {} });
      await endSession.mutateAsync({ sessionId, reason: "hangup" });
    } finally {
      cleanupPeer();
      await refresh();
    }
  };

  if (!ride) return null;

  return (
    <section className={`px-4 py-5 ${dark ? "bg-black text-white" : "bg-[#f3f3f3] text-black"}`}>
      <div className="mx-auto max-w-5xl">
        <Card className={`rounded-[2rem] border ${dark ? "border-white/10 bg-[#111] text-white" : "border-black/5 bg-white"}`}>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-xs font-black uppercase tracking-[0.22em] ${dark ? "text-white/45" : "text-black/45"}`}>Comunicación del viaje</p>
                <h2 className="mt-1 text-2xl font-black">{participantName}</h2>
                <p className={`mt-1 text-sm font-semibold ${dark ? "text-white/55" : "text-black/55"}`}>{ride.pickup_address} → {ride.dropoff_address}</p>
              </div>
              <Badge className={state?.unread ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}>
                {state?.unread ? `${state.unread} sin leer` : "Al día"}
              </Badge>
            </div>

            {(error || stateQuery.error) && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error || stateQuery.error?.message}</div>}
            {notice && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><Check className="mr-2 inline h-4 w-4" />{notice}</div>}

            <div className={`max-h-80 space-y-2 overflow-y-auto rounded-3xl p-3 ${dark ? "bg-black" : "bg-[#f3f3f3]"}`}>
              {messages.length === 0 ? (
                <div className={`py-8 text-center text-sm font-bold ${dark ? "text-white/40" : "text-black/40"}`}><MessageCircle className="mx-auto mb-2 h-7 w-7" />Todavía no hay mensajes.</div>
              ) : messages.map((item) => {
                const own = item.sender_id === state?.selfId;
                return (
                  <div key={item.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[86%] rounded-3xl px-4 py-3 text-sm font-semibold ${own ? "bg-cyan-600 text-white" : dark ? "bg-white/10 text-white" : "bg-white text-black shadow-sm"}`}>
                      <p>{item.message}</p>
                      <p className={`mt-1 text-[10px] ${own ? "text-white/70" : dark ? "text-white/40" : "text-black/40"}`}>{new Date(item.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {quickMessages.map((item) => (
                <button key={item.code} disabled={busy} onClick={async () => { await sendQuick.mutateAsync({ rideId: ride.id, code: item.code }); await refresh(); }} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black active:scale-95 ${dark ? "bg-white/10 text-white" : "bg-black/5 text-black"}`}>{item.label}</button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitMessage(); }} maxLength={500} placeholder="Escribe un mensaje" className={`h-12 rounded-2xl ${dark ? "border-white/10 bg-white/10 text-white" : "bg-[#f3f3f3]"}`} />
              <Button onClick={submitMessage} disabled={busy || !message.trim()} className="h-12 w-12 shrink-0 rounded-2xl bg-cyan-600 p-0 text-white"><Send className="h-5 w-5" /></Button>
            </div>

            <div className={`rounded-3xl p-4 ${dark ? "bg-white/5" : "bg-black/[0.03]"}`}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-black">Llamada privada</p><p className={`text-xs font-semibold ${dark ? "text-white/50" : "text-black/50"}`}>El número personal nunca se comparte.</p></div>
                {session && <Badge className="bg-emerald-100 text-emerald-800">{callPhase === "active" ? "Conectada" : "Conectando"}</Badge>}
              </div>

              {incomingRequest ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button disabled={busy} onClick={async () => { await respondCall.mutateAsync({ requestId: latestRequest!.id, status: "accepted" }); await refresh(); }} className="h-12 rounded-2xl bg-emerald-600 font-black text-white"><Phone className="mr-2 h-5 w-5" />Aceptar</Button>
                  <Button disabled={busy} onClick={async () => { await respondCall.mutateAsync({ requestId: latestRequest!.id, status: "declined" }); await refresh(); }} variant="outline" className="h-12 rounded-2xl font-black"><X className="mr-2 h-5 w-5" />Rechazar</Button>
                </div>
              ) : session ? (
                <div className="mt-4">
                  <audio ref={remoteAudioRef} autoPlay playsInline />
                  <Button onClick={hangUp} className="h-12 w-full rounded-2xl bg-red-600 font-black text-white"><PhoneOff className="mr-2 h-5 w-5" />Finalizar llamada</Button>
                  {!iceQuery.data?.turnConfigured && <p className="mt-2 text-xs font-bold text-amber-600">TURN no está configurado. La llamada puede fallar entre algunas redes móviles o routers estrictos.</p>}
                </div>
              ) : ownPendingRequest ? (
                <Button disabled={busy} onClick={async () => { await cancelCall.mutateAsync({ requestId: latestRequest!.id }); await refresh(); }} variant="outline" className="mt-4 h-12 w-full rounded-2xl font-black"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Esperando respuesta · Cancelar</Button>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {callReasons.map((item) => <button key={item.id} onClick={() => setReason(item.id)} className={`rounded-2xl px-2 py-3 text-xs font-black ${reason === item.id ? "bg-cyan-600 text-white" : dark ? "bg-white/10" : "bg-white"}`}>{item.label}</button>)}
                  </div>
                  <Button onClick={startCall} disabled={busy} className="h-12 w-full rounded-2xl bg-slate-950 font-black text-white"><Mic className="mr-2 h-5 w-5" />Solicitar llamada</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
