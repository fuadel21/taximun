import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight,
  Bell,
  Car,
  CheckCircle2,
  Clock3,
  Euro,
  Gauge,
  History,
  LifeBuoy,
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  PauseCircle,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  XCircle,
} from "lucide-react";

type DriverStatus = "available" | "busy" | "offline";
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
  requested_at?: string | null;
  assigned_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type DriverLiveStatusRow = {
  driver_id: string;
  driver_name: string;
  taxi_code: string;
  plate: string;
  status: DriverStatus;
  current_zone?: string | null;
  total_earnings?: number | string | null;
  total_rides?: number | string | null;
  rating?: number | string | null;
};

type ActivityRow = {
  id: string;
  message: string;
  created_at: string;
};

function money(value: unknown) {
  return `${Number(value ?? 0).toFixed(2)} €`;
}

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: DriverStatus | RideStatus) {
  if (status === "available") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Disponible</Badge>;
  if (status === "busy") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Ocupado</Badge>;
  if (status === "offline") return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Desconectado</Badge>;
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
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

export default function DriverPanel() {
  const { user, logout, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const canUseRealApi = !isGuest && (user?.role === "driver" || user?.role === "admin");

  const [driverStatus, setDriverStatus] = useState<DriverStatus>("offline");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [taxiCode, setTaxiCode] = useState("TX-001");
  const [plate, setPlate] = useState("0000-TXM");
  const [zone, setZone] = useState("Centro");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setUserLocation(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 8000,
  });

  const pendingRidesQuery = trpc.system.taxiOps.driver.getPendingRides.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const activeRideQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const historyQuery = trpc.system.taxiOps.driver.getRideHistory.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 10000,
  });

  const activityQuery = trpc.system.taxiOps.activity.useQuery(undefined, {
    enabled: canUseRealApi,
    refetchInterval: 10000,
  });

  const invalidateDriverData = () => {
    utils.system.taxiOps.driver.getStatus.invalidate();
    utils.system.taxiOps.driver.getPendingRides.invalidate();
    utils.system.taxiOps.driver.getActiveRide.invalidate();
    utils.system.taxiOps.driver.getRideHistory.invalidate();
    utils.system.taxiOps.activity.invalidate();
  };

  const upsertStatusMutation = trpc.system.taxiOps.driver.upsertStatus.useMutation({
    onSuccess: invalidateDriverData,
    onError: (error) => setFormError(error.message),
  });

  const acceptRideMutation = trpc.system.taxiOps.driver.acceptRide.useMutation({
    onSuccess: invalidateDriverData,
    onError: (error) => setFormError(error.message),
  });

  const startRideMutation = trpc.system.taxiOps.driver.startRide.useMutation({
    onSuccess: invalidateDriverData,
    onError: (error) => setFormError(error.message),
  });

  const rejectRideMutation = trpc.system.taxiOps.driver.rejectRide.useMutation({
    onSuccess: invalidateDriverData,
    onError: (error) => setFormError(error.message),
  });

  const completeRideMutation = trpc.system.taxiOps.driver.completeRide.useMutation({
    onSuccess: invalidateDriverData,
    onError: (error) => setFormError(error.message),
  });

  const liveStatus = (statusQuery.data ?? null) as DriverLiveStatusRow | null;
  const pendingRides = (pendingRidesQuery.data ?? []) as TaxiRideRow[];
  const activeRide = (activeRideQuery.data ?? null) as TaxiRideRow | null;
  const history = (historyQuery.data ?? []) as TaxiRideRow[];
  const activity = (activityQuery.data ?? []) as ActivityRow[];

  useEffect(() => {
    if (!liveStatus) return;
    setDriverStatus(liveStatus.status);
    setTaxiCode(liveStatus.taxi_code || "TX-001");
    setPlate(liveStatus.plate || "0000-TXM");
    setZone(liveStatus.current_zone || "Centro");
  }, [liveStatus]);

  const saveStatus = async (status: DriverStatus = driverStatus) => {
    if (!canUseRealApi) {
      setFormError("Para operar en real debes iniciar sesión como conductor.");
      return;
    }
    setDriverStatus(status);
    await upsertStatusMutation.mutateAsync({
      status,
      taxiCode,
      plate,
      currentZone: zone,
      currentLat: userLocation?.latitude,
      currentLng: userLocation?.longitude,
    });
  };

  const acceptRide = async (rideId: string) => {
    await acceptRideMutation.mutateAsync({ rideId, taxiCode, plate });
  };

  const rejectRide = async (rideId: string) => {
    await rejectRideMutation.mutateAsync({ rideId });
  };

  const startRide = async (rideId: string) => {
    await startRideMutation.mutateAsync({ rideId });
  };

  const completeRide = async (rideId: string) => {
    await completeRideMutation.mutateAsync({ rideId });
  };

  const locationLabel = useMemo(() => {
    if (!userLocation) return "Ubicación no disponible";
    return `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
  }, [userLocation]);

  const isSaving =
    upsertStatusMutation.isPending ||
    acceptRideMutation.isPending ||
    rejectRideMutation.isPending ||
    startRideMutation.isPending ||
    completeRideMutation.isPending;

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
                El panel conductor ya no usa simulaciones. Para aceptar viajes reales debes iniciar sesión o registrarte como conductor.
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
              <Car className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun Driver</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Panel conductor real</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(driverStatus)}
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
                Datos reales Supabase · {user?.name ?? "Conductor"}
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Gestiona solicitudes reales</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Las solicitudes vienen de pasajeros reales en `taxi_rides`. Al aceptar, iniciar o finalizar se actualiza Supabase.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={() => saveStatus("available")} disabled={isSaving} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
                  {upsertStatusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
                  Disponible
                </Button>
                <Button onClick={() => saveStatus("offline")} disabled={isSaving} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Desconectar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Solicitudes</p>
                <p className="mt-2 text-2xl font-black">{pendingRides.length}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Ganancias</p>
                <p className="mt-2 text-2xl font-black">{money(liveStatus?.total_earnings)}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Viajes</p>
                <p className="mt-2 text-2xl font-black">{Number(liveStatus?.total_rides ?? 0)}</p>
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
        {(statusQuery.error || pendingRidesQuery.error || activeRideQuery.error || historyQuery.error) && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            Error conectando con Supabase: {statusQuery.error?.message || pendingRidesQuery.error?.message || activeRideQuery.error?.message || historyQuery.error?.message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Gauge} title="Estado" value={driverStatus === "available" ? "Disponible" : driverStatus === "busy" ? "Ocupado" : "Offline"} note="Estado real en Supabase" />
          <MetricCard icon={Clock3} title="Pendientes" value={String(pendingRides.length)} note="Solicitudes esperando" />
          <MetricCard icon={Euro} title="Ganancias" value={money(liveStatus?.total_earnings)} note="Total acumulado" />
          <MetricCard icon={Star} title="Rating" value={Number(liveStatus?.rating ?? 5).toFixed(1).replace(".", ",")} note="Perfil conductor" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <PanelCard icon={Navigation} title="Mapa operativo" description="Ubicación del conductor y zona de servicio">
              <div className="overflow-hidden rounded-3xl">
                <TaxiMap userLocation={userLocation || undefined} readOnly />
              </div>
            </PanelCard>

            <Tabs defaultValue="pending" className="space-y-4">
              <TabsList className="grid h-auto grid-cols-4 rounded-3xl bg-white/80 p-1 shadow-sm backdrop-blur-xl">
                <TabsTrigger value="pending" className="rounded-2xl py-3 font-black">Pendientes</TabsTrigger>
                <TabsTrigger value="active" className="rounded-2xl py-3 font-black">Activo</TabsTrigger>
                <TabsTrigger value="history" className="rounded-2xl py-3 font-black">Historial</TabsTrigger>
                <TabsTrigger value="activity" className="rounded-2xl py-3 font-black">Actividad</TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                <PanelCard icon={Bell} title="Solicitudes pendientes reales" description="Viajes creados por pasajeros y pendientes de conductor">
                  <div className="space-y-3">
                    {pendingRidesQuery.isLoading && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Cargando solicitudes...</p>}
                    {!pendingRidesQuery.isLoading && pendingRides.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">No hay solicitudes pendientes ahora.</p>}
                    {pendingRides.map((ride) => (
                      <RideCard key={ride.id} ride={ride} actions={
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button onClick={() => acceptRide(ride.id)} disabled={isSaving || Boolean(activeRide)} className="rounded-2xl bg-emerald-600 py-5 font-black text-white hover:bg-emerald-500">
                            {acceptRideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Aceptar real
                          </Button>
                          <Button onClick={() => rejectRide(ride.id)} disabled={isSaving} variant="outline" className="rounded-2xl border-red-200 bg-white py-5 font-black text-red-700 hover:bg-red-50">
                            <XCircle className="mr-2 h-4 w-4" />
                            Rechazar
                          </Button>
                        </div>
                      } />
                    ))}
                  </div>
                </PanelCard>
              </TabsContent>

              <TabsContent value="active">
                {activeRideQuery.isLoading ? (
                  <PanelCard icon={Loader2} title="Cargando viaje activo" description="Consultando Supabase">
                    <div className="py-8 text-center text-sm font-bold text-slate-500">Cargando...</div>
                  </PanelCard>
                ) : activeRide ? (
                  <PanelCard icon={Route} title="Viaje activo real" description="Control operativo del viaje aceptado">
                    <RideCard ride={activeRide} actions={
                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeRide.status === "assigned" && (
                          <Button onClick={() => startRide(activeRide.id)} disabled={isSaving} className="rounded-2xl bg-blue-600 py-5 font-black text-white hover:bg-blue-500">
                            {startRideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4" />}
                            Iniciar viaje
                          </Button>
                        )}
                        {(activeRide.status === "assigned" || activeRide.status === "in_progress") && (
                          <Button onClick={() => completeRide(activeRide.id)} disabled={isSaving} className="rounded-2xl bg-emerald-600 py-5 font-black text-white hover:bg-emerald-500">
                            {completeRideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                            Finalizar viaje
                          </Button>
                        )}
                      </div>
                    } />
                  </PanelCard>
                ) : (
                  <PanelCard icon={ShieldCheck} title="Sin viaje activo" description="Acepta una solicitud pendiente para empezar">
                    <div className="rounded-3xl bg-slate-50 p-6 text-center">
                      <p className="font-black text-slate-900">No tienes viaje activo</p>
                      <p className="mt-2 text-sm text-slate-500">Las solicitudes reales aparecen en la pestaña Pendientes.</p>
                    </div>
                  </PanelCard>
                )}
              </TabsContent>

              <TabsContent value="history">
                <PanelCard icon={History} title="Historial real" description="Viajes del conductor guardados en Supabase">
                  <div className="space-y-3">
                    {historyQuery.isLoading && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Cargando historial...</p>}
                    {!historyQuery.isLoading && history.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">No hay historial todavía.</p>}
                    {history.map((ride) => <RideCard key={ride.id} ride={ride} />)}
                  </div>
                </PanelCard>
              </TabsContent>

              <TabsContent value="activity">
                <PanelCard icon={Bell} title="Actividad real" description="Últimas acciones registradas en taxi_activity_logs">
                  <div className="space-y-3">
                    {activity.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Sin actividad registrada.</p>}
                    {activity.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                        <p className="font-bold text-slate-900">{item.message}</p>
                        <p className="text-xs text-slate-500">{dateLabel(item.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </PanelCard>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4">
            <PanelCard icon={Car} title="Datos del taxi" description="Se guardan con tu estado y al aceptar viajes">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="font-black text-slate-800">Código taxi</Label>
                  <Input value={taxiCode} onChange={(event) => setTaxiCode(event.target.value)} className="h-12 rounded-2xl bg-white" />
                </div>
                <div className="space-y-2">
                  <Label className="font-black text-slate-800">Matrícula</Label>
                  <Input value={plate} onChange={(event) => setPlate(event.target.value)} className="h-12 rounded-2xl bg-white" />
                </div>
                <div className="space-y-2">
                  <Label className="font-black text-slate-800">Zona</Label>
                  <Input value={zone} onChange={(event) => setZone(event.target.value)} className="h-12 rounded-2xl bg-white" />
                </div>
                <Button onClick={() => saveStatus(driverStatus)} disabled={isSaving} className="w-full rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">
                  Guardar estado real
                </Button>
              </div>
            </PanelCard>

            <PanelCard icon={Gauge} title="Disponibilidad" description="Actualiza tu estado en Supabase">
              <div className="space-y-3">
                <Select value={driverStatus} onValueChange={(value) => saveStatus(value as DriverStatus)}>
                  <SelectTrigger className="h-13 rounded-2xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponible</SelectItem>
                    <SelectItem value="busy">Ocupado</SelectItem>
                    <SelectItem value="offline">Desconectado</SelectItem>
                  </SelectContent>
                </Select>
                <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                  Este panel usa `system.taxiOps.driver`. No hay servicios demo.
                </div>
              </div>
            </PanelCard>

            <PanelCard icon={LifeBuoy} title="Ayuda" description="Funciones pendientes">
              <div className="grid gap-3">
                <Button disabled variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <LifeBuoy className="mr-3 h-5 w-5 text-indigo-600" /> Soporte en siguiente bloque
                </Button>
              </div>
            </PanelCard>
          </aside>
        </div>
      </main>
    </div>
  );
}

function RideCard({ ride, actions }: { ride: TaxiRideRow; actions?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">{ride.id.slice(0, 8)} · {ride.passenger_name ?? "Pasajero"}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Solicitado: {dateLabel(ride.requested_at)}</p>
        </div>
        {statusBadge(ride.status)}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
            <MapPin className="h-4 w-4 text-cyan-600" /> Recogida
          </p>
          <p className="text-sm text-slate-600">{ride.pickup_address}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
            <MapPin className="h-4 w-4 text-blue-600" /> Destino
          </p>
          <p className="text-sm text-slate-600">{ride.dropoff_address}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-50 p-3 text-center">
          <p className="text-xs font-bold text-slate-400">Importe</p>
          <p className="mt-1 font-black">{money(ride.estimated_fare)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 text-center">
          <p className="text-xs font-bold text-slate-400">Tiempo</p>
          <p className="mt-1 font-black">{ride.estimated_duration} min</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 text-center">
          <p className="text-xs font-bold text-slate-400">Distancia</p>
          <p className="mt-1 font-black">{ride.distance_km} km</p>
        </div>
      </div>

      {actions && <div className="mt-4">{actions}</div>}
    </div>
  );
}
