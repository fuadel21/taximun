import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PassengerTripTrackingMap, type TrackingPoint } from "@/components/PassengerTripTrackingMap";
import { TripChatPanel } from "@/components/TripChatPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  Euro,
  Loader2,
  LocateFixed,
  LockKeyhole,
  MapPin,
  Navigation,
  ReceiptText,
  Route,
  UserRound,
} from "lucide-react";

type ActiveRide = {
  id: string;
  status: "assigned" | "in_progress";
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number | string | null;
  pickup_lng?: number | string | null;
  dropoff_lat?: number | string | null;
  dropoff_lng?: number | string | null;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  driver_arrived_at?: string | null;
};

type DriverStatus = {
  current_lat?: number | string | null;
  current_lng?: number | string | null;
  updated_at?: string | null;
};

const NO_SHOW_WAIT_SECONDS = 300;
const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

function point(lat: unknown, lng: unknown): TrackingPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function openGoogleMaps(destination: TrackingPoint | null, address: string) {
  const value = destination ? `${destination.latitude},${destination.longitude}` : address;
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(value)}`, "_blank", "noopener,noreferrer");
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export default function DriverNavigationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [browserLocation, setBrowserLocation] = useState<TrackingPoint | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());

  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });
  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
  });
  const startRide = trpc.system.taxiTripLifecycle.startWithPin.useMutation({
    onSuccess: async () => {
      setActionError("");
      setPickupPin("");
      await activeQuery.refetch();
      await utils.system.taxiOps.driver.getStatus.invalidate();
    },
    onError: (error) => setActionError(error.message),
  });
  const markArrived = trpc.system.taxiLiveTrip.driver.markArrived.useMutation({
    onSuccess: async () => {
      setActionError("");
      setClockNow(Date.now());
      await activeQuery.refetch();
    },
    onError: (error) => setActionError(error.message),
  });
  const cancelPassengerNoShow = trpc.system.taxiTripLifecycle.cancelPassengerNoShow.useMutation({
    onSuccess: async () => {
      setActionError("");
      await activeQuery.refetch();
      await utils.system.taxiOps.driver.getStatus.invalidate();
      setLocation("/driver/queue");
    },
    onError: (error) => setActionError(error.message),
  });

  const active = (activeQuery.data ?? null) as ActiveRide | null;
  const status = (statusQuery.data ?? null) as DriverStatus | null;

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Este dispositivo no permite ubicación GPS.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setBrowserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGpsError("");
      },
      (error) => setGpsError(error.code === error.PERMISSION_DENIED
        ? "Activa el permiso de ubicación para usar la navegación Taximun."
        : "No se pudo actualizar tu posición GPS."),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!active?.driver_arrived_at || active.status !== "assigned") return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active?.driver_arrived_at, active?.status]);

  const pickup = active ? point(active.pickup_lat, active.pickup_lng) : null;
  const dropoff = active ? point(active.dropoff_lat, active.dropoff_lng) : null;
  const savedDriverLocation = point(status?.current_lat, status?.current_lng);
  const driver = browserLocation || savedDriverLocation;
  const target = active?.status === "assigned" ? pickup : dropoff;
  const targetAddress = active?.status === "assigned" ? active?.pickup_address : active?.dropoff_address;
  const mapReady = Boolean(pickup || dropoff || driver);
  const arrivedAtMs = active?.driver_arrived_at ? new Date(active.driver_arrived_at).getTime() : null;
  const waitedSeconds = arrivedAtMs && Number.isFinite(arrivedAtMs)
    ? Math.max(0, Math.floor((clockNow - arrivedAtMs) / 1000))
    : 0;
  const noShowSecondsRemaining = Math.max(0, NO_SHOW_WAIT_SECONDS - waitedSeconds);
  const canReportNoShow = Boolean(active?.status === "assigned" && active.driver_arrived_at && noShowSecondsRemaining === 0);

  const headline = useMemo(() => {
    if (!active) return "Sin viaje activo";
    if (active.status === "in_progress") return "Navega al destino";
    return active.driver_arrived_at ? "Verifica el PIN del pasajero" : "Navega a la recogida";
  }, [active]);

  if (activeQuery.isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb]"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></main>;
  }

  if (!active) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
        <Card className="mx-auto max-w-xl rounded-[1.75rem] border-white bg-white shadow-xl">
          <CardContent className="p-8 text-center">
            <Navigation className="mx-auto h-12 w-12 text-cyan-600" />
            <h1 className="mt-4 text-2xl font-black">Sin navegación activa</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">Acepta un servicio para ver la ruta hacia la recogida y el destino.</p>
            <Button onClick={() => setLocation("/driver/queue")} className="mt-5 rounded-2xl bg-slate-950 font-black text-white">Ver servicios</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const normalizedPin = pickupPin.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 4);

  const handleNoShow = () => {
    const confirmed = window.confirm(
      "¿Confirmas que el pasajero no se encuentra en el punto de recogida? Esta acción cancelará el servicio y quedará registrada."
    );
    if (!confirmed) return;
    cancelPassengerNoShow.mutate({ rideId: active.id });
  };

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Navegación Taximun</p>
              <h1 className="mt-1 text-3xl font-black">{headline}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-300"><UserRound className="mr-1 inline h-4 w-4" />{active.passenger_name || "Pasajero"}</p>
            </div>
            <Badge className={active.status === "in_progress" ? "bg-cyan-100 text-cyan-800 hover:bg-cyan-100" : active.driver_arrived_at ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-blue-100 text-blue-800 hover:bg-blue-100"}>
              {active.status === "in_progress" ? "En viaje" : active.driver_arrived_at ? "PIN pendiente" : "A recogida"}
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(active.estimated_fare)} dark />
            <Metric icon={<Clock3 className="h-4 w-4" />} title="Duración" value={`${active.estimated_duration} min`} dark />
            <Metric icon={<Route className="h-4 w-4" />} title="Trayecto" value={`${active.distance_km} km`} dark />
          </div>
        </section>

        {(gpsError || actionError || activeQuery.error || statusQuery.error) && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mr-2 inline h-4 w-4" />{gpsError || actionError || activeQuery.error?.message || statusQuery.error?.message}
          </div>
        )}

        {mapReady ? (
          <PassengerTripTrackingMap pickup={pickup} dropoff={dropoff} driver={driver} status={active.status} driverName="Mi taxi" />
        ) : (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
            <MapPin className="mr-2 inline h-4 w-4" />Este viaje no tiene coordenadas suficientes. Usa Google Maps con la dirección escrita.
          </div>
        )}

        <TripChatPanel rideId={active.id} role="driver" />

        <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
              <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{active.pickup_address}</p>
              <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{active.dropoff_address}</p>
            </div>

            {active.status === "assigned" && active.driver_arrived_at && (
              <>
                <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4">
                  <p className="font-black text-cyan-950"><LockKeyhole className="mr-2 inline h-5 w-5" />PIN de recogida</p>
                  <p className="mt-1 text-xs font-bold text-cyan-700">Pide al pasajero el código de cuatro caracteres que aparece en su pantalla.</p>
                  <Input
                    value={normalizedPin}
                    onChange={(event) => setPickupPin(event.target.value)}
                    maxLength={4}
                    autoCapitalize="characters"
                    className="mt-3 h-14 rounded-2xl bg-white text-center text-2xl font-black uppercase tracking-[0.35em]"
                    placeholder="----"
                  />
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-amber-950"><Clock3 className="mr-2 inline h-5 w-5" />Espera protegida</p>
                      <p className="mt-1 text-xs font-bold text-amber-800">
                        {canReportNoShow
                          ? "Ya puedes registrar la ausencia si el pasajero no aparece."
                          : "Debes esperar 5 minutos desde que marcaste tu llegada."}
                      </p>
                    </div>
                    <Badge className={canReportNoShow ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-white text-amber-900 hover:bg-white"}>
                      {canReportNoShow ? "Disponible" : formatCountdown(noShowSecondsRemaining)}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleNoShow}
                    disabled={!canReportNoShow || cancelPassengerNoShow.isPending}
                    className="mt-3 h-[48px] w-full rounded-2xl border-amber-300 bg-white font-black text-amber-900 hover:bg-amber-100"
                  >
                    {cancelPassengerNoShow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertCircle className="mr-2 h-4 w-4" />}
                    Pasajero ausente
                  </Button>
                </div>
              </>
            )}

            <div className="grid gap-2 sm:grid-cols-4">
              <Button onClick={() => openGoogleMaps(target, targetAddress || "")} variant="outline" className="h-[52px] rounded-2xl bg-white font-black">
                <Navigation className="mr-2 h-4 w-4" />Google Maps
              </Button>
              {active.status === "assigned" && !active.driver_arrived_at && (
                <Button onClick={() => markArrived.mutate({ rideId: active.id })} disabled={markArrived.isPending} className="h-[52px] rounded-2xl bg-amber-500 font-black text-slate-950 hover:bg-amber-400">
                  {markArrived.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}He llegado
                </Button>
              )}
              {active.status === "assigned" ? (
                <Button
                  onClick={() => startRide.mutate({ rideId: active.id, pickupPin: normalizedPin })}
                  disabled={startRide.isPending || !active.driver_arrived_at || normalizedPin.length !== 4}
                  className="h-[52px] rounded-2xl bg-blue-600 font-black text-white hover:bg-blue-500"
                >
                  {startRide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Verificar e iniciar
                </Button>
              ) : (
                <Button disabled className="h-[52px] rounded-2xl bg-cyan-600 font-black text-white"><Car className="mr-2 h-4 w-4" />Viaje en curso</Button>
              )}
              <Button onClick={() => setLocation("/driver/queue")} disabled={active.status !== "in_progress"} className="h-[52px] rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500">
                <ReceiptText className="mr-2 h-4 w-4" />Ir al cierre
              </Button>
            </div>

            <p className="rounded-2xl bg-cyan-50 p-3 text-xs font-bold text-cyan-800">
              <LocateFixed className="mr-1 inline h-4 w-4" />La posición se actualiza mientras esta pantalla está abierta y el heartbeat continúa sincronizando el GPS.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Metric({ icon, title, value, dark }: { icon: React.ReactNode; title: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${dark ? "bg-white/10 text-white" : "bg-slate-50"}`}>
      <div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full ${dark ? "bg-white/10 text-cyan-200" : "bg-white text-cyan-600"}`}>{icon}</div>
      <p className="text-xs font-bold text-slate-400">{title}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
