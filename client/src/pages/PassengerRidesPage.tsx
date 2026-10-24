import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PassengerReceiptModal } from "@/components/PassengerReceiptModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PassengerCancellationTrace } from "@/components/PassengerCancellationTrace";
import { PassengerCancelledCardRelease } from "@/components/PassengerCancelledCardRelease";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Car,
  Clock3,
  CreditCard,
  Euro,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  ReceiptText,
  RefreshCw,
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
  cancelled_by_role?: string | null;
  cancellation_reason?: string | null;
  cancellation_note?: string | null;
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
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  if (status === "assigned") return <Badge className="bg-zinc-900 text-white hover:bg-zinc-900">Asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">Rechazado</Badge>;
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

  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, { retry: false, refetchInterval: 5000, refetchOnWindowFocus: true });
  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, { retry: false, refetchInterval: 15000 });
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
  const refreshing = currentRideQuery.isFetching || historyQuery.isFetching || liveStatusQuery.isFetching;
  const error = currentRideQuery.error?.message || historyQuery.error?.message || liveStatusQuery.error?.message || "";

  const refresh = async () => {
    await Promise.all([currentRideQuery.refetch(), historyQuery.refetch(), liveStatusQuery.refetch()]);
  };

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="flex flex-col gap-4 rounded-[2rem] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-zinc-500">Resumen de actividad</p>
            <h2 className="mt-1 text-2xl font-black">Tus viajes reales</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-500">Viaje activo, historial, conductor, tarifa y pago en un solo lugar.</p>
          </div>
          <Button onClick={refresh} disabled={refreshing} variant="outline" className="h-14 rounded-2xl bg-white font-black">
            {refreshing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
            Actualizar
          </Button>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <MiniMetric icon={<Car className="h-5 w-5" />} title="Activo" value={currentRide ? statusLabel(currentRide.status) : "No"} />
          <MiniMetric icon={<ReceiptText className="h-5 w-5" />} title="Historial" value={String(history.length)} />
          <MiniMetric icon={<ShieldCheck className="h-5 w-5" />} title="Seguridad" value="Activa" />
        </div>

        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />{error}</div>}
        {loading && <div className="rounded-3xl bg-white p-6 text-center font-bold text-zinc-500 shadow-sm"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Cargando viajes...</div>}

        {!loading && (selectedRide ? <RideDetailCard ride={selectedRide} liveStatus={selectedRide.id === liveStatus?.rideId ? liveStatus : null} /> : (
          <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <Car className="mx-auto h-12 w-12" />
              <h2 className="mt-4 text-2xl font-black">Todavía no tienes viajes</h2>
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-zinc-500">Cuando solicites un taxi, aquí aparecerán el estado, el conductor, la ruta y el precio.</p>
              <Button onClick={() => setLocation("/passenger")} className="mt-5 h-14 rounded-2xl bg-black px-7 font-black text-white">Solicitar taxi</Button>
            </CardContent>
          </Card>
        ))}

        <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-black">Historial y actividad</h2><p className="text-sm font-semibold text-zinc-500">Selecciona un viaje para consultar todos sus detalles.</p></div><Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100">{rides.length}</Badge></div>
            <div className="space-y-3">
              {rides.length === 0 && <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm font-bold text-zinc-500">Sin viajes todavía.</div>}
              {rides.map((ride) => (
                <button key={ride.id} type="button" onClick={() => setSelectedRideId(ride.id)} aria-pressed={selectedRide?.id === ride.id} className={`min-h-20 w-full rounded-2xl p-4 text-left transition active:scale-[0.98] ${selectedRide?.id === ride.id ? "bg-black text-white" : "bg-zinc-100 hover:bg-zinc-200"}`}>
                  <div className="flex items-center justify-between gap-3"><p className="truncate font-black">{ride.dropoff_address}</p>{statusBadge(ride.status)}</div>
                  <p className={`mt-1 text-xs font-bold ${selectedRide?.id === ride.id ? "text-white/55" : "text-zinc-500"}`}>{formatDate(ride.requested_at)} · {money(ride.estimated_fare)} · {serviceLabel(ride.service_type)}</p>
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
  const [receiptOpen, setReceiptOpen] = useState(false);
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
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      setShared(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-[2rem] border-black/5 bg-white shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="rounded-[1.75rem] bg-black p-5 text-white">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white/55">Detalle del viaje</p><h2 className="mt-1 text-2xl font-black">{statusLabel(ride.status)}</h2><p className="mt-1 text-xs font-bold text-white/55">Código {shortId(ride.id)} · {formatDate(ride.requested_at)}</p></div>{statusBadge(ride.status)}</div>
        </div>

        <div className="grid grid-cols-3 gap-3"><MiniMetric icon={<Euro className="h-5 w-5" />} title="Precio" value={money(ride.estimated_fare)} /><MiniMetric icon={<Clock3 className="h-5 w-5" />} title="Tiempo" value={`${ride.estimated_duration} min`} /><MiniMetric icon={<Route className="h-5 w-5" />} title="Ruta" value={`${ride.distance_km} km`} /></div>

        {isActive && ride.status !== "pending" && <div className="grid gap-3 sm:grid-cols-3"><InfoRow icon={<LocateFixed className="h-5 w-5" />} title="Llegada real" value={etaText} /><InfoRow icon={<Route className="h-5 w-5" />} title="Distancia recogida" value={distanceText} /><InfoRow icon={<MapPin className="h-5 w-5" />} title="Zona conductor" value={liveStatus?.currentZone || "Sin zona"} /></div>}

        <div className="space-y-3 rounded-3xl bg-zinc-100 p-4 text-sm font-bold text-zinc-700"><p><MapPin className="mr-2 inline h-5 w-5" />{ride.pickup_address}</p><p><Navigation className="mr-2 inline h-5 w-5" />{ride.dropoff_address}</p></div>

        <PassengerCancellationTrace status={ride.status} cancelledAt={ride.cancelled_at} cancelledByRole={ride.cancelled_by_role} reason={ride.cancellation_reason} note={ride.cancellation_note} />

        <div className="grid gap-3 sm:grid-cols-3"><InfoRow icon={<CreditCard className="h-5 w-5" />} title="Pago" value={paymentLabel(ride.payment_method)} /><InfoRow icon={<CalendarClock className="h-5 w-5" />} title="Solicitado" value={formatDate(ride.requested_at)} /><InfoRow icon={<ShieldCheck className="h-5 w-5" />} title="Estado" value={statusLabel(ride.status)} /></div>

        <PassengerCancelledCardRelease rideId={ride.id} rideStatus={ride.status} paymentMethod={ride.payment_method} />

        {(ride.driver_name || ride.taxi_code || ride.plate || liveStatus?.driverName || liveStatus?.taxiCode || liveStatus?.plate) && <div className="rounded-3xl bg-zinc-100 p-4 text-sm font-bold text-zinc-800"><p className="font-black">Conductor y taxi</p><p className="mt-1">{liveStatus?.driverName || ride.driver_name || "Conductor pendiente"} · {liveStatus?.taxiCode || ride.taxi_code || "Taxi pendiente"} · {liveStatus?.plate || ride.plate || "Matrícula pendiente"}</p>{liveStatus?.updatedAt && <p className="mt-1 text-xs text-zinc-500">GPS actualizado: {formatDate(liveStatus.updatedAt)}</p>}</div>}

        {(ride.fare_range_min || ride.fare_range_max || Object.keys(breakdown).length > 0) && <div className="rounded-3xl border border-zinc-200 bg-white p-4"><p className="font-black">Tarifa estimada</p>{(ride.fare_range_min || ride.fare_range_max) && <p className="mt-1 text-xs font-bold text-zinc-500">Rango: {money(ride.fare_range_min)} - {money(ride.fare_range_max)}</p>}<div className="mt-3 grid gap-2 text-xs font-bold text-zinc-600 sm:grid-cols-2">{typeof breakdown.baseFare !== "undefined" && <p>Salida: <span className="text-black">{money(breakdown.baseFare)}</span></p>}{typeof breakdown.distanceFare !== "undefined" && <p>Distancia: <span className="text-black">{money(breakdown.distanceFare)}</span></p>}{typeof breakdown.timeFare !== "undefined" && <p>Tiempo: <span className="text-black">{money(breakdown.timeFare)}</span></p>}{typeof breakdown.bookingFee !== "undefined" && <p>Gestión app: <span className="text-black">{money(breakdown.bookingFee)}</span></p>}</div></div>}

        <div className={ride.status === "completed" ? "grid gap-3 sm:grid-cols-3" : "grid grid-cols-2 gap-3"}><Button onClick={shareRide} variant="outline" className="h-14 rounded-2xl bg-white font-black"><Share2 className="mr-2 h-5 w-5" />{shared ? "Copiado" : "Compartir"}</Button>{ride.status === "completed" && <Button onClick={() => setReceiptOpen(true)} variant="outline" className="h-14 rounded-2xl bg-white font-black"><ReceiptText className="mr-2 h-5 w-5" />Recibo</Button>}<Button onClick={() => { window.location.href = isActive ? "/passenger" : "/passenger/security"; }} className="h-14 rounded-2xl bg-black font-black text-white">{isActive ? <BellRing className="mr-2 h-5 w-5" /> : <ShieldCheck className="mr-2 h-5 w-5" />}{isActive ? "Ver activo" : "Soporte"}</Button></div>
        {receiptOpen && <PassengerReceiptModal rideId={ride.id} onClose={() => setReceiptOpen(false)} />}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="rounded-3xl bg-zinc-100 p-4"><div className="mb-1 flex items-center gap-2 text-black">{icon}<span className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{title}</span></div><p className="font-black text-zinc-800">{value}</p></div>;
}

function MiniMetric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="rounded-3xl bg-white p-3 text-center shadow-sm"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-black">{icon}</div><p className="text-xs font-bold text-zinc-500">{title}</p><p className="font-black">{value}</p></div>;
}
