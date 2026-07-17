import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Radio, Loader2, Wifi, WifiOff, RefreshCw, ShieldCheck, SignalHigh, SignalMedium, SignalLow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Role = "driver" | "passenger";
type Quality = "excellent" | "good" | "poor" | "offline";
type Room = { id: string; status: string; driver_joined_at?: string | null; passenger_joined_at?: string | null; started_at?: string | null };
type Signal = { id: string; sender_role: Role; signal_type: "offer" | "answer" | "ice"; payload: Record<string, unknown> };
type QualityMetrics = { quality: Quality; roundTripMs: number | null; jitterMs: number | null; packetsLost: number | null; bitrateKbps: number | null };

const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const EMPTY_QUALITY: QualityMetrics = { quality: "offline", roundTripMs: null, jitterMs: null, packetsLost: null, bitrateKbps: null };

function classifyQuality(connectionState: RTCPeerConnectionState, roundTripMs: number | null, jitterMs: number | null, packetsLost: number | null): Quality {
  if (["failed", "disconnected", "closed"].includes(connectionState)) return "offline";
  if (connectionState !== "connected") return "poor";
  if ((roundTripMs ?? 0) > 500 || (jitterMs ?? 0) > 80 || (packetsLost ?? 0) > 20) return "poor";
  if ((roundTripMs ?? 0) > 250 || (jitterMs ?? 0) > 40 || (packetsLost ?? 0) > 5) return "good";
  return "excellent";
}

export function TripAudioRoomPanel({ rideId, callRequestId, role }: { rideId: string; callRequestId: string; role: Role }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics>(EMPTY_QUALITY);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const processedSignalsRef = useRef(new Set<string>());
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousBytesRef = useRef<{ bytes: number; timestamp: number } | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.system.taxiTripAudio.getLatest.useQuery({ rideId }, { refetchInterval: 2500 });
  const room = (query.data ?? null) as Room | null;
  const refresh = () => utils.system.taxiTripAudio.getLatest.invalidate({ rideId });
  const openRoom = trpc.system.taxiTripAudio.open.useMutation({ onSuccess: refresh });
  const joinRoom = trpc.system.taxiTripAudio.join.useMutation({ onSuccess: refresh });
  const endRoom = trpc.system.taxiTripAudio.end.useMutation({ onSuccess: refresh });
  const sendSignal = trpc.system.taxiTripAudio.sendSignal.useMutation();
  const clearSignals = trpc.system.taxiTripAudio.clearSignals.useMutation();
  const reportQuality = trpc.system.taxiTripAudio.reportQuality.useMutation();
  const iceConfigQuery = trpc.system.taxiTripAudio.getIceConfig.useQuery(
    { roomId: activeRoomId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: joined && Boolean(activeRoomId), staleTime: 5 * 60 * 1000 },
  );
  const signalsQuery = trpc.system.taxiTripAudio.listSignals.useQuery(
    { roomId: activeRoomId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: joined && Boolean(activeRoomId), refetchInterval: 900, refetchOnWindowFocus: true },
  );

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const closePeerOnly = () => {
    clearReconnectTimer();
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingIceRef.current = [];
    previousBytesRef.current = null;
  };

  const closeMedia = () => {
    closePeerOnly();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    processedSignalsRef.current.clear();
    setReconnecting(false);
    setConnectionState("closed");
    setQualityMetrics(EMPTY_QUALITY);
  };

  useEffect(() => () => closeMedia(), []);

  const sendRtcSignal = async (roomId: string, signalType: "offer" | "answer" | "ice", payload: Record<string, unknown>) => {
    await sendSignal.mutateAsync({ roomId, signalType, payload });
  };

  const flushPendingIce = async (peer: RTCPeerConnection) => {
    const candidates = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  };

  const sendOffer = async (peer: RTCPeerConnection, roomId: string, iceRestart = false) => {
    const offer = await peer.createOffer({ offerToReceiveAudio: true, iceRestart });
    await peer.setLocalDescription(offer);
    await sendRtcSignal(roomId, "offer", { type: offer.type, sdp: offer.sdp });
  };

  const createPeer = (roomId: string, stream: MediaStream, configuration?: RTCConfiguration) => {
    const peer = new RTCPeerConnection(configuration ?? FALLBACK_ICE);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => undefined);
      }
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) sendRtcSignal(roomId, "ice", event.candidate.toJSON() as Record<string, unknown>).catch(() => undefined);
    };
    peer.onconnectionstatechange = () => {
      setConnectionState(peer.connectionState);
      if (peer.connectionState === "connected") {
        clearReconnectTimer();
        setReconnecting(false);
        setPermissionError("");
      }
      if (["disconnected", "failed"].includes(peer.connectionState)) {
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => reconnect().catch(() => undefined), 2500);
      }
    };
    peerRef.current = peer;
    return peer;
  };

  const reconnect = async () => {
    if (!joined || !activeRoomId || !streamRef.current || reconnecting) return;
    setReconnecting(true);
    setPermissionError("");
    try {
      closePeerOnly();
      processedSignalsRef.current.clear();
      await clearSignals.mutateAsync({ roomId: activeRoomId });
      const config = iceConfigQuery.data ? { iceServers: iceConfigQuery.data.iceServers } : FALLBACK_ICE;
      const peer = createPeer(activeRoomId, streamRef.current, config);
      setConnectionState("connecting");
      setReconnectCount((value) => value + 1);
      if (role === "driver") await sendOffer(peer, activeRoomId, true);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "No se pudo reconectar la llamada.");
      setReconnecting(false);
    }
  };

  const enter = async () => {
    setPermissionError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("Este navegador no admite llamadas de audio WebRTC.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      streamRef.current = stream;
      let current = room;
      if (!current || ["ended", "expired"].includes(current.status)) current = await openRoom.mutateAsync({ rideId, callRequestId });
      await joinRoom.mutateAsync({ roomId: current.id });
      setActiveRoomId(current.id);
      setJoined(true);
      setConnectionState("new");
      const peer = createPeer(current.id, stream, FALLBACK_ICE);
      if (role === "driver") await sendOffer(peer, current.id);
    } catch (error) {
      closeMedia();
      setJoined(false);
      setActiveRoomId(null);
      setPermissionError(error instanceof Error ? error.message : "No se pudo activar la llamada de audio.");
    }
  };

  useEffect(() => {
    if (!joined || !activeRoomId || !peerRef.current || !signalsQuery.data) return;
    const signals = signalsQuery.data as Signal[];
    const process = async () => {
      for (const signal of signals) {
        if (signal.sender_role === role || processedSignalsRef.current.has(signal.id)) continue;
        processedSignalsRef.current.add(signal.id);
        const peer = peerRef.current;
        if (!peer || peer.signalingState === "closed") continue;
        try {
          if (signal.signal_type === "offer" && role === "passenger") {
            if (peer.signalingState !== "stable") await peer.setLocalDescription({ type: "rollback" });
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            await flushPendingIce(peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await sendRtcSignal(activeRoomId, "answer", { type: answer.type, sdp: answer.sdp });
          } else if (signal.signal_type === "answer" && role === "driver" && peer.signalingState === "have-local-offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            await flushPendingIce(peer);
          } else if (signal.signal_type === "ice") {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (peer.remoteDescription) await peer.addIceCandidate(candidate);
            else pendingIceRef.current.push(candidate);
          }
        } catch (error) {
          setPermissionError(error instanceof Error ? error.message : "No se pudo establecer la conexión de audio.");
        }
      }
    };
    process();
  }, [signalsQuery.data, joined, activeRoomId, role]);

  useEffect(() => {
    if (!joined || !activeRoomId) return;
    const collect = async () => {
      const peer = peerRef.current;
      if (!peer || peer.connectionState === "closed") return;
      const stats = await peer.getStats();
      let roundTripMs: number | null = null;
      let jitterMs: number | null = null;
      let packetsLost: number | null = null;
      let bitrateKbps: number | null = null;
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.currentRoundTripTime != null) roundTripMs = Math.round(report.currentRoundTripTime * 1000);
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          jitterMs = report.jitter != null ? Math.round(report.jitter * 1000) : null;
          packetsLost = report.packetsLost ?? null;
          if (report.bytesReceived != null) {
            const previous = previousBytesRef.current;
            if (previous && report.timestamp > previous.timestamp) bitrateKbps = Math.max(0, Math.round((((report.bytesReceived - previous.bytes) * 8) / (report.timestamp - previous.timestamp)) * 100) / 100);
            previousBytesRef.current = { bytes: report.bytesReceived, timestamp: report.timestamp };
          }
        }
      });
      const quality = classifyQuality(peer.connectionState, roundTripMs, jitterMs, packetsLost);
      const metrics = { quality, roundTripMs, jitterMs, packetsLost, bitrateKbps };
      setQualityMetrics(metrics);
      reportQuality.mutate({ roomId: activeRoomId, quality, connectionState: peer.connectionState, roundTripMs, jitterMs, packetsLost, bitrateKbps });
    };
    collect().catch(() => undefined);
    const timer = setInterval(() => collect().catch(() => undefined), 10_000);
    return () => clearInterval(timer);
  }, [joined, activeRoomId]);

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const leave = async () => {
    const roomId = activeRoomId ?? room?.id;
    closeMedia();
    setJoined(false);
    setActiveRoomId(null);
    setMuted(false);
    setReconnectCount(0);
    if (roomId) await endRoom.mutateAsync({ roomId });
  };

  const otherJoined = role === "driver" ? Boolean(room?.passenger_joined_at) : Boolean(room?.driver_joined_at);
  const connected = connectionState === "connected";
  const failed = connectionState === "failed" || connectionState === "disconnected";
  const busy = openRoom.isPending || joinRoom.isPending || endRoom.isPending;
  const qualityLabel = qualityMetrics.quality === "excellent" ? "Calidad excelente" : qualityMetrics.quality === "good" ? "Calidad aceptable" : qualityMetrics.quality === "poor" ? "Red inestable" : "Sin conexión";
  const QualityIcon = qualityMetrics.quality === "excellent" ? SignalHigh : qualityMetrics.quality === "good" ? SignalMedium : SignalLow;

  return <div className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
    <audio ref={remoteAudioRef} autoPlay playsInline />
    <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700"><Radio className="h-5 w-5" /></span><div><p className="font-black text-emerald-950">Llamada privada del viaje</p><p className="text-xs font-bold text-emerald-700">Audio WebRTC protegido, supervisado y con reconexión automática.</p></div></div>
    {!joined ? <Button onClick={enter} disabled={busy} className="mt-3 h-12 w-full rounded-2xl bg-emerald-600 font-black text-white">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mic className="mr-2 h-5 w-5" />}Entrar en la llamada</Button> : <div className="mt-3 space-y-2"><p className="flex items-center justify-center rounded-2xl bg-white p-3 text-center text-sm font-black text-emerald-800">{connected ? <Wifi className="mr-2 h-4 w-4" /> : failed ? <WifiOff className="mr-2 h-4 w-4 text-red-600" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{connected ? "Audio conectado" : reconnecting ? "Reconectando automáticamente…" : failed ? "Conexión interrumpida" : otherJoined ? "Conectando el audio…" : "Esperando a la otra persona…"}</p>{connected && <div className={`rounded-2xl border p-3 ${qualityMetrics.quality === "poor" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-100 bg-white text-emerald-800"}`}><p className="flex items-center text-sm font-black"><QualityIcon className="mr-2 h-4 w-4" />{qualityLabel}</p><p className="mt-1 text-[11px] font-bold">{qualityMetrics.roundTripMs != null ? `${qualityMetrics.roundTripMs} ms` : "Midiendo latencia"}{qualityMetrics.jitterMs != null ? ` · Variación ${qualityMetrics.jitterMs} ms` : ""}{qualityMetrics.quality === "poor" ? " · Mantén la app abierta y busca mejor cobertura." : ""}</p></div>}<div className="grid grid-cols-2 gap-2"><Button onClick={toggleMute} variant="outline" className="h-12 rounded-2xl font-black">{muted ? <MicOff className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}{muted ? "Activar" : "Silenciar"}</Button><Button onClick={leave} disabled={busy} className="h-12 rounded-2xl bg-red-600 font-black text-white"><PhoneOff className="mr-2 h-5 w-5" />Colgar</Button></div>{failed && <Button onClick={reconnect} disabled={reconnecting} variant="outline" className="h-11 w-full rounded-2xl font-black"><RefreshCw className={`mr-2 h-4 w-4 ${reconnecting ? "animate-spin" : ""}`} />Reintentar conexión</Button>}</div>}
    {(permissionError || sendSignal.error || signalsQuery.error) && <p className="mt-2 text-xs font-bold text-red-600">{permissionError || sendSignal.error?.message || signalsQuery.error?.message}</p>}
    {joined && <p className="mt-2 flex items-center text-[11px] font-bold text-emerald-700"><ShieldCheck className="mr-1 h-3.5 w-3.5" />{iceConfigQuery.data?.turnEnabled ? "TURN de respaldo disponible" : "Conexión directa STUN"}{reconnectCount > 0 ? ` · Reconexiones: ${reconnectCount}` : ""}</p>}
    <p className="mt-3 text-[11px] font-bold text-emerald-700">La app mide la calidad técnica sin grabar ni almacenar el contenido de la conversación.</p>
  </div>;
}
