import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Loader2, LocateFixed, Radio } from "lucide-react";

type DriverStatus = "available" | "busy" | "offline";

type DriverStatusRow = {
  status?: DriverStatus | null;
  taxi_code?: string | null;
  plate?: string | null;
  current_zone?: string | null;
  updated_at?: string | null;
};

type DriverOperationState = {
  canOperate: boolean;
  message: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
};

const HEARTBEAT_MS = 20000;
const MIN_MOVE_METERS = 15;

function distanceMeters(a: Coordinates, b: Coordinates) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function timeLabel(value?: string | null) {
  if (!value) return "Sin sincronizar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin sincronizar";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function DriverGpsHeartbeat() {
  const utils = trpc.useUtils();
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const lastSentCoordsRef = useRef<Coordinates | null>(null);
  const sendingRef = useRef(false);

  const operationQuery = trpc.system.taxiOps.driver.getOperationalStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });
  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
  });
  const upsertStatus = trpc.system.taxiOps.driver.upsertStatus.useMutation({
    onSuccess: async (data) => {
      setLastSentAt(data?.updated_at || new Date().toISOString());
      await utils.system.taxiOps.driver.getStatus.invalidate();
    },
  });

  const operation = (operationQuery.data ?? null) as DriverOperationState | null;
  const live = (statusQuery.data ?? null) as DriverStatusRow | null;
  const status = live?.status ?? "offline";
  const shouldTrack = Boolean(operation?.canOperate && (status === "available" || status === "busy"));

  useEffect(() => {
    if (!shouldTrack || !navigator.geolocation) {
      if (!navigator.geolocation) setGpsError("Este dispositivo no permite compartir ubicación GPS.");
      return;
    }

    setGpsError("");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: Date.now(),
        });
      },
      (error) => {
        setGpsError(error.code === error.PERMISSION_DENIED
          ? "Permiso de ubicación bloqueado. Actívalo para recibir servicios y mostrar tu llegada."
          : "No se pudo actualizar la ubicación del conductor.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [shouldTrack]);

  useEffect(() => {
    if (!shouldTrack || !coords || !live || sendingRef.current) return;

    const send = async (force = false) => {
      if (sendingRef.current) return;
      const previous = lastSentCoordsRef.current;
      const movedEnough = !previous || distanceMeters(previous, coords) >= MIN_MOVE_METERS;
      const oldEnough = !previous || coords.capturedAt - previous.capturedAt >= HEARTBEAT_MS;
      if (!force && !movedEnough && !oldEnough) return;

      sendingRef.current = true;
      try {
        await upsertStatus.mutateAsync({
          status,
          taxiCode: live.taxi_code || "TX-000",
          plate: live.plate || "SIN-MAT",
          currentZone: live.current_zone || "Barcelona",
          currentLat: coords.latitude,
          currentLng: coords.longitude,
        });
        lastSentCoordsRef.current = coords;
      } finally {
        sendingRef.current = false;
      }
    };

    send(true);
    const timer = window.setInterval(() => send(false), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [coords, live, shouldTrack, status]);

  const state = useMemo(() => {
    if (!operation?.canOperate) return { tone: "amber", title: "GPS pausado", text: operation?.message || "Tu cuenta todavía no puede operar." };
    if (status === "offline") return { tone: "slate", title: "GPS en pausa", text: "Ponte Online para empezar a compartir tu ubicación." };
    if (gpsError) return { tone: "red", title: "GPS necesita atención", text: gpsError };
    if (!coords) return { tone: "cyan", title: "Buscando señal GPS", text: "Esperando una ubicación precisa del dispositivo." };
    if (upsertStatus.isPending) return { tone: "cyan", title: "Actualizando posición", text: "Enviando ubicación segura a Taximun." };
    return {
      tone: "emerald",
      title: "GPS en directo",
      text: `Precisión aproximada ${Math.round(coords.accuracy)} m · última sincronización ${timeLabel(lastSentAt || live?.updated_at)}`,
    };
  }, [operation, status, gpsError, coords, upsertStatus.isPending, lastSentAt, live?.updated_at]);

  const classes = state.tone === "red"
    ? "border-red-200 bg-red-50 text-red-800"
    : state.tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : state.tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : state.tone === "cyan"
          ? "border-cyan-200 bg-cyan-50 text-cyan-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  const icon = state.tone === "red"
    ? <AlertTriangle className="h-5 w-5" />
    : state.tone === "emerald"
      ? <CheckCircle2 className="h-5 w-5" />
      : state.tone === "cyan"
        ? <Loader2 className="h-5 w-5 animate-spin" />
        : status === "offline"
          ? <Radio className="h-5 w-5" />
          : <LocateFixed className="h-5 w-5" />;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4">
      <div className={`flex items-start gap-3 rounded-3xl border p-4 shadow-sm ${classes}`}>
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <p className="font-black">{state.title}</p>
          <p className="mt-1 text-xs font-bold opacity-90">{state.text}</p>
        </div>
      </div>
    </section>
  );
}
