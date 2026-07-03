import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Car,
  CheckCircle2,
  Clock3,
  Euro,
  Gauge,
  History,
  LifeBuoy,
  LogOut,
  MapPin,
  Navigation,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  UserRound,
  XCircle,
} from "lucide-react";

type DriverStatus = "available" | "busy" | "offline";
type ServiceStatus = "pending" | "accepted" | "completed" | "rejected";

type DriverService = {
  id: string;
  passengerName: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFare: number;
  estimatedDuration: number;
  distanceKm: number;
  status: ServiceStatus;
  requestedAt: string;
};

type ActivityLog = {
  id: string;
  text: string;
  time: string;
};

const demoService = (): DriverService => ({
  id: `S-${Date.now().toString().slice(-5)}`,
  passengerName: "Ana Martínez",
  pickupAddress: "Estación central · Parada taxi 2",
  dropoffAddress: "Hospital municipal · Entrada principal",
  estimatedFare: 12.8,
  estimatedDuration: 14,
  distanceKm: 5.4,
  status: "pending",
  requestedAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
});

const nowLabel = () =>
  new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

function statusBadge(status: DriverStatus) {
  if (status === "available") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Disponible</Badge>;
  if (status === "busy") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En servicio</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Desconectado</Badge>;
}

function serviceBadge(status: ServiceStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>;
  if (status === "accepted") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Aceptado</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rechazado</Badge>;
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

export default function DriverPanel() {
  const { user, logout, isGuest } = useAuth() as any;
  const [driverStatus, setDriverStatus] = useState<DriverStatus>("offline");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [totalInQueue, setTotalInQueue] = useState(0);
  const [pendingService, setPendingService] = useState<DriverService | null>(null);
  const [activeService, setActiveService] = useState<DriverService | null>(null);
  const [history, setHistory] = useState<DriverService[]>([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [activity, setActivity] = useState<ActivityLog[]>([
    { id: "a1", text: "Panel conductor cargado", time: nowLabel() },
  ]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setUserLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const addActivity = (text: string) => {
    setActivity((current) => [{ id: String(Date.now()), text, time: nowLabel() }, ...current].slice(0, 6));
  };

  const handleStatusChange = (status: DriverStatus) => {
    setDriverStatus(status);
    if (status === "available") {
      setQueuePosition((current) => current ?? 3);
      setTotalInQueue((current) => current || 8);
      addActivity("Estado cambiado a disponible y añadido a la cola");
      return;
    }
    if (status === "busy") {
      setQueuePosition(null);
      addActivity("Estado cambiado a en servicio");
      return;
    }
    setQueuePosition(null);
    setTotalInQueue(0);
    addActivity("Conductor desconectado");
  };

  const joinQueue = () => {
    setDriverStatus("available");
    setQueuePosition(3);
    setTotalInQueue(8);
    addActivity("Te has unido a la cola de Centro");
  };

  const simulateIncomingService = () => {
    if (activeService) {
      addActivity("No se puede recibir otro servicio mientras hay uno activo");
      return;
    }
    const service = demoService();
    setPendingService(service);
    addActivity(`Nuevo servicio recibido: ${service.id}`);
  };

  const handleAcceptService = () => {
    if (!pendingService) return;
    const acceptedService = { ...pendingService, status: "accepted" as const };
    setActiveService(acceptedService);
    setPendingService(null);
    setDriverStatus("busy");
    setQueuePosition(null);
    addActivity(`Servicio aceptado: ${acceptedService.id}`);
  };

  const handleRejectService = () => {
    if (!pendingService) return;
    setHistory((current) => [{ ...pendingService, status: "rejected" }, ...current]);
    setPendingService(null);
    addActivity("Servicio rechazado");
  };

  const completeActiveService = () => {
    if (!activeService) return;
    const completedService = { ...activeService, status: "completed" as const };
    setHistory((current) => [completedService, ...current]);
    setTodayEarnings((current) => Number((current + activeService.estimatedFare).toFixed(2)));
    setTotalTrips((current) => current + 1);
    setActiveService(null);
    setDriverStatus("available");
    setQueuePosition(4);
    setTotalInQueue(9);
    addActivity(`Servicio finalizado: ${completedService.id}`);
  };

  const requestSupport = () => addActivity("Solicitud de soporte enviada al operador");
  const pauseService = () => {
    setDriverStatus("offline");
    setQueuePosition(null);
    addActivity("Pausa activada");
  };

  const locationLabel = useMemo(() => {
    if (!userLocation) return "Ubicación no disponible";
    return `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;
  }, [userLocation]);

  const queuePercent = queuePosition && totalInQueue ? Math.max(8, Math.round(((totalInQueue - queuePosition + 1) / totalInQueue) * 100)) : 0;

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
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Panel conductor</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isGuest && <Badge className="hidden bg-amber-100 text-amber-800 hover:bg-amber-100 sm:inline-flex">Modo prueba</Badge>}
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
                Turno activo · {user?.name ?? "Conductor invitado"}
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Trabaja desde una sola pantalla</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Controla tu estado, cola, servicios entrantes, viaje activo, ganancias e historial operativo.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={joinQueue} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
                  <Radio className="mr-2 h-4 w-4" />
                  Entrar en cola
                </Button>
                <Button onClick={simulateIncomingService} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <Bell className="mr-2 h-4 w-4" />
                  Simular servicio
                </Button>
                <Button onClick={pauseService} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Pausa
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Ubicación</p>
                <p className="mt-2 text-sm font-bold text-cyan-100">{locationLabel}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Cola</p>
                <p className="mt-2 text-2xl font-black">{queuePosition ? `#${queuePosition}` : "—"}</p>
                <p className="text-xs text-slate-300">{totalInQueue ? `${totalInQueue} conductores` : "Sin cola"}</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Ganancias</p>
                <p className="mt-2 text-2xl font-black">{todayEarnings.toFixed(2)} €</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm font-black">Viajes</p>
                <p className="mt-2 text-2xl font-black">{totalTrips}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Gauge} title="Estado" value={driverStatus === "available" ? "Libre" : driverStatus === "busy" ? "Ocupado" : "Offline"} note="Control operativo" />
          <MetricCard icon={Timer} title="Espera" value={queuePosition ? `${queuePosition}º` : "—"} note={queuePosition ? `de ${totalInQueue} en cola` : "Fuera de cola"} />
          <MetricCard icon={Euro} title="Hoy" value={`${todayEarnings.toFixed(2)} €`} note={`${totalTrips} viajes finalizados`} />
          <MetricCard icon={Star} title="Rating" value="4,9" note="Promedio demo" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <Navigation className="h-5 w-5 text-cyan-600" />
                  Mapa operativo
                </CardTitle>
                <CardDescription>Tu posición y zona de trabajo</CardDescription>
              </CardHeader>
              <CardContent className="overflow-hidden rounded-3xl p-0">
                <TaxiMap userLocation={userLocation || undefined} readOnly />
              </CardContent>
            </Card>

            <Tabs defaultValue="servicio" className="space-y-4">
              <TabsList className="grid h-auto grid-cols-3 rounded-3xl bg-white/80 p-1 shadow-sm backdrop-blur-xl">
                <TabsTrigger value="servicio" className="rounded-2xl py-3 font-black">Servicio</TabsTrigger>
                <TabsTrigger value="historial" className="rounded-2xl py-3 font-black">Historial</TabsTrigger>
                <TabsTrigger value="actividad" className="rounded-2xl py-3 font-black">Actividad</TabsTrigger>
              </TabsList>

              <TabsContent value="servicio" className="space-y-4">
                {pendingService && (
                  <Card className="border-amber-200 bg-amber-50/90 shadow-xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl font-black">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                        Nuevo servicio entrante
                      </CardTitle>
                      <CardDescription>Solicitud recibida a las {pendingService.requestedAt}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ServiceDetails service={pendingService} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button onClick={handleAcceptService} className="rounded-2xl bg-emerald-600 py-6 font-black text-white hover:bg-emerald-500">
                          <CheckCircle2 className="mr-2 h-5 w-5" /> Aceptar
                        </Button>
                        <Button onClick={handleRejectService} variant="outline" className="rounded-2xl border-red-200 bg-white py-6 font-black text-red-700 hover:bg-red-50">
                          <XCircle className="mr-2 h-5 w-5" /> Rechazar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {activeService && (
                  <Card className="border-blue-200 bg-blue-50/90 shadow-xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl font-black">
                        <Route className="h-5 w-5 text-blue-600" />
                        Servicio activo
                      </CardTitle>
                      <CardDescription>Completa el viaje al llegar al destino</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ServiceDetails service={activeService} />
                      <Button onClick={completeActiveService} className="w-full rounded-2xl bg-blue-600 py-6 font-black text-white hover:bg-blue-500">
                        Finalizar viaje <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!pendingService && !activeService && (
                  <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                    <CardContent className="p-8 text-center">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600">
                        <ShieldCheck className="h-7 w-7" />
                      </div>
                      <p className="text-xl font-black">Sin servicio activo</p>
                      <p className="mt-2 text-sm text-slate-500">Pulsa “Simular servicio” para probar el flujo completo.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="historial">
                <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <History className="h-5 w-5 text-cyan-600" /> Historial del turno
                    </CardTitle>
                    <CardDescription>Viajes finalizados o rechazados durante esta sesión</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {history.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500">Todavía no hay historial.</p>}
                    {history.map((service) => (
                      <div key={`${service.id}-${service.status}`} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{service.id} · {service.passengerName}</p>
                            <p className="mt-1 text-sm text-slate-500">{service.pickupAddress} → {service.dropoffAddress}</p>
                          </div>
                          {serviceBadge(service.status)}
                        </div>
                        <p className="mt-3 text-sm font-black text-slate-900">{service.estimatedFare.toFixed(2)} € · {service.estimatedDuration} min</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="actividad">
                <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Bell className="h-5 w-5 text-cyan-600" /> Actividad
                    </CardTitle>
                    <CardDescription>Últimas acciones del conductor</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {activity.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                        <p className="font-bold text-slate-900">{item.text}</p>
                        <p className="text-xs text-slate-500">{item.time}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl font-black">Estado de conductor</CardTitle>
                <CardDescription>Cambia tu disponibilidad</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={driverStatus} onValueChange={(value) => handleStatusChange(value as DriverStatus)}>
                  <SelectTrigger className="h-13 rounded-2xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponible</SelectItem>
                    <SelectItem value="busy">En servicio</SelectItem>
                    <SelectItem value="offline">Desconectado</SelectItem>
                  </SelectContent>
                </Select>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-black text-slate-600">Progreso en cola</p>
                    <p className="text-sm font-black text-slate-900">{queuePercent}%</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all" style={{ width: `${queuePercent}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl font-black">Acciones rápidas</CardTitle>
                <CardDescription>Herramientas del turno</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button onClick={simulateIncomingService} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <Bell className="mr-3 h-5 w-5 text-cyan-600" /> Recibir servicio demo
                </Button>
                <Button onClick={requestSupport} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <LifeBuoy className="mr-3 h-5 w-5 text-indigo-600" /> Pedir soporte
                </Button>
                <Button onClick={pauseService} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black">
                  <PauseCircle className="mr-3 h-5 w-5 text-amber-600" /> Pausar turno
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ServiceDetails({ service }: { service: DriverService }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">Pasajero</p>
            <p className="font-black">{service.passengerName}</p>
          </div>
        </div>
        {serviceBadge(service.status)}
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
          <MapPin className="h-4 w-4 text-cyan-600" /> Recogida
        </p>
        <p className="text-sm text-slate-600">{service.pickupAddress}</p>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
          <MapPin className="h-4 w-4 text-blue-600" /> Destino
        </p>
        <p className="text-sm text-slate-600">{service.dropoffAddress}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
          <p className="text-xs font-bold text-slate-400">Importe</p>
          <p className="mt-1 font-black">{service.estimatedFare.toFixed(2)} €</p>
        </div>
        <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
          <p className="text-xs font-bold text-slate-400">Tiempo</p>
          <p className="mt-1 font-black">{service.estimatedDuration} min</p>
        </div>
        <div className="rounded-3xl bg-white p-4 text-center shadow-sm">
          <p className="text-xs font-bold text-slate-400">Distancia</p>
          <p className="mt-1 font-black">{service.distanceKm} km</p>
        </div>
      </div>
    </div>
  );
}
