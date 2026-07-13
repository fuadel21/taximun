import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
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
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Aceptada</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizada</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelada</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazada</Badge>;
}

function openMaps(destination: string) {
  const query = encodeURIComponent(destination);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, "_blank", "noopener,noreferrer");
}

export default function DriverServicesPage() {
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

  const acceptRide = trpc.system.taxiOps.driver.acceptRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const rejectRide = trpc.system.taxiOps.driver.rejectRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const startRide = trpc.system.taxiOps.driver.startRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });
  const completeRide = trpc.system.taxiOps.driver.completeRide.useMutation({ onSuccess: invalidate, onError: (err) => setError(err.message) });

  const operation = (operationQuery.data ?? null) as DriverOperationState | null;
  const live = (statusQuery.data ?? null) as DriverStatus | null;
  const pending = (pendingQuery.data ?? []) as Ride[];
  const active = (activeQuery.data ?? null) as Ride | null;
  const filteredPending = useMemo(() => filter === "all" ? pending : pending.filter((ride) => (ride.service_type || "taxi") === filter), [pending, filter]);
  const saving = acceptRide.isPending || rejectRide.isPending || startRide.isPending || completeRide.isPending;
  const canOperate = Boolean(operation?.canOperate);
  const isOnline = live?.status === "available" || live?.status === "busy";

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun Driver</p>
              <h1 className="mt-1 text-3xl font-black">Servicios</h1>
              <p className="mt-2 text-sm font-semibold text-slate-300">Gestiona solicitudes y viajes activos sin mezclarlo con la configuración del turno.</p>
            </div>
            <Car className="h-8 w-8 text-cyan-200" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric icon={<ShieldCheck className="h-4 w-4" />} title="Verificación" value={canOperate ? "OK" : "Pendiente"} dark />
            <Metric icon={<Sparkles className="h-4 w-4" />} title="Estado" value={isOnline ? "Online" : "Offline"} dark />
            <Metric icon={<Route className="h-4 w-4" />} title="Solicitudes" value={String(filteredPending.length)} dark />
          </div>
        </section>

        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        {(operationQuery.error || statusQuery.error || pendingQuery.error || activeQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{operationQuery.error?.message || statusQuery.error?.message || pendingQuery.error?.message || activeQuery.error?.message}</div>}

        {!canOperate && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <ShieldCheck className="mr-2 inline h-4 w-4" />{operation?.message || "Completa la verificación para recibir servicios."}
          </div>
        )}
        {canOperate && !isOnline && (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700 shadow-sm">Ponte Online desde la pestaña Turno para recibir nuevas solicitudes.</div>
        )}

        {active && (
          <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Servicio activo</p>
                  <h2 className="mt-1 text-2xl font-black">{active.status === "assigned" ? "Ir a recogida" : "Viaje en curso"}</h2>
                </div>
                {statusBadge(active.status)}
              </div>
              <RideSummary ride={active} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Button onClick={() => openMaps(active.status === "assigned" ? active.pickup_address : active.dropoff_address)} variant="outline" className="h-12 rounded-2xl bg-white font-black"><Navigation className="mr-2 h-4 w-4" />Abrir ruta</Button>
                {active.status === "assigned" && <Button onClick={() => startRide.mutate({ rideId: active.id })} disabled={saving} className="h-12 rounded-2xl bg-blue-600 font-black text-white hover:bg-blue-500"><Navigation className="mr-2 h-4 w-4" />Iniciar</Button>}
                <Button onClick={() => completeRide.mutate({ rideId: active.id })} disabled={saving} className="h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><CheckCircle2 className="mr-2 h-4 w-4" />Finalizar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Solicitudes disponibles</h2>
                <p className="text-xs font-bold text-slate-500">Actualización automática cada 4 segundos.</p>
              </div>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{filteredPending.length} nuevas</Badge>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["all", "taxi", "eco", "van"] as const).map((value) => (
                <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {value === "all" ? "Todos" : serviceLabel(value)}
                </button>
              ))}
            </div>

            {!canOperate && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Las solicitudes aparecerán cuando tu cuenta esté verificada.</p>}
            {canOperate && !active && filteredPending.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">No hay servicios disponibles con este filtro.</p>}

            <div className="grid gap-3 lg:grid-cols-2">
              {canOperate && !active && filteredPending.map((ride) => (
                <RideRequestCard
                  key={ride.id}
                  ride={ride}
                  saving={saving}
                  onAccept={() => acceptRide.mutate({ rideId: ride.id, taxiCode: live?.taxi_code || "TX-000", plate: live?.plate || "SIN-MAT" })}
                  onReject={() => rejectRide.mutate({ rideId: ride.id })}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function RideRequestCard({ ride, saving, onAccept, onReject }: { ride: Ride; saving: boolean; onAccept: () => void; onReject: () => void }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black"><UserRound className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.passenger_name || "Pasajero"}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(ride.requested_at)}</p>
        </div>
        {statusBadge(ride.status)}
      </div>
      <RideSummary ride={ride} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button onClick={() => openMaps(ride.pickup_address)} variant="outline" className="h-12 rounded-2xl bg-white font-black"><Navigation className="mr-1 h-4 w-4" />Ruta</Button>
        <Button onClick={onAccept} disabled={saving} className="h-12 rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><CheckCircle2 className="mr-1 h-4 w-4" />Aceptar</Button>
        <Button onClick={onReject} disabled={saving} variant="outline" className="h-12 rounded-2xl border-red-200 bg-white font-black text-red-700"><XCircle className="mr-1 h-4 w-4" />Rechazar</Button>
      </div>
    </div>
  );
}

function RideSummary({ ride }: { ride: Ride }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
        <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p>
        <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(ride.estimated_fare)} />
        <Metric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} />
        <Metric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${ride.distance_km} km`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Info icon={<Car className="h-4 w-4" />} label="Servicio" value={serviceLabel(ride.service_type)} />
        <Info icon={<CreditCard className="h-4 w-4" />} label="Pago" value={paymentLabel(ride.payment_method)} />
      </div>
    </div>
  );
}

function Metric({ icon, title, value, dark }: { icon: ReactNode; title: string; value: string; dark?: boolean }) {
  return <div className={`rounded-2xl p-3 text-center ${dark ? "bg-white/10 text-white" : "bg-slate-50"}`}><div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full ${dark ? "bg-white/10 text-cyan-200" : "bg-white text-cyan-600"}`}>{icon}</div><p className="text-xs font-bold text-slate-400">{title}</p><p className="font-black">{value}</p></div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-cyan-600">{icon}<span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{label}</span></div><p className="mt-1 font-black text-slate-800">{value}</p></div>;
}
