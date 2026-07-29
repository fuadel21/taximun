import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TAXIMUN_MARKETS } from "@shared/constants";
import {
  AlertCircle,
  Bell,
  Car,
  CheckCircle2,
  Clock3,
  Euro,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  PauseCircle,
  Radio,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
} from "lucide-react";

type DriverStatus = "available" | "busy" | "offline";
type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type TaxiRideRow = {
  id: string;
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  status: RideStatus;
  requested_at?: string | null;
};

type DriverStatusRow = {
  status?: DriverStatus | null;
  taxi_code?: string | null;
  plate?: string | null;
  current_zone?: string | null;
  total_earnings?: number | string | null;
  total_rides?: number | string | null;
};

type DriverOperationState = {
  canOperate: boolean;
  message: string;
  verificationStatus: string;
};

type ActivityRow = { id: string; message: string; created_at: string };

const market = TAXIMUN_MARKETS.barcelona;
const invalidMarkers = new Set(["TX-000", "SIN-MAT", "AMB-0001", "0000-TXM"]);
const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

const dateLabel = (value: unknown) => {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

function statusBadge(status: DriverStatus | RideStatus | undefined | null) {
  if (status === "available") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Online</Badge>;
  if (status === "busy") return <Badge className="bg-black text-white hover:bg-black">En servicio</Badge>;
  if (status === "offline") return <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">Offline</Badge>;
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Nueva</Badge>;
  if (status === "assigned") return <Badge className="bg-black text-white hover:bg-black">Aceptada</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizada</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelada</Badge>;
  return <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">Rechazada</Badge>;
}

export default function DriverPanelModern() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [taxiCode, setTaxiCode] = useState("");
  const [plate, setPlate] = useState("");
  const [zone, setZone] = useState(market.zones[0].name);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      try {
        localStorage.removeItem("taximun_guest_role");
        localStorage.removeItem("manus-runtime-user-info");
        localStorage.setItem("taximun_real_auth", "1");
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const role = data.session.user.user_metadata?.role;
        if (role !== "driver" && role !== "admin") {
          const { error: updateError } = await supabase.auth.updateUser({ data: { role: "driver" } });
          if (updateError) throw updateError;
          await supabase.auth.refreshSession();
        }
        if (!cancelled) setSessionOk(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo preparar la sesión.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    prepare();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setUserLocation(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const operationQuery = trpc.system.taxiOps.driver.getOperationalStatus.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 10000 });
  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 6000 });
  const pendingQuery = trpc.system.taxiOps.driver.getPendingRides.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });
  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });
  const historyQuery = trpc.system.taxiOps.driver.getRideHistory.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 10000 });
  const activityQuery = trpc.system.taxiOps.activity.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 10000 });

  const invalidate = async () => {
    await Promise.all([
      utils.system.taxiOps.driver.getOperationalStatus.invalidate(),
      utils.system.taxiOps.driver.getStatus.invalidate(),
      utils.system.taxiOps.driver.getPendingRides.invalidate(),
      utils.system.taxiOps.driver.getActiveRide.invalidate(),
      utils.system.taxiOps.driver.getRideHistory.invalidate(),
      utils.system.taxiOps.activity.invalidate(),
    ]);
  };

  const upsertStatus = trpc.system.taxiOps.driver.upsertStatus.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const acceptRide = trpc.system.taxiOps.driver.acceptRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const rejectRide = trpc.system.taxiOps.driver.rejectRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });

  const operation = (operationQuery.data ?? null) as DriverOperationState | null;
  const live = (statusQuery.data ?? null) as DriverStatusRow | null;
  const pending = (pendingQuery.data ?? []) as TaxiRideRow[];
  const active = (activeQuery.data ?? null) as TaxiRideRow | null;
  const history = (historyQuery.data ?? []) as TaxiRideRow[];
  const activity = (activityQuery.data ?? []) as ActivityRow[];
  const canOperate = Boolean(operation?.canOperate);
  const currentStatus = live?.status ?? "offline";
  const saving = upsertStatus.isPending || acceptRide.isPending || rejectRide.isPending;

  useEffect(() => {
    if (!live) return;
    setTaxiCode(live.taxi_code ?? "");
    setPlate(live.plate ?? "");
    setZone(live.current_zone ?? market.zones[0].name);
  }, [live]);

  const normalizedTaxiCode = taxiCode.trim().toUpperCase();
  const normalizedPlate = plate.trim().toUpperCase();
  const validIdentity =
    normalizedTaxiCode.length >= 2 &&
    normalizedPlate.length >= 2 &&
    zone.trim().length >= 2 &&
    !invalidMarkers.has(normalizedTaxiCode) &&
    !invalidMarkers.has(normalizedPlate);

  const setDriverStatus = async (status: DriverStatus) => {
    setError("");
    if (!validIdentity) {
      setError("Completa un código de taxi y una matrícula reales antes de guardar o ponerte Online.");
      return;
    }
    if (status !== "offline" && !canOperate) {
      setError(operation?.message || "Tu cuenta de conductor todavía no está verificada.");
      return;
    }
    await upsertStatus.mutateAsync({
      status,
      taxiCode: normalizedTaxiCode,
      plate: normalizedPlate,
      currentZone: zone.trim(),
      currentLat: userLocation?.latitude,
      currentLng: userLocation?.longitude,
    });
  };

  const accept = (rideId: string) => {
    setError("");
    if (!validIdentity) {
      setError("Completa la identidad operativa antes de aceptar servicios.");
      return;
    }
    acceptRide.mutate({ rideId, taxiCode: normalizedTaxiCode, plate: normalizedPlate });
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("taximun_real_auth");
      localStorage.removeItem("taximun_guest_role");
      localStorage.removeItem("manus-runtime-user-info");
    } catch {}
    window.location.href = "/auth";
  };

  const locationLabel = useMemo(
    () => userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : "Ubicación no disponible",
    [userLocation]
  );

  if (checking) return <FullScreenMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Preparando turno" text="Comprobando sesión real..." />;
  if (!sessionOk) return <FullScreenMessage icon={<ShieldCheck className="h-6 w-6" />} title="Inicia sesión" text="Para trabajar como conductor debes entrar con una cuenta real." action={<Button onClick={() => setLocation("/auth")} className="h-14 rounded-2xl bg-black font-black text-white">Ir al login</Button>} />;

  return (
    <main className="min-h-screen bg-black text-black">
      <section className="relative min-h-[42vh] overflow-hidden bg-zinc-900">
        <div className="absolute inset-0 opacity-95"><TaxiMap userLocation={userLocation || undefined} readOnly /></div>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/85 to-transparent px-4 py-4 text-white">
          <div><p className="text-sm font-black text-white/60">{market.launchLabel}</p><h1 className="text-2xl font-black">Consola Taximun Driver</h1><p className="mt-1 text-xs font-semibold text-white/70">{locationLabel}</p></div>
          <Button onClick={logout} variant="outline" className="h-12 rounded-2xl border-white/20 bg-white/15 font-black text-white hover:bg-white/25"><LogOut className="mr-2 h-4 w-4" />Salir</Button>
        </div>
        <div className="absolute bottom-6 left-4 right-4 z-10 rounded-[2rem] bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-zinc-500">Estado actual</p><h2 className="text-2xl font-black">{currentStatus === "available" ? "Online" : currentStatus === "busy" ? "En servicio" : "Offline"}</h2></div>{statusBadge(currentStatus)}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button onClick={() => setDriverStatus("available")} disabled={saving || operationQuery.isLoading || !canOperate || !validIdentity} className="h-14 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><Radio className="mr-1 h-4 w-4" />Online</Button>
            <Button onClick={() => setDriverStatus("busy")} disabled={saving || operationQuery.isLoading || !canOperate || !validIdentity} className="h-14 rounded-2xl bg-black font-black text-white hover:bg-black/85"><Car className="mr-1 h-4 w-4" />Ocupado</Button>
            <Button onClick={() => setDriverStatus("offline")} disabled={saving || !validIdentity} variant="outline" className="h-14 rounded-2xl bg-white font-black"><PauseCircle className="mr-1 h-4 w-4" />Pausa</Button>
          </div>
        </div>
      </section>

      <section className="relative z-20 rounded-t-[2rem] bg-[#f3f3f3] px-4 pb-8 pt-4 shadow-[0_-24px_80px_rgba(0,0,0,0.35)]">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-zinc-300" />
          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />{error}</div>}
          {(pendingQuery.error || activeQuery.error || statusQuery.error || operationQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{pendingQuery.error?.message || activeQuery.error?.message || statusQuery.error?.message || operationQuery.error?.message}</div>}

          {!operationQuery.isLoading && !canOperate && (
            <Card className="rounded-[2rem] border-amber-200 bg-amber-50 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-amber-950">Conductor no autorizado todavía</h2><p className="mt-1 text-sm font-bold text-amber-800">{operation?.message || "Completa tu perfil y envía la documentación para revisión."}</p></div><Button onClick={() => setLocation("/driver/profile")} className="h-14 rounded-2xl bg-black font-black text-white"><UserCheck className="mr-2 h-5 w-5" />Completar verificación</Button></CardContent></Card>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric icon={<Euro className="h-4 w-4" />} title="Ganancias" value={money(live?.total_earnings)} />
            <Metric icon={<Route className="h-4 w-4" />} title="Viajes" value={String(Number(live?.total_rides ?? 0))} />
            <Metric icon={<Bell className="h-4 w-4" />} title="Solicitudes" value={String(canOperate ? pending.length : 0)} />
            <Metric icon={<ShieldCheck className="h-4 w-4" />} title="Verificación" value={canOperate ? "Correcta" : "Pendiente"} />
          </div>

          <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Identidad operativa</h2><p className="text-sm font-semibold text-zinc-500">Solo datos reales del taxi que trabaja ahora.</p></div><Sparkles className="h-6 w-6" /></div><div className="grid gap-3 sm:grid-cols-3"><Input value={taxiCode} onChange={(e) => setTaxiCode(e.target.value)} className="h-14 rounded-2xl bg-zinc-100 font-bold uppercase" placeholder="Código o licencia real" /><Input value={plate} onChange={(e) => setPlate(e.target.value)} className="h-14 rounded-2xl bg-zinc-100 font-bold uppercase" placeholder="Matrícula real" /><Input value={zone} onChange={(e) => setZone(e.target.value)} className="h-14 rounded-2xl bg-zinc-100 font-bold" placeholder="Zona" /></div><div className="flex snap-x gap-2 overflow-x-auto pb-1">{market.zones.map((item) => <button key={item.id} type="button" onClick={() => setZone(item.name)} className={`min-h-12 shrink-0 snap-start rounded-2xl border px-4 text-sm font-black ${zone === item.name ? "border-black bg-black text-white" : "border-zinc-200 bg-zinc-100 text-zinc-700"}`}>{item.name}</button>)}</div><p className="rounded-3xl bg-amber-50 p-4 text-sm font-bold text-amber-800">{market.complianceNote}</p><Button onClick={() => setDriverStatus(currentStatus)} disabled={saving || !validIdentity || (currentStatus !== "offline" && !canOperate)} className="h-14 w-full rounded-2xl bg-black text-base font-black text-white">Guardar perfil operativo</Button></CardContent></Card>

          {active ? (
            <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-zinc-500">Servicio activo</p><h2 className="text-2xl font-black">{active.status === "assigned" ? "Dirígete a la recogida" : "Viaje en curso"}</h2></div>{statusBadge(active.status)}</div><RideDetails ride={active} /><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => setLocation("/driver/navigation")} className="h-14 rounded-2xl bg-black font-black text-white"><Navigation className="mr-2 h-5 w-5" />Navegación y PIN</Button><Button onClick={() => setLocation("/driver/queue")} variant="outline" className="h-14 rounded-2xl bg-white font-black"><ReceiptText className="mr-2 h-5 w-5" />Cierre profesional</Button></div><p className="rounded-3xl bg-zinc-100 p-4 text-sm font-semibold text-zinc-600">El viaje no se inicia ni finaliza desde este panel. Usa Navegación para llegada y PIN, y Servicios para el cierre profesional.</p></CardContent></Card>
          ) : (
            <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Solicitudes cercanas</h2><p className="text-sm font-semibold text-zinc-500">Prioridad por zona: {zone}</p></div><Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{canOperate ? pending.length : 0} nuevas</Badge></div>{!canOperate && <p className="rounded-3xl bg-zinc-100 p-5 text-center text-sm font-bold text-zinc-500">Las solicitudes aparecerán cuando tu cuenta esté verificada.</p>}{canOperate && pending.length === 0 && <p className="rounded-3xl bg-zinc-100 p-5 text-center text-sm font-bold text-zinc-500">No hay solicitudes pendientes ahora.</p>}<div className="grid gap-3 lg:grid-cols-2">{canOperate && pending.map((ride) => <RideRequest key={ride.id} ride={ride} saving={saving} canAccept={validIdentity} onAccept={() => accept(ride.id)} onReject={() => rejectRide.mutate({ rideId: ride.id })} />)}</div></CardContent></Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2"><Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="p-5"><h2 className="mb-3 font-black">Actividad</h2><div className="space-y-2">{activity.length === 0 && <p className="rounded-2xl bg-zinc-100 p-3 text-sm font-bold text-zinc-500">Sin actividad.</p>}{activity.slice(0, 4).map((item) => <p key={item.id} className="rounded-2xl bg-zinc-100 p-3 text-sm font-bold text-zinc-700">{item.message} · {dateLabel(item.created_at)}</p>)}</div></CardContent></Card><Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="p-5"><h2 className="mb-3 font-black">Historial</h2><div className="space-y-2">{history.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 text-center text-sm font-bold text-zinc-500">Sin historial todavía.</p>}{history.slice(0, 4).map((ride) => <HistoryItem key={ride.id} ride={ride} />)}</div></CardContent></Card></div>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="rounded-3xl bg-white p-3 text-center shadow-sm"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100">{icon}</div><p className="text-xs font-bold text-zinc-400">{title}</p><p className="text-xl font-black">{value}</p></div>;
}

function RideDetails({ ride }: { ride: TaxiRideRow }) {
  return <div className="space-y-3"><div className="rounded-3xl bg-zinc-100 p-4"><p className="text-sm font-black"><MapPin className="mr-2 inline h-4 w-4" />{ride.pickup_address}</p><p className="mt-2 text-sm font-black"><Navigation className="mr-2 inline h-4 w-4" />{ride.dropoff_address}</p></div><div className="grid grid-cols-3 gap-2"><Metric icon={<Euro className="h-4 w-4" />} title="Precio" value={money(ride.estimated_fare)} /><Metric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} /><Metric icon={<Route className="h-4 w-4" />} title="Km" value={`${ride.distance_km} km`} /></div></div>;
}

function RideRequest({ ride, saving, canAccept, onAccept, onReject }: { ride: TaxiRideRow; saving: boolean; canAccept: boolean; onAccept: () => void; onReject: () => void }) {
  return <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="font-black">{ride.passenger_name ?? "Pasajero"}</p><p className="text-xs font-bold text-zinc-500">{dateLabel(ride.requested_at)}</p></div>{statusBadge(ride.status)}</div><RideDetails ride={ride} /><div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={onAccept} disabled={saving || !canAccept} className="h-14 rounded-2xl bg-black font-black text-white"><CheckCircle2 className="mr-2 h-5 w-5" />Aceptar</Button><Button onClick={onReject} disabled={saving} variant="outline" className="h-14 rounded-2xl border-red-200 bg-white font-black text-red-700"><XCircle className="mr-2 h-5 w-5" />Rechazar</Button></div></div>;
}

function HistoryItem({ ride }: { ride: TaxiRideRow }) {
  return <div className="rounded-2xl bg-zinc-100 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-black">{ride.dropoff_address}</p>{statusBadge(ride.status)}</div><p className="mt-1 text-xs font-bold text-zinc-500">{dateLabel(ride.requested_at)} · {money(ride.estimated_fare)}</p></div>;
}

function FullScreenMessage({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4"><Card className="w-full max-w-sm rounded-3xl"><CardContent className="space-y-4 p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-zinc-100">{icon}</div><h1 className="text-2xl font-black">{title}</h1><p className="text-sm font-semibold text-zinc-500">{text}</p>{action}</CardContent></Card></main>;
}
