import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CalendarClock, Car, Clock3, ListOrdered, Loader2, MapPinned, RefreshCw, Route, ShieldAlert, Users } from "lucide-react";

type Filter = "all" | "available" | "busy" | "stale";

function ageLabel(value?: string | null) {
  if (!value) return "Sin señal";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h`;
}

function fresh(value?: string | null) {
  return Boolean(value && Date.now() - new Date(value).getTime() <= 5 * 60 * 1000);
}

export default function AdminOperationsCenterPage() {
  const { user, isGuest, loading } = useAuth() as any;
  const allowed = !isGuest && user?.role === "admin";
  const [filter, setFilter] = useState<Filter>("all");
  const snapshot = trpc.system.taxiAdminOperations.snapshot.useQuery(undefined, { enabled: allowed, retry: false, refetchInterval: 5000, refetchOnWindowFocus: true });
  const [bookingRun, setBookingRun] = useState<string | null>(null);
  const processBookings = trpc.system.taxiServerDispatch.admin.processScheduledBookings.useMutation({
    onSuccess: (result: any) => {
      const r = result ?? {};
      setBookingRun(`Recordatorios 24h/2h/30m: ${r.reminders_24h ?? 0}/${r.reminders_2h ?? 0}/${r.reminders_30m ?? 0} · activadas: ${r.rides_dispatched ?? 0} · diferidas: ${r.rides_deferred ?? 0}`);
      snapshot.refetch();
    },
    onError: (error: any) => setBookingRun(`Error: ${error?.message ?? "desconocido"}`),
  });

  const data = snapshot.data as any;
  const drivers = useMemo(() => {
    const rows = data?.drivers ?? [];
    return rows.filter((driver: any) => {
      if (filter === "available") return driver.status === "available";
      if (filter === "busy") return driver.status === "busy";
      if (filter === "stale") return !fresh(driver.updated_at);
      return true;
    });
  }, [data?.drivers, filter]);

  const positionedDrivers = drivers.filter((driver: any) => Number.isFinite(Number(driver.current_lat)) && Number.isFinite(Number(driver.current_lng)));
  const rides = data?.rides ?? [];
  const alerts = data?.safety ?? [];
  const center: [number, number] = positionedDrivers.length ? [Number(positionedDrivers[0].current_lat), Number(positionedDrivers[0].current_lng)] : [41.3874, 2.1686];

  if (loading) return <div className="p-8 text-center font-bold">Comprobando acceso…</div>;
  if (!allowed) return <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-800">Centro reservado a administración.</div>;

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 pb-12 pt-4 text-black">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-sm font-black text-zinc-500">Seguimiento operativo en tiempo real</p><h2 className="flex items-center gap-2 text-2xl font-black tracking-tight"><MapPinned className="h-7 w-7" />Centro de operaciones</h2><p className="mt-1 text-sm font-semibold text-zinc-500">Conductores, viajes e incidencias actualizados cada 5 segundos.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{data?.generatedAt && <Badge className="h-10 justify-center bg-zinc-200 px-4 text-zinc-700 hover:bg-zinc-200">Actualizado {new Date(data.generatedAt).toLocaleTimeString("es-ES")}</Badge>}<Button onClick={() => snapshot.refetch()} disabled={snapshot.isFetching} className="h-14 rounded-2xl bg-black px-6 font-black text-white">{snapshot.isFetching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}Actualizar</Button></div>
        </header>

        {snapshot.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{snapshot.error.message}</div>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat title="Disponibles" value={data?.summary?.availableDrivers ?? 0} icon={Car} />
          <Stat title="Con señal" value={data?.summary?.freshDrivers ?? 0} icon={Users} />
          <Stat title="Pendientes" value={data?.summary?.pendingRides ?? 0} icon={Clock3} />
          <Stat title="Asignados" value={data?.summary?.assignedRides ?? 0} icon={Route} />
          <Stat title="En curso" value={data?.summary?.inProgressRides ?? 0} icon={MapPinned} />
          <Stat title="SOS críticos" value={data?.summary?.criticalAlerts ?? 0} icon={ShieldAlert} urgent={(data?.summary?.criticalAlerts ?? 0) > 0} />
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight"><ListOrdered className="h-5 w-5" />Colas FIFO por zona <span className="text-sm font-bold text-zinc-500">({data?.summary?.queuedDrivers ?? 0} conductores en cola)</span></h3>
            <div className="flex items-center gap-2">
              {bookingRun && <Badge className="bg-zinc-200 px-3 text-zinc-700 hover:bg-zinc-200">{bookingRun}</Badge>}
              <Button onClick={() => processBookings.mutate()} disabled={processBookings.isPending} className="h-11 rounded-2xl bg-black px-4 text-sm font-black text-white">
                {processBookings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}Procesar reservas
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(data?.queues ?? []).map((zone: any) => (
              <Card key={zone.zoneId} className="rounded-3xl border-black/5 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black uppercase tracking-tight text-zinc-500">{zone.zoneName}</p>
                    <Badge className={zone.waiting > 0 ? "bg-black text-white" : "bg-zinc-200 text-zinc-600"}>{zone.waiting} en cola</Badge>
                  </div>
                  <p className="mt-2 text-xl font-black">{zone.head ? zone.head.driverName : "Sin cola"}</p>
                  <p className="text-xs font-bold text-zinc-400">{zone.head ? `Turno de ${zone.head.driverName} · #${zone.head.position}` : "Nadie esperando en la zona"}</p>
                  <div className="mt-2 space-y-1">
                    {(zone.members ?? []).slice(0, 5).map((member: any) => (
                      <p key={member.driverId} className="truncate text-xs font-semibold text-zinc-500">#{member.position} · {member.driverName}</p>
                    ))}
                    {(zone.members?.length ?? 0) > 5 && <p className="text-xs font-bold text-zinc-400">+{(zone.members?.length ?? 0) - 5} más</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(data?.queues ?? []).length === 0 && <p className="text-sm font-bold text-zinc-500">Sin zonas con cola configuradas.</p>}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <Card className="overflow-hidden rounded-[2rem] border-black/5 bg-white shadow-sm">
            <CardHeader className="space-y-4 border-b border-zinc-200"><CardTitle className="text-2xl font-black">Mapa operativo</CardTitle><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["all", "available", "busy", "stale"] as Filter[]).map((value) => <Button key={value} variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className="h-12 rounded-2xl font-black">{value === "all" ? "Todos" : value === "available" ? "Libres" : value === "busy" ? "Ocupados" : "Sin señal"}</Button>)}</div></CardHeader>
            <CardContent className="p-0">
              <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[620px] w-full">
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {positionedDrivers.map((driver: any) => <CircleMarker key={driver.driver_id} center={[Number(driver.current_lat), Number(driver.current_lng)]} radius={driver.status === "available" ? 9 : 7} pathOptions={{ color: driver.status === "available" ? "#10b981" : driver.status === "busy" ? "#f59e0b" : "#64748b", fillOpacity: 0.9 }}><Popup><strong>{driver.driver_name || driver.taxi_code || "Conductor"}</strong><br />{driver.plate || "Sin matrícula"}<br />Estado: {driver.status}<br />Señal: {ageLabel(driver.updated_at)}</Popup></CircleMarker>)}
                {rides.filter((ride: any) => Number.isFinite(Number(ride.pickup_lat)) && Number.isFinite(Number(ride.pickup_lng))).map((ride: any) => <CircleMarker key={`ride-${ride.id}`} center={[Number(ride.pickup_lat), Number(ride.pickup_lng)]} radius={7} pathOptions={{ color: ride.status === "pending" ? "#ef4444" : "#111111", fillOpacity: 0.75 }}><Popup><strong>Viaje {String(ride.id).slice(0, 8)}</strong><br />{ride.pickup_address || "Recogida"}<br />Estado: {ride.status}</Popup></CircleMarker>)}
              </MapContainer>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Panel title={`Alertas activas (${alerts.length})`} icon={AlertTriangle}>
              {alerts.length === 0 ? <Empty text="No hay incidencias activas." /> : alerts.slice(0, 8).map((alert: any) => <Link key={alert.id} href="/admin/safety"><div className={`cursor-pointer rounded-2xl border p-4 transition hover:border-zinc-400 ${alert.priority === "critical" || alert.category === "sos" ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}><div className="flex items-center justify-between gap-2"><p className="font-black">{alert.title}</p><Badge className={alert.status === "open" ? "bg-red-600" : "bg-amber-600"}>{alert.status}</Badge></div><p className="mt-1 line-clamp-2 text-xs font-semibold text-zinc-500">{alert.description || alert.category}</p></div></Link>)}
            </Panel>
            <Panel title={`Viajes activos (${rides.length})`} icon={Route}>
              {rides.length === 0 ? <Empty text="No hay viajes activos." /> : rides.slice(0, 10).map((ride: any) => <div key={ride.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center justify-between gap-2"><p className="font-black">{ride.pickup_address || "Recogida"}</p><Badge className={ride.status === "pending" ? "bg-red-600" : ride.status === "in_progress" ? "bg-black" : "bg-amber-600"}>{ride.status}</Badge></div><p className="mt-1 truncate text-xs font-semibold text-zinc-500">→ {ride.dropoff_address || "Destino pendiente"}</p><p className="mt-2 text-xs font-bold text-zinc-400">Conductor: {ride.driver_id ? String(ride.driver_id).slice(0, 12) : "sin asignar"}</p></div>)}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ title, value, icon: Icon, urgent = false }: { title: string; value: number; icon: typeof Car; urgent?: boolean }) {
  return <Card className={`rounded-[1.75rem] border-black/5 shadow-sm ${urgent ? "bg-red-600 text-white" : "bg-white text-black"}`}><CardContent className="flex min-h-28 items-center justify-between p-4"><div><p className={`text-xs font-black uppercase ${urgent ? "text-white/70" : "text-zinc-500"}`}>{title}</p><p className="mt-1 text-3xl font-black">{value}</p></div><span className={`rounded-full p-3 ${urgent ? "bg-white text-red-600" : "bg-zinc-100 text-black"}`}><Icon className="h-6 w-6" /></span></CardContent></Card>;
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Route; children: React.ReactNode }) {
  return <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-xl font-black"><Icon className="h-6 w-6" />{title}</CardTitle></CardHeader><CardContent className="max-h-[360px] space-y-2 overflow-y-auto">{children}</CardContent></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 p-5 text-center text-sm font-bold text-zinc-500">{text}</div>;
}
