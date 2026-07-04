import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Car,
  CheckCircle2,
  Clock3,
  Euro,
  Gauge,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  PauseCircle,
  Phone,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
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
  rating?: number | string | null;
};

type ActivityRow = { id: string; message: string; created_at: string };

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;
const dateLabel = (value: unknown) => {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

const clearGuest = () => {
  try {
    localStorage.removeItem("taximun_guest_role");
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.setItem("taximun_real_auth", "1");
  } catch {}
};

function statusBadge(status: DriverStatus | RideStatus | undefined | null) {
  if (status === "available") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Online</Badge>;
  if (status === "busy") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En servicio</Badge>;
  if (status === "offline") return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Offline</Badge>;
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Nueva</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Aceptada</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizada</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelada</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazada</Badge>;
}

export default function DriverPanelModern() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [taxiCode, setTaxiCode] = useState("TX-001");
  const [plate, setPlate] = useState("0000-TXM");
  const [zone, setZone] = useState("Centro");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      try {
        clearGuest();
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

  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 6000 });
  const pendingQuery = trpc.system.taxiOps.driver.getPendingRides.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });
  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });
  const historyQuery = trpc.system.taxiOps.driver.getRideHistory.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 10000 });
  const activityQuery = trpc.system.taxiOps.activity.useQuery(undefined, { enabled: sessionOk, retry: false, refetchInterval: 10000 });

  const invalidate = () => {
    utils.system.taxiOps.driver.getStatus.invalidate();
    utils.system.taxiOps.driver.getPendingRides.invalidate();
    utils.system.taxiOps.driver.getActiveRide.invalidate();
    utils.system.taxiOps.driver.getRideHistory.invalidate();
    utils.system.taxiOps.activity.invalidate();
  };

  const upsertStatus = trpc.system.taxiOps.driver.upsertStatus.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const acceptRide = trpc.system.taxiOps.driver.acceptRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const startRide = trpc.system.taxiOps.driver.startRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const rejectRide = trpc.system.taxiOps.driver.rejectRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const completeRide = trpc.system.taxiOps.driver.completeRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });

  const live = (statusQuery.data ?? null) as DriverStatusRow | null;
  const pending = (pendingQuery.data ?? []) as TaxiRideRow[];
  const active = (activeQuery.data ?? null) as TaxiRideRow | null;
  const history = (historyQuery.data ?? []) as TaxiRideRow[];
  const activity = (activityQuery.data ?? []) as ActivityRow[];
  const saving = upsertStatus.isPending || acceptRide.isPending || startRide.isPending || rejectRide.isPending || completeRide.isPending;
  const currentStatus = live?.status ?? "offline";
  const locationLabel = useMemo(() => userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : "Ubicación no disponible", [userLocation]);

  useEffect(() => {
    if (!live) return;
    setTaxiCode(live.taxi_code ?? "TX-001");
    setPlate(live.plate ?? "0000-TXM");
    setZone(live.current_zone ?? "Centro");
  }, [live]);

  const setDriverStatus = async (status: DriverStatus) => {
    await upsertStatus.mutateAsync({
      status,
      taxiCode,
      plate,
      currentZone: zone,
      currentLat: userLocation?.latitude,
      currentLng: userLocation?.longitude,
    });
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

  if (checking) return <FullScreenMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Preparando turno" text="Comprobando sesión real..." />;
  if (!sessionOk) return <FullScreenMessage icon={<ShieldCheck className="h-6 w-6" />} title="Inicia sesión" text="Para trabajar como conductor debes entrar con una cuenta real." action={<Button onClick={() => setLocation("/auth")} className="rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>} />;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <section className="relative min-h-[42vh] overflow-hidden bg-slate-900">
        <div className="absolute inset-0 opacity-95"><TaxiMap userLocation={userLocation || undefined} readOnly /></div>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-slate-950/85 to-transparent px-4 py-4 text-white">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun Driver</p>
            <h1 className="text-2xl font-black">Tu turno</h1>
          </div>
          <Button onClick={logout} variant="outline" className="rounded-2xl border-white/20 bg-white/15 font-black text-white hover:bg-white/25"><LogOut className="mr-2 h-4 w-4" />Salir</Button>
        </div>
        <div className="absolute bottom-6 left-4 right-4 z-10 rounded-[1.75rem] bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-500">Estado actual</p>
              <h2 className="text-2xl font-black">{currentStatus === "available" ? "Online" : currentStatus === "busy" ? "En servicio" : "Offline"}</h2>
            </div>
            {statusBadge(currentStatus)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button onClick={() => setDriverStatus("available")} disabled={saving} className="rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><Radio className="mr-1 h-4 w-4" />Online</Button>
            <Button onClick={() => setDriverStatus("busy")} disabled={saving} className="rounded-2xl bg-blue-600 font-black text-white hover:bg-blue-500"><Car className="mr-1 h-4 w-4" />Ocupado</Button>
            <Button onClick={() => setDriverStatus("offline")} disabled={saving} variant="outline" className="rounded-2xl bg-white font-black"><PauseCircle className="mr-1 h-4 w-4" />Pausa</Button>
          </div>
        </div>
      </section>

      <section className="relative z-20 rounded-t-[2rem] bg-[#f7f8fb] px-4 pb-8 pt-4 shadow-[0_-24px_80px_rgba(15,23,42,0.35)]">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />
          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
          {(pendingQuery.error || activeQuery.error || statusQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{pendingQuery.error?.message || activeQuery.error?.message || statusQuery.error?.message}</div>}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric icon={<Euro className="h-4 w-4" />} title="Ganancias" value={money(live?.total_earnings)} />
            <Metric icon={<Route className="h-4 w-4" />} title="Viajes" value={String(Number(live?.total_rides ?? 0))} />
            <Metric icon={<Bell className="h-4 w-4" />} title="Solicitudes" value={String(pending.length)} />
            <Metric icon={<Star className="h-4 w-4" />} title="Rating" value={Number(live?.rating ?? 5).toFixed(1).replace(".", ",")} />
          </div>

          <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Datos del taxi</h2><Sparkles className="h-5 w-5 text-cyan-600" /></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={taxiCode} onChange={(e) => setTaxiCode(e.target.value)} className="h-12 rounded-2xl bg-slate-50 font-bold" placeholder="Código taxi" />
                <Input value={plate} onChange={(e) => setPlate(e.target.value)} className="h-12 rounded-2xl bg-slate-50 font-bold" placeholder="Matrícula" />
                <Input value={zone} onChange={(e) => setZone(e.target.value)} className="h-12 rounded-2xl bg-slate-50 font-bold" placeholder="Zona" />
              </div>
              <Button onClick={() => setDriverStatus(currentStatus)} disabled={saving} className="h-12 w-full rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">Guardar perfil operativo</Button>
            </CardContent>
          </Card>

          {active ? (
            <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-500">Servicio activo</p><h2 className="text-2xl font-black">{active.status === "assigned" ? "Ir a recogida" : "Viaje en curso"}</h2></div>{statusBadge(active.status)}</div>
                <RideDetails ride={active} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {active.status === "assigned" && <Button onClick={() => startRide.mutate({ rideId: active.id })} disabled={saving} className="h-13 rounded-3xl bg-blue-600 font-black text-white hover:bg-blue-500"><Navigation className="mr-2 h-5 w-5" />Iniciar viaje</Button>}
                  <Button onClick={() => completeRide.mutate({ rideId: active.id })} disabled={saving} className="h-13 rounded-3xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><CheckCircle2 className="mr-2 h-5 w-5" />Finalizar</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Solicitudes cercanas</h2><Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{pending.length} nuevas</Badge></div>
                {pending.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">No hay solicitudes pendientes ahora.</p>}
                <div className="grid gap-3 lg:grid-cols-2">
                  {pending.map((ride) => <RideRequest key={ride.id} ride={ride} saving={saving} onAccept={() => acceptRide.mutate({ rideId: ride.id, taxiCode, plate })} onReject={() => rejectRide.mutate({ rideId: ride.id })} />)}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-[1.75rem] border-white bg-white shadow-lg"><CardContent className="p-4"><h2 className="mb-3 font-black">Seguridad</h2><div className="grid grid-cols-3 gap-2"><Action icon={<Phone className="h-4 w-4" />} title="Llamar" /><Action icon={<ShieldCheck className="h-4 w-4" />} title="SOS" /><Action icon={<Gauge className="h-4 w-4" />} title="Ruta" /></div></CardContent></Card>
            <Card className="rounded-[1.75rem] border-white bg-white shadow-lg"><CardContent className="p-4"><h2 className="mb-3 font-black">Actividad</h2><div className="space-y-2">{activity.length === 0 && <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Sin actividad.</p>}{activity.slice(0, 3).map((item) => <p key={item.id} className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{item.message} · {dateLabel(item.created_at)}</p>)}</div></CardContent></Card>
          </div>

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg"><CardContent className="p-4"><h2 className="mb-3 font-black">Historial</h2><div className="grid gap-3 md:grid-cols-2">{history.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500 md:col-span-2">Sin historial todavía.</p>}{history.slice(0, 6).map((ride) => <HistoryItem key={ride.id} ride={ride} />)}</div></CardContent></Card>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) { return <div className="rounded-3xl bg-white p-3 text-center shadow-lg"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">{icon}</div><p className="text-xs font-bold text-slate-400">{title}</p><p className="text-xl font-black">{value}</p></div>; }
function Action({ icon, title }: { icon: ReactNode; title: string }) { return <button className="rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700 active:scale-95"><span className="mx-auto mb-1 flex justify-center text-cyan-600">{icon}</span>{title}</button>; }
function RideDetails({ ride }: { ride: TaxiRideRow }) { return <div className="space-y-3"><div className="rounded-3xl bg-slate-50 p-4"><p className="text-sm font-black"><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p><p className="mt-2 text-sm font-black"><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p></div><div className="grid grid-cols-3 gap-2"><Metric icon={<Euro className="h-4 w-4" />} title="Precio" value={money(ride.estimated_fare)} /><Metric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} /><Metric icon={<Route className="h-4 w-4" />} title="Km" value={`${ride.distance_km} km`} /></div></div>; }
function RideRequest({ ride, saving, onAccept, onReject }: { ride: TaxiRideRow; saving: boolean; onAccept: () => void; onReject: () => void }) { return <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="font-black">{ride.passenger_name ?? "Pasajero"}</p><p className="text-xs font-bold text-slate-500">{dateLabel(ride.requested_at)}</p></div>{statusBadge(ride.status)}</div><RideDetails ride={ride} /><div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={onAccept} disabled={saving} className="h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><CheckCircle2 className="mr-2 h-4 w-4" />Aceptar</Button><Button onClick={onReject} disabled={saving} variant="outline" className="h-12 rounded-2xl border-red-200 bg-white font-black text-red-700"><XCircle className="mr-2 h-4 w-4" />Rechazar</Button></div></div>; }
function HistoryItem({ ride }: { ride: TaxiRideRow }) { return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-black">{ride.dropoff_address}</p>{statusBadge(ride.status)}</div><p className="mt-1 text-xs font-bold text-slate-500">{dateLabel(ride.requested_at)} · {money(ride.estimated_fare)}</p></div>; }
function FullScreenMessage({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-sm rounded-3xl"><CardContent className="space-y-4 p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600">{icon}</div><h1 className="text-2xl font-black">{title}</h1><p className="text-sm font-semibold text-slate-500">{text}</p>{action}</CardContent></Card></main>; }
