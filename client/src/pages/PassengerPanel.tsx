import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  Bell,
  Car,
  Clock3,
  CreditCard,
  Euro,
  History,
  Home,
  LifeBuoy,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  XCircle,
} from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type TaxiRideRow = {
  id: string;
  passenger_name?: string | null;
  driver_name?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  status: RideStatus;
  payment_method?: string | null;
  requested_at?: string | null;
  assigned_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

const routePresets = [
  {
    id: "station-hospital",
    title: "Estación → Hospital",
    pickup: "Estación central · Parada taxi 2",
    dropoff: "Hospital municipal · Entrada principal",
    fare: 12.8,
    duration: 14,
    distanceKm: 5.4,
  },
  {
    id: "home-center",
    title: "Casa → Centro",
    pickup: "Mi ubicación actual",
    dropoff: "Plaza del Ayuntamiento · Centro",
    fare: 8.9,
    duration: 9,
    distanceKm: 3.1,
  },
  {
    id: "airport-hotel",
    title: "Hotel → Aeropuerto",
    pickup: "Hotel Costa · Recepción",
    dropoff: "Aeropuerto · Terminal principal",
    fare: 34.5,
    duration: 28,
    distanceKm: 21.6,
  },
];

const recentPlaces = ["Casa", "Trabajo", "Estación", "Hospital", "Centro", "Hotel Costa"];

function money(value: unknown) {
  return `${Number(value ?? 0).toFixed(2)} €`;
}

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: RideStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Buscando conductor</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Conductor asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Viaje en curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazado</Badge>;
}

function MetricCard({ icon: Icon, title, value, note }: { icon: any; title: string; value: string; note: string }) {
  return (
    <Card className="border-white/70 bg-white/85 shadow-[0_16px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 text-white shadow-lg shadow-cyan-500/20">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PanelCard({ icon: Icon, title, description, children }: { icon: any; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-black">
          <Icon className="h-5 w-5 text-cyan-600" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function PassengerPanel() {
  const { user, logout, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const canUseRealApi = !isGuest && (user?.role === "passenger" || user?.role === "admin");

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState("Mi ubicación actual");
  const [dropoffAddress, setDropoffAddress] = useState("Hospital municipal · Entrada principal");
  const [fare, setFare] = useState(12.8);
  const [duration, setDuration] = useState(14);
  const [distanceKm, setDistanceKm] = useState(5.4);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bizum">("cash");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setUserLocation(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
  }, []);

  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 10000,
  });

  const createRideMutation = trpc.system.taxiOps.passenger.createRide.useMutation({
    onSuccess: () => {
      setFormError(null);
      utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      utils.system.taxiOps.passenger.getRideHistory.invalidate();
    },
    onError: (error) => setFormError(error.message),
  });

  const cancelRideMutation = trpc.system.taxiOps.passenger.cancelRide.useMutation({
    onSuccess: () => {
      utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      utils.system.taxiOps.passenger.getRideHistory.invalidate();
    },
    onError: (error) => setFormError(error.message),
  });

  const currentRide = (currentRideQuery.data ?? null) as TaxiRideRow | null;
  const rideHistory = (historyQuery.data ?? []) as TaxiRideRow[];

  const applyPreset = (presetId: string) => {
    const preset = routePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setPickupAddress(preset.pickup);
    setDropoffAddress(preset.dropoff);
    setFare(preset.fare);
    setDuration(preset.duration);
    setDistanceKm(preset.distanceKm);
  };

  const recalculateEstimate = () => {
    const base = 4.5;
    const distance = Math.max(2.2, Math.min(28, (pickupAddress.length + dropoffAddress.length) / 4));
    setDistanceKm(Number(distance.toFixed(1)));
    setFare(Number((base + distance * 1.55).toFixed(2)));
    setDuration(Math.round(distance * 2.4 + 4));
  };

  const requestTaxi = async () => {
    if (!canUseRealApi) {
      setFormError("Para crear solicitudes reales debes iniciar sesión como pasajero.");
      return;
    }
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      setFormError("Falta origen o destino.");
      return;
    }
    if (currentRide) {
      setFormError("Ya tienes un viaje activo. Cancélalo o espera a que finalice.");
      return;
    }

    await createRideMutation.mutateAsync({
      pickupAddress,
      dropoffAddress,
      pickupLat: userLocation?.latitude,
      pickupLng: userLocation?.longitude,
      estimatedFare: fare,
      estimatedDuration: duration,
      distanceKm,
      paymentMethod,
    });
  };

  const cancelCurrentRide = async () => {
    if (!currentRide) return;
    await cancelRideMutation.mutateAsync({ rideId: currentRide.id });
  };

  const locationLabel = useMemo(() => {
    if (!userLocation) return "Ubicación no disponible";
    return `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
  }, [userLocation]);

  const statusText = currentRide
    ? currentRide.status === "pending"
      ? "Esperando conductor"
      : currentRide.status === "assigned"
        ? "Conductor asignado"
        : currentRide.status === "in_progress"
          ? "Viaje en curso"
          : "Sin viaje activo"
    : "Sin viaje activo";

  const isSaving = createRideMutation.isPending || cancelRideMutation.isPending;

  if (!canUseRealApi) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_46%,_#ffffff_100%)] px-4 py-6 text-slate-950">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl items-center justify-center">
          <Card className="border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-black">
                <ShieldCheck className="h-6 w-6 text-cyan-600" />
                Acceso real requerido
              </CardTitle>
              <CardDescription>
                El panel pasajero ya no usa simulaciones. Para crear viajes reales debes iniciar sesión o registrarte como pasajero.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setLocation("/auth")} className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">
                Ir al login
              </Button>
              <Button onClick={logout} variant="outline" className="rounded-2xl bg-white font-black">
                Salir
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_46%,_#ffffff_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun Passenger</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Panel pasajero real</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentRide ? statusBadge(currentRide.status) : <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Sin viaje</Badge>}
            <Button variant="outline" onClick={logout} className="rounded-2xl bg-white/80">
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-cyan-100 ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" />
                Datos reales Supabase · {user?.name ?? "Pasajero"}
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Solicita un taxi real</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                La solicitud se guarda en Supabase. Un conductor real la verá desde su panel y podrá aceptarla, iniciarla y finalizarla.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={requestTaxi} disabled={Boolean(currentRide) || isSaving} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
                  {createRideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Car className="mr-2 h-4 w-4" />}
                  Pedir taxi real
                </Button>
                <Button onClick={recalculateEstimate} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <Search className="mr-2 h-4 w-4" />
                  Recalcular tarifa
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Estado</p>
                <p className="mt-2 text-xl font-black">{statusText}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Tiempo</p>
                <p className="mt-2 text-2xl font-black">{duration} min</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Tarifa</p>
                <p className="mt-2 text-2xl font-black">{money(fare)}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Ubicación</p>
                <p className="mt-2 text-xs font-bold text-cyan-100">{locationLabel}</p>
              </div>
            </div>
          </div>
        </section>

        {formError && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            {formError}
          </div>
        )}
        {(currentRideQuery.error || historyQuery.error) && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            Error conectando con Supabase: {currentRideQuery.error?.message || historyQuery.error?.message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Clock3} title="Tiempo" value={`${duration} min`} note="Estimación de solicitud" />
          <MetricCard icon={Euro} title="Precio" value={money(fare)} note="Tarifa estimada" />
          <MetricCard icon={Route} title="Distancia" value={`${distanceKm} km`} note="Ruta aproximada" />
          <MetricCard icon={Star} title="Historial" value={String(rideHistory.length)} note="Viajes anteriores" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <PanelCard icon={Navigation} title="Mapa y seguimiento" description="Ubicación y seguimiento del servicio">
              <div className="overflow-hidden rounded-3xl">
                <TaxiMap userLocation={userLocation || undefined} readOnly />
              </div>
            </PanelCard>

            <Tabs defaultValue="booking" className="space-y-4">
              <TabsList className="grid h-auto grid-cols-3 rounded-3xl bg-white/80 p-1 shadow-sm backdrop-blur-xl">
                <TabsTrigger value="booking" className="rounded-2xl py-3 font-black">Reserva</TabsTrigger>
                <TabsTrigger value="tracking" className="rounded-2xl py-3 font-black">Seguimiento</TabsTrigger>
                <TabsTrigger value="history" className="rounded-2xl py-3 font-black">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="booking">
                <PanelCard icon={MapPin} title="Nueva solicitud real" description="Origen, destino y tarifa antes de confirmar">
                  <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="font-black text-slate-800">Origen</Label>
                        <Input value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} className="h-13 rounded-2xl bg-white" />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black text-slate-800">Destino</Label>
                        <Input value={dropoffAddress} onChange={(event) => setDropoffAddress(event.target.value)} className="h-13 rounded-2xl bg-white" />
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {routePresets.map((preset) => (
                        <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className="rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                          <p className="font-black text-slate-900">{preset.title}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{preset.duration} min · {money(preset.fare)}</p>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-3 rounded-3xl bg-slate-50 p-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Duración</p>
                        <p className="mt-1 text-xl font-black">{duration} min</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Distancia</p>
                        <p className="mt-1 text-xl font-black">{distanceKm} km</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Precio</p>
                        <p className="mt-1 text-xl font-black">{money(fare)}</p>
                      </div>
                    </div>

                    <Button onClick={requestTaxi} disabled={Boolean(currentRide) || isSaving} className="rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-6 text-base font-black text-white">
                      {createRideMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                      Confirmar solicitud real
                    </Button>
                  </div>
                </PanelCard>
              </TabsContent>

              <TabsContent value="tracking">
                {currentRideQuery.isLoading ? (
                  <PanelCard icon={Loader2} title="Cargando viaje" description="Consultando Supabase">
                    <div className="py-8 text-center text-sm font-bold text-slate-500">Cargando...</div>
                  </PanelCard>
                ) : currentRide ? (
                  <RideTracking ride={currentRide} onCancel={cancelCurrentRide} isSaving={isSaving} />
                ) : (
                  <PanelCard icon={ShieldCheck} title="Sin viaje activo" description="Cuando pidas un taxi real aparecerá aquí">
                    <div className="rounded-3xl bg-slate-50 p-6 text-center">
                      <p className="font-black text-slate-900">No hay solicitud activa</p>
                      <p className="mt-2 text-sm text-slate-500">Crea una solicitud desde la pestaña Reserva.</p>
                    </div>
                  </PanelCard>
                )}
              </TabsContent>

              <TabsContent value="history">
                <PanelCard icon={History} title="Historial real" description="Viajes finalizados, cancelados o rechazados en Supabase">
                  <div className="space-y-3">
                    {historyQuery.isLoading && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Cargando historial...</p>}
                    {!historyQuery.isLoading && rideHistory.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">No hay viajes en el historial todavía.</p>}
                    {rideHistory.map((ride) => (
                      <div key={ride.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{ride.id.slice(0, 8)}</p>
                            <p className="mt-1 text-sm text-slate-500">{ride.pickup_address} → {ride.dropoff_address}</p>
                          </div>
                          {statusBadge(ride.status)}
                        </div>
                        <p className="mt-3 text-sm font-black text-slate-900">{money(ride.estimated_fare)} · {ride.estimated_duration} min · {dateLabel(ride.requested_at)}</p>
                      </div>
                    ))}
                  </div>
                </PanelCard>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4">
            <PanelCard icon={CreditCard} title="Pago" description="Método de pago del viaje">
              <div className="space-y-3">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">Método actual</p>
                  <p className="mt-2 font-black text-slate-950">{paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}</p>
                </div>
                <Button onClick={() => setPaymentMethod(paymentMethod === "cash" ? "card" : "cash")} variant="outline" className="w-full rounded-2xl bg-white font-black">
                  Cambiar método
                </Button>
              </div>
            </PanelCard>

            <PanelCard icon={Home} title="Lugares rápidos" description="Accesos frecuentes">
              <div className="grid grid-cols-2 gap-2">
                {recentPlaces.map((place) => (
                  <button key={place} type="button" onClick={() => setDropoffAddress(place)} className="rounded-2xl bg-white p-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    {place}
                  </button>
                ))}
              </div>
            </PanelCard>

            <PanelCard icon={LifeBuoy} title="Ayuda" description="Acciones disponibles">
              <div className="grid gap-3">
                <Button disabled variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <LifeBuoy className="mr-3 h-5 w-5 text-indigo-600" /> Soporte en siguiente bloque
                </Button>
                <Button disabled={!currentRide?.driver_name} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <Phone className="mr-3 h-5 w-5 text-cyan-600" /> Llamada segura pendiente
                </Button>
              </div>
            </PanelCard>

            <PanelCard icon={Bell} title="Estado API" description="Sin simulaciones">
              <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                Este panel usa `system.taxiOps.passenger` y guarda solicitudes reales en `taxi_rides`.
              </div>
            </PanelCard>
          </aside>
        </div>
      </main>
    </div>
  );
}

function RideTracking({ ride, onCancel, isSaving }: { ride: TaxiRideRow; onCancel: () => void; isSaving: boolean }) {
  const progress = ride.status === "pending" ? 25 : ride.status === "assigned" ? 60 : ride.status === "in_progress" ? 85 : 100;
  const canCancel = ride.status === "pending" || ride.status === "assigned";

  return (
    <PanelCard icon={LocateFixed} title="Seguimiento real del viaje" description="Estado actualizado desde Supabase">
      <div className="space-y-4">
        <div className="rounded-3xl bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Solicitud</p>
              <p className="font-black text-slate-950">{ride.id.slice(0, 8)}</p>
            </div>
            {statusBadge(ride.status)}
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {ride.driver_name ? (
          <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-cyan-700">Conductor asignado</p>
                <p className="mt-1 text-xl font-black text-slate-950">{ride.driver_name}</p>
                <p className="text-sm font-semibold text-slate-600">{ride.taxi_code ?? "Taxi"} · {ride.plate ?? "Matrícula pendiente"}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 text-cyan-600 shadow-sm">
                <Car className="h-6 w-6" />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Esperando a que un conductor acepte la solicitud desde su panel.
          </div>
        )}

        <div className="grid gap-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
              <MapPin className="h-4 w-4 text-cyan-600" /> Recogida
            </p>
            <p className="text-sm text-slate-600">{ride.pickup_address}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
              <MapPin className="h-4 w-4 text-blue-600" /> Destino
            </p>
            <p className="text-sm text-slate-600">{ride.dropoff_address}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">Importe</p>
            <p className="mt-1 font-black">{money(ride.estimated_fare)}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">Tiempo</p>
            <p className="mt-1 font-black">{ride.estimated_duration} min</p>
          </div>
          <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">Distancia</p>
            <p className="mt-1 font-black">{ride.distance_km} km</p>
          </div>
        </div>

        {canCancel && (
          <Button onClick={onCancel} disabled={isSaving} variant="outline" className="w-full rounded-2xl border-red-200 bg-white py-6 font-black text-red-700 hover:bg-red-50">
            {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <XCircle className="mr-2 h-5 w-5" />}
            Cancelar viaje real
          </Button>
        )}
      </div>
    </PanelCard>
  );
}
