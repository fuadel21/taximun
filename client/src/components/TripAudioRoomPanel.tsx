import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Radio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Role = "driver" | "passenger";
type Room = { id: string; status: string; driver_joined_at?: string | null; passenger_joined_at?: string | null; started_at?: string | null };

export function TripAudioRoomPanel({ rideId, callRequestId, role }: { rideId: string; callRequestId: string; role: Role }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.system.taxiTripAudio.getLatest.useQuery({ rideId }, { refetchInterval: 2500 });
  const room = (query.data ?? null) as Room | null;
  const refresh = () => utils.system.taxiTripAudio.getLatest.invalidate({ rideId });
  const openRoom = trpc.system.taxiTripAudio.open.useMutation({ onSuccess: refresh });
  const joinRoom = trpc.system.taxiTripAudio.join.useMutation({ onSuccess: refresh });
  const endRoom = trpc.system.taxiTripAudio.end.useMutation({ onSuccess: refresh });

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const enter = async () => {
    setPermissionError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      let current = room;
      if (!current || ["ended", "expired"].includes(current.status)) current = await openRoom.mutateAsync({ rideId, callRequestId });
      await joinRoom.mutateAsync({ roomId: current.id });
      setJoined(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPermissionError(error instanceof Error ? error.message : "No se pudo activar el micrófono.");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const leave = async () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setJoined(false);
    if (room?.id) await endRoom.mutateAsync({ roomId: room.id });
  };

  const otherJoined = role === "driver" ? Boolean(room?.passenger_joined_at) : Boolean(room?.driver_joined_at);
  const busy = openRoom.isPending || joinRoom.isPending || endRoom.isPending;

  return <div className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
    <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700"><Radio className="h-5 w-5" /></span><div><p className="font-black text-emerald-950">Sala de audio privada</p><p className="text-xs font-bold text-emerald-700">Solo disponible para este viaje.</p></div></div>
    {!joined ? <Button onClick={enter} disabled={busy} className="mt-3 h-12 w-full rounded-2xl bg-emerald-600 font-black text-white">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mic className="mr-2 h-5 w-5" />}Entrar con micrófono</Button> : <div className="mt-3 space-y-2"><p className="rounded-2xl bg-white p-3 text-center text-sm font-black text-emerald-800">{otherJoined ? "Ambos participantes están en la sala" : "Esperando a la otra persona…"}</p><div className="grid grid-cols-2 gap-2"><Button onClick={toggleMute} variant="outline" className="h-12 rounded-2xl font-black">{muted ? <MicOff className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}{muted ? "Activar" : "Silenciar"}</Button><Button onClick={leave} disabled={busy} className="h-12 rounded-2xl bg-red-600 font-black text-white"><PhoneOff className="mr-2 h-5 w-5" />Colgar</Button></div></div>}
    {permissionError && <p className="mt-2 text-xs font-bold text-red-600">{permissionError}</p>}
    <p className="mt-3 text-[11px] font-bold text-emerald-700">El micrófono se apaga al salir. Esta fase añade sala, permisos y control de sesión; el transporte de audio entre móviles se conectará mediante WebRTC en el siguiente bloque.</p>
  </div>;
}