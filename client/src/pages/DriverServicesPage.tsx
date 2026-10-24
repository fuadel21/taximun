import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { RideOfferMiniMap } from "@/components/RideOfferMiniMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  Euro,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type Ride = {
  id: string;
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  payment_method?: string | null;
  service_type?: string | null;
  status: RideStatus;
  requested_at?: string | null;
};

type DriverStatus = {
  taxi_code?: string | null;
  plate?: string | null;
  status?: "available" | "busy" | "offline" | null;
  current_lat?: number | null;
  current_lng?: number | null;
};

type DriverOperationState = {
  canOperate: boolean;
  message: string;
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

function formatDate(value?: string | null) {
  if (!value) return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function serviceLabel(value?: string | null) {
  if (value === "eco") return "Eco";
  if (value === "van") return "Van";
  return "Taxi";
}

function paymentLabel(value?: string | null) {
  if (value === "card") return "Tarjeta";
  if (value === "bizum") return "Bizum";
  return "Efectivo";
}

function statusBadge(status: RideStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Nueva</Badge>;
  if (status === "assigned") return <Badge className="bg-zinc-900 text-white hover:bg-zinc-900">Aceptada</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizada</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelada</Badge>;
  return <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">Rechazada</Badge>;
}

function openMaps(destination: string) {
  const query = encodeURIComponent(destination);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, "_blank", "noopener,noreferrer");
}

export default function DriverServicesPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "taxi" | "eco" | "van">("all");

  const operationQuery = trpc.system.taxiOps.driver.getOperationalStatus.useQuery(undefined, { retry: false, refetchInterval: 10000 });
  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, { retry: false, refetchInterval: 6000 });
  const pendingQuery = trpc.system.taxiOps.driver.getPendingRides.useQuery(undefined, { retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });
  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, { retry: false, refetchInterval: 4000, refetchOnWindowFocus: true });

  const invalidate = async () => {
    await Promise.all([
      utils.system.taxiOps.driver.getPendingRides.invalidate(),
      utils.system.taxiOps.driver.getActiveRide.invalidate(),
      utils.system.taxiOps.driver.getStatus.invalidate(),
    ]);
  };

  const acceptRide = trpc.system.taxiOps.driver.acceptRide.useMutation({
    onSuccess: async () => {
      setError("");
      await invalidate();
    },
    onError: (err) => setError(err.message),
  });
  const rejectRide = trpc.system.taxiOps.driver.rejectRide.useMutation({
    onSuccess: async () => {
      setError("");
      await invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const operation = (operationQuery.data ?? null) as DriverOperationState | null;
  const live = (statusQuery.data ?? null) as DriverStatus | null;
  const pending = (pendingQuery.data ?? []) as Ride[];
  const active = (activeQuery.data ?? null) as Ride | null;
  const filteredPending = useMemo(() => filter === "all" ? pending : pending.filter((ride) => (ride.service_type || "taxi") === filter), [pending, filter]);
  const saving = acceptRide.isPending || rejectRide.isPending;
  const loading = operationQuery.isLoading || statusQuery.isLoading || pendingQuery.isLoading || activeQuery.isLoading;
  const canOperate = Boolean(operation?.canOperate);
  const isOnline = live?.status === "available" || live?.status === "busy";
  const hasRealTaxiIdentity = Boolean(live?.taxi_code?.trim() && live?.plate?.trim());
  const canAccept = canOperate && isOnline && hasRealTaxiIdentity && !active;

  const accept = (rideId: string) => {
    const taxiCode = live?.taxi_code?.trim();
    const plate = live?.plate?.trim();
    if (!taxiCode || !plate) {
      setError("Completa el taxi y la matrícula reales en tu perfil antes de aceptar un servicio.");
      return;
    }
    acceptRide.mutate({ rideId, taxiCode, plate });
  };

  const refresh = async () => {
    setError("");
    await Promise.all([operationQuery.refetch(), statusQuery.refetch(), pendingQuery.refetch(), activeQuery.refetch()]);
  };

  const queryError = operationQuery.error?.message || statusQuery.error?.message || pendingQuery.error?.message || activeQuery.error?.message || "";

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] bg-black p-5 text-white shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-white/55">Operación del conductor</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight">Servicios</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-white/60">Solicitudes reales, asignación segura y acceso directo al flujo de llegada, PIN y cierre.</p>
            </div>
            <Button onClick={refresh} disabled={loading || saving} variant="outline" className="h-14 rounded-2xl border-white/20 bg-white text-black font-black hover:bg-zinc-100">
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
              Actualizar
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={<ShieldCheck className="h-5 w-5" />} title="Verificación" value={canOperate ? "Correcta" : "Pendiente"} dark />
            <Metric icon={<Sparkles className="h-5 w-5" />} title="Estado" value={isOnline ? "Online" : "Offline"} dark />
            <Metric icon={<Car className="h-5 w-5" />} title="Taxi" value={hasRealTaxiIdentity ? "Completo" : "Incompleto"} dark />
            <Metric icon={<Route className="h-5 w-5" />} title="Solicitudes" value={String(filteredPending.length)} dark />
          </div>
        </section>

        {(error || queryError) && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />{error || queryError}</div>}
        {loading && <div className="rounded-3xl bg-white p-6 text-center font-bold text-zinc-500 shadow-sm"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Cargando estado operativo...</div>}

        {!canOperate && <ActionNotice tone="warning" icon={<ShieldCheck className="h-6 w-6" />} title="Verificación pendiente" text={operation?.message || "Completa la verificación para recibir servicios."} action="Abrir perfil" onClick={() => setLocation("/driver/profile")} />}
        {canOperate && !hasRealTaxiIdentity && <ActionNotice tone="danger" icon={<Car className="h-6 w-6" />} title="Taxi o matrícula incompletos" text="No se aceptará ninguna solicitud con datos inventados. Añade el código de taxi y la matrícula reales." action="Completar perfil" onClick={() => setLocation("/driver/profile")} />}
        {canOperate && hasRealTaxiIdentity && !isOnline && <ActionNotice tone="neutral" icon={<Sparkles className="h-6 w-6" />} title="Estás Offline" text="Ponte Online desde Turno para recibir y aceptar nuevas solicitudes." action="Ir a Turno" onClick={() => setLocation("/driver")} />}

        {active && (
          <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-black text-zinc-500">Servicio activo</p><h2 className="mt-1 text-2xl font-black">{active.status === "assigned" ? "Recogida protegida" : "Viaje en curso"}</h2></div>
                {statusBadge(active.status)}
              </div>
              <RideSummary ride={active} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={() => openMaps(active.status === "assigned" ? active.pickup_address : active.dropoff_address)} variant="outline" className="h-14 rounded-2xl bg-white font-black"><Navigation className="mr-2 h-5 w-5" />Abrir ruta</Button>
                <Button onClick={() => setLocation(active.status === "assigned" ? "/driver/navigation" : "/driver/queue")} className="h-14 rounded-2xl bg-black font-black text-white hover:bg-black/85">
                  {active.status === "assigned" ? <Navigation className="mr-2 h-5 w-5" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                  {active.status === "assigned" ? "Llegada y PIN" : "Cierre profesional"}
                </Button>
              </div>
              <p className="rounded-2xl bg-zinc-100 p-4 text-xs font-bold text-zinc-700">El viaje solo se inicia desde Navegación después de marcar llegada y verificar el PIN. El cierre se realiza mediante la liquidación profesional.</p>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-black">Solicitudes disponibles</h2><p className="text-sm font-semibold text-zinc-500">Se actualizan automáticamente cada 4 segundos.</p></div>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{filteredPending.length} nuevas</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["all", "taxi", "eco", "van"] as const).map((value) => (
                <Button key={value} variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className="h-14 rounded-2xl font-black">{value === "all" ? "Todos" : serviceLabel(value)}</Button>
              ))}
            </div>

            {!canOperate && <EmptyState text="Las solicitudes se habilitarán cuando tu cuenta esté verificada." />}
            {canOperate && active && <EmptyState text="Ya tienes un servicio activo. Complétalo antes de aceptar otro." />}
            {canOperate && !active && filteredPending.length === 0 && <EmptyState text="No hay servicios disponibles con este filtro." />}

            <div className="grid gap-4 lg:grid-cols-2">
              {canOperate && !active && filteredPending.map((ride) => (
                <RideRequestCard key={ride.id} ride={ride} saving={saving} canAccept={canAccept} driverAt={live?.current_lat != null && live?.current_lng != null ? { lat: Number(live.current_lat), lng: Number(live.current_lng) } : null} onAccept={() => accept(ride.id)} onReject={() => rejectRide.mutate({ rideId: ride.id })} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function RideRequestCard({ ride, saving, canAccept, driverAt, onAccept, onReject }: { ride: Ride; saving: boolean; canAccept: boolean; driverAt: { lat: number; lng: number } | null; onAccept: () => void; onReject: () => void }) {
  const hasPickupCoords = ride.pickup_lat != null && ride.pickup_lng != null;
  return (
    <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-black"><UserRound className="mr-2 inline h-5 w-5" />{ride.passenger_name || "Pasajero"}</p><p className="mt-1 text-xs font-bold text-zinc-500">{formatDate(ride.requested_at)}</p></div>
        {statusBadge(ride.status)}
      </div>
      {hasPickupCoords && (
        <div className="mt-4">
          <RideOfferMiniMap
            pickup={{ lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng), address: ride.pickup_address }}
            dropoff={ride.dropoff_lat != null && ride.dropoff_lng != null ? { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng), address: ride.dropoff_address } : null}
            driverAt={driverAt}
          />
        </div>
      )}
      <RideSummary ride={ride} />
      {!canAccept && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Completa verificación, taxi, matrícula y estado Online para aceptar.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button onClick={() => openMaps(ride.pickup_address)} variant="outline" className="h-14 rounded-2xl bg-white font-black"><Navigation className="mr-2 h-5 w-5" />Ruta</Button>
        <Button onClick={onAccept} disabled={saving || !canAccept} className="h-14 rounded-2xl bg-black font-black text-white hover:bg-black/85"><CheckCircle2 className="mr-2 h-5 w-5" />Aceptar</Button>
        <Button onClick={onReject} disabled={saving} variant="outline" className="h-14 rounded-2xl border-red-200 bg-white font-black text-red-700"><XCircle className="mr-2 h-5 w-5" />Rechazar</Button>
      </div>
    </div>
  );
}

function RideSummary({ ride }: { ride: Ride }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2 rounded-3xl bg-zinc-100 p-4 text-sm font-bold text-zinc-700"><p><MapPin className="mr-2 inline h-4 w-4" />{ride.pickup_address}</p><p><Navigation className="mr-2 inline h-4 w-4" />{ride.dropoff_address}</p></div>
      <div className="grid grid-cols-3 gap-2"><Metric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(ride.estimated_fare)} /><Metric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} /><Metric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${ride.distance_km} km`} /></div>
      <div className="grid grid-cols-2 gap-2"><Info icon={<Car className="h-4 w-4" />} label="Servicio" value={serviceLabel(ride.service_type)} /><Info icon={<CreditCard className="h-4 w-4" />} label="Pago" value={paymentLabel(ride.payment_method)} /></div>
    </div>
  );
}

function ActionNotice({ tone, icon, title, text, action, onClick }: { tone: "warning" | "danger" | "neutral"; icon: ReactNode; title: string; text: string; action: string; onClick: () => void }) {
  const styles = tone === "danger" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-zinc-200 bg-white text-zinc-800";
  return <div className={`flex flex-col gap-4 rounded-[2rem] border p-5 sm:flex-row sm:items-center ${styles}`}><div className="flex flex-1 gap-3"><span className="shrink-0">{icon}</span><div><p className="font-black">{title}</p><p className="mt-1 text-sm font-semibold opacity-80">{text}</p></div></div><Button onClick={onClick} className="h-14 rounded-2xl bg-black px-6 font-black text-white">{action}</Button></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm font-bold text-zinc-500">{text}</div>;
}

function Metric({ icon, title, value, dark }: { icon: ReactNode; title: string; value: string; dark?: boolean }) {
  return <div className={`rounded-2xl p-3 text-center ${dark ? "bg-white/10 text-white" : "bg-zinc-100"}`}><div className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-white text-black"}`}>{icon}</div><p className={`text-xs font-bold ${dark ? "text-white/50" : "text-zinc-500"}`}>{title}</p><p className="font-black">{value}</p></div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-zinc-100 p-3"><div className="flex items-center gap-2 text-black">{icon}<span className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</span></div><p className="mt-1 font-black text-zinc-800">{value}</p></div>;
}
