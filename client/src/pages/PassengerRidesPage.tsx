import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Car,
  Clock3,
  CreditCard,
  Euro,
  LocateFixed,
  MapPin,
  Navigation,
  ReceiptText,
  Route,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type TaxiRideRow = {
  id: string;
  driver_name?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  service_type?: string | null;
  payment_method?: string | null;
  fare_range_min?: number | string | null;
  fare_range_max?: number | string | null;
  fare_breakdown?: Record<string, unknown> | null;
  status: RideStatus;
  requested_at?: string | null;
  assigned_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type DriverLiveStatus = {
  rideId: string;
  driverId: string;
  available: boolean;
  status?: string | null;
  driverName?: string | null;
  taxiCode?: string | null;
  plate?: string | null;
  currentZone?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  updatedAt?: string | null;
  distanceToPickupKm?: number | null;
  etaMinutes?: number | null;
  message?: string | null;
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;
const shortId = (value: string) => value.slice(0, 8).toUpperCase();

function formatDate(value: unknown) {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: RideStatus) {
  if (status === "pending") return "Buscando";
  if (status === "assigned") return "Asignado";
  if (status === "in_progress") return "En curso";
  if (status === "completed") return "Finalizado";
  if (status === "cancelled") return "Cancelado";
  return "Rechazado";
}

function statusBadge(status: RideStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Buscando</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazado</Badge>;
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

export default function PassengerRidesPage() {
  const [, setLocation] = useLocation();
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);

  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const currentRide = (currentRideQuery.data ?? null) as TaxiRideRow | null;
  const liveStatusQuery = trpc.system.taxiPassengerTracking.getAssignedDriverLiveStatus.useQuery(undefined, {
    enabled: Boolean(currentRide && ["assigned", "in_progress"].includes(currentRide.status)),
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const history = (historyQuery.data ?? []) as TaxiRideRow[];
  const rides = useMemo(() => [currentRide, ...history].filter(Boolean) as TaxiRideRow[], [currentRide, history]);
  const selectedRide = rides.find((ride) => ride.id === selectedRideId) || currentRide || rides[0] || null;
  const liveStatus = (liveStatusQuery.data ?? null) as DriverLiveStatus | null;
  const loading = currentRideQuery.isLoading || historyQuery.isLoading;
  const error = currentRideQuery.error?.message || historyQuery.error?.message || liveStatusQuery.error?.message || "";

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun pasajero</p>
          <h1 className="mt-1 text-3xl font-black">Mis viajes</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">Consulta tu viaje activo, historial, precio, servicio, pago y ruta.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric icon={<Car className="h-4 w-4" />} title="Activo" value={currentRide ? statusLabel(currentRide.status) : "No"} dark />
            <MiniMetric icon={<ReceiptText className="h-4 w-4" />} title="Historial" value={String(history.length)} dark />
            <MiniMetric icon={<ShieldCheck className="h-4 w-4" />} title="Seguridad" value="Activa" dark />
          </div>
        </div>

        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        {loading && <div className="rounded-3xl bg-white p-4 text-sm font-black text-slate-500 shadow-sm">Cargando viajes...</div>}

        {selectedRide ? <RideDetailCard ride={selectedRide} liveStatus={selectedRide.id === liveStatus?.rideId ? liveStatus : null} /> : (
          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-6 text-center">
              <Car className="mx-auto h-10 w-10 text-cyan-600" />
              <h2 className="mt-3 text-xl font-black">Todavía no tienes viajes</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Cuando solicites un taxi, aparecerá aquí el detalle del servicio.</p>
              <Button onClick={() => setLocation("/passenger")} className="mt-4 rounded-2xl bg-slate-950 font-black text-white">Solicitar taxi</Button>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-black">Lista de viajes</h2>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{rides.length}</Badge>
            </div>
            <div className="space-y-2">
              {rides.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Sin viajes todavía.</p>}
              {rides.map((ride) => (
                <button key={ride.id} onClick={() => setSelectedRideId(ride.id)} className={`w-full rounded-2xl p-3 text-left transition active:scale-95 ${selectedRide?.id === ride.id ? "bg-slate-950 text-white" : "bg-slate-50 hover:bg-cyan-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-black">{ride.dropoff_address}</p>
                    {statusBadge(ride.status)}
                  </div>
                  <p className={`mt-1 text-xs font-bold ${selectedRide?.id === ride.id ? "text-slate-300" : "text-slate-500"}`}>{formatDate(ride.requested_at)} · {money(ride.estimated_fare)} · {serviceLabel(ride.service_type)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function RideDetailCard({ ride, liveStatus }: { ride: TaxiRideRow; liveStatus?: DriverLiveStatus | null }) {
  const [shared, setShared] = useState(false);
  const breakdown = (ride.fare_breakdown || {}) as Record<string, unknown>;
  const isActive = ["pending", "assigned", "in_progress"].includes(ride.status);
  const etaText = ride.status === "in_progress" ? "En viaje" : liveStatus?.etaMinutes ? `${liveStatus.etaMinutes} min` : "Esperando GPS";
  const distanceText = liveStatus?.distanceToPickupKm ? `${liveStatus.distanceToPickupKm} km` : "—";

  const shareRide = async () => {
    const text = `Taximun · Viaje ${shortId(ride.id)}\nEstado: ${statusLabel(ride.status)}\nOrigen: ${ride.pickup_address}\nDestino: ${ride.dropoff_address}\nPrecio estimado: ${money(ride.estimated_fare)}\nServicio: ${serviceLabel(ride.service_type)}\nPago: ${paymentLabel(ride.payment_method)}`;
    try {
      if (navigator.share) await navigator.share({ title: "Viaje Taximun", text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2200);
    } catch {}
  };

  return (
    <Card className="overflow-hidden rounded-[1.75rem] border-white bg-white shadow-xl">
      <CardContent className="space-y-4 p-4">
        <div className="rounded-[1.5rem] bg-slate-950 p-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Detalle del viaje</p>
              <h2 className="mt-1 text-2xl font-black">{statusLabel(ride.status)}</h2>
              <p className="mt-1 text-xs font-bold text-slate-300">Código {shortId(ride.id)} · {formatDate(ride.requested_at)}</p>
            </div>
            {statusBadge(ride.status)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniMetric icon={<Euro className="h-4 w-4" />} title="Precio" value={money(ride.estimated_fare)} />
          <MiniMetric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} />
          <MiniMetric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${ride.distance_km} km`} />
        </div>

        {isActive && ride.status !== "pending" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <InfoRow icon={<LocateFixed className="h-4 w-4" />} title="Llegada real" value={etaText} />
            <InfoRow icon={<Route className="h-4 w-4" />} title="Distancia recogida" value={distanceText} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} title="Zona conductor" value={liveStatus?.currentZone || "Sin zona"} />
          </div>
        )}

        <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
          <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p>
          <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow icon={<Car className="h-4 w-4" />} title="Servicio" value={serviceLabel(ride.service_type)} />
          <InfoRow icon={<CreditCard className="h-4 w-4" />} title="Pago" value={paymentLabel(ride.payment_method)} />
          <InfoRow icon={<CalendarClock className="h-4 w-4" />} title="Solicitado" value={formatDate(ride.requested_at)} />
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} title="Estado" value={statusLabel(ride.status)} />
        </div>

        {(ride.driver_name || ride.taxi_code || ride.plate || liveStatus?.driverName || liveStatus?.taxiCode || liveStatus?.plate) && (
          <div className="rounded-3xl bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
            <p className="font-black">Conductor y taxi</p>
            <p className="mt-1">{liveStatus?.driverName || ride.driver_name || "Conductor pendiente"} · {liveStatus?.taxiCode || ride.taxi_code || "Taxi pendiente"} · {liveStatus?.plate || ride.plate || "Matrícula pendiente"}</p>
            {liveStatus?.updatedAt && <p className="mt-1 text-xs text-cyan-700">GPS actualizado: {formatDate(liveStatus.updatedAt)}</p>}
          </div>
        )}

        {(ride.fare_range_min || ride.fare_range_max || Object.keys(breakdown).length > 0) && (
          <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="font-black">Tarifa estimada</p>
            {(ride.fare_range_min || ride.fare_range_max) && <p className="mt-1 text-xs font-bold text-slate-500">Rango: {money(ride.fare_range_min)} - {money(ride.fare_range_max)}</p>}
            <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
              {typeof breakdown.baseFare !== "undefined" && <p>Salida: <span className="text-slate-950">{money(breakdown.baseFare)}</span></p>}
              {typeof breakdown.distanceFare !== "undefined" && <p>Distancia: <span className="text-slate-950">{money(breakdown.distanceFare)}</span></p>}
              {typeof breakdown.timeFare !== "undefined" && <p>Tiempo: <span className="text-slate-950">{money(breakdown.timeFare)}</span></p>}
              {typeof breakdown.bookingFee !== "undefined" && <p>Gestión app: <span className="text-slate-950">{money(breakdown.bookingFee)}</span></p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={shareRide} variant="outline" className="h-12 rounded-2xl bg-white font-black"><Share2 className="mr-2 h-4 w-4" />{shared ? "Copiado" : "Compartir"}</Button>
          <Button onClick={() => { window.location.href = isActive ? "/passenger" : "/passenger/security"; }} className="h-12 rounded-2xl bg-slate-950 font-black text-white">
            {isActive ? <BellRing className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {isActive ? "Ver activo" : "Soporte"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-2 text-cyan-600">{icon}<span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{title}</span></div>
      <p className="font-black text-slate-800">{value}</p>
    </div>
  );
}

function MiniMetric({ icon, title, value, dark }: { icon: React.ReactNode; title: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-3xl p-3 text-center ${dark ? "bg-white/10 text-white" : "bg-slate-50"}`}>
      <div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${dark ? "bg-white/10 text-cyan-200" : "bg-white text-cyan-600"}`}>{icon}</div>
      <p className={`text-xs font-bold ${dark ? "text-slate-400" : "text-slate-400"}`}>{title}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
