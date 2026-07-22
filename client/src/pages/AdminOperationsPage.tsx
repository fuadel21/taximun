import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Car, Clock3, LocateFixed, MapPin, RefreshCw, Route, ShieldAlert, Users } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Driver = { driver_id: string; driver_name?: string | null; taxi_code?: string | null; plate?: string | null; status: string; current_lat?: number | null; current_lng?: number | null; updated_at?: string | null };
type Ride = { id: string; driver_id?: string | null; status: string; pickup_address?: string | null; dropoff_address?: string | null; pickup_lat?: number | null; pickup_lng?: number | null; requested_at?: string | null; created_at?: string | null };
type Safety = { id: string; ride_id?: string | null; priority: string; category: string; status: string; title: string; lat?: number | null; lng?: number | null; created_at?: string | null };

function mapsUrl(lat?: number | null, lng?: number | null) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
}

function ago(value?: string | null) {
  if (!value) return "sin señal";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)} min`;
}

export default function AdminOperationsPage() {
  const { user, isGuest, loading } = useAuth() as any;
  const allowed = !isGuest && user?.role === "admin";
  const query = trpc.system.taxiAdminOperations.snapshot.useQuery(undefined, {
    enabled: allowed,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  if (loading) return <div className="p-8 text-center font-bold">Comprobando sesión…</div>;
  if (!allowed) return <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-800">Acceso exclusivo para administración.</div>;

  const data = query.data as any;
  const drivers = (data?.drivers ?? []) as Driver[];
  const rides = (data?.rides ?? []) as Ride[];
  const safety = (data?.safety ?? []) as Safety[];
  const summary = data?.summary ?? {};

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button asChild variant="ghost" className="mb-2 -ml-3 text-slate-300 hover:bg-white/10 hover:text-white"><Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" />Volver al panel</Link></Button>
            <h1 className="flex items-center gap-3 text-3xl font-black"><LocateFixed className="h-8 w-8 text-cyan-400" />Centro de mando operativo</h1>
            <p className="mt-1 text-sm font-semibold text-slate-400">Conductores, servicios e incidencias actualizados cada 5 segundos.</p>
          </div>
          <Button onClick={() => query.refetch()} disabled={query.isFetching} className="rounded-2xl bg-cyan-500 font-black text-slate-950 hover:bg-cyan-400"><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Actualizar ahora</Button>
        </header>

        {query.error && <div className="rounded-3xl border border-red-500/40 bg-red-950/70 p-4 font-bold text-red-200">{query.error.message}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
          <Stat label="Conectados" value={summary.driversOnline ?? 0} icon={Users} />
          <Stat label="Disponibles" value={summary.driversAvailable ?? 0} icon={Car} />
          <Stat label="Ocupados" value={summary.driversBusy ?? 0} icon={Route} />
          <Stat label="Pendientes" value={summary.pendingRides ?? 0} icon={Clock3} />
          <Stat label="En servicio" value={summary.activeRides ?? 0} icon={MapPin} />
          <Stat label="Ofertas" value={summary.pendingOffers ?? 0} icon={RefreshCw} />
          <Stat label="SOS" value={summary.criticalAlerts ?? 0} icon={ShieldAlert} urgent={(summary.criticalAlerts ?? 0) > 0} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
          <Card className="overflow-hidden border-white/10 bg-slate-900 text-white">
            <CardHeader className="border-b border-white/10"><CardTitle>Mapa operativo de flota</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.12),_transparent_55%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]">
                <div className="absolute inset-0 flex items-center justify-center text-center text-sm font-bold text-slate-600">Selecciona un conductor para abrir su posición exacta</div>
                <div className="relative z-10 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {drivers.filter((d) => mapsUrl(d.current_lat, d.current_lng)).map((driver) => {
                    const url = mapsUrl(driver.current_lat, driver.current_lng)!;
                    const fresh = driver.updated_at && Date.now() - new Date(driver.updated_at).getTime() < 180000;
                    return <a key={driver.driver_id} href={url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur transition hover:border-cyan-400/70">
                      <div className="flex items-center justify-between gap-2"><p className="truncate font-black">{driver.driver_name || driver.taxi_code || "Conductor"}</p><span className={`h-3 w-3 rounded-full ${fresh ? driver.status === "available" ? "bg-emerald-400" : "bg-amber-400" : "bg-slate-600"}`} /></div>
                      <p className="mt-1 text-xs font-bold text-slate-400">{driver.plate || driver.taxi_code || driver.driver_id.slice(0, 10)}</p>
                      <p className="mt-2 text-[11px] font-black uppercase text-cyan-300">{driver.status} · GPS {ago(driver.updated_at)}</p>
                    </a>;
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-900 text-white">
            <CardHeader className="border-b border-white/10"><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-400" />Incidencias activas</CardTitle></CardHeader>
            <CardContent className="space-y-3 p-4">
              {safety.length === 0 && <div className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-300">No hay incidencias activas.</div>}
              {safety.map((report) => <div key={report.id} className={`rounded-2xl border p-3 ${(report.priority === "critical" || report.category === "sos") ? "border-red-500/50 bg-red-950/60" : "border-amber-500/30 bg-amber-950/30"}`}>
                <div className="flex items-start justify-between gap-2"><p className="font-black">{report.title}</p><Badge className="bg-red-600">{report.priority}</Badge></div>
                <p className="mt-2 text-xs font-bold text-slate-400">{report.ride_id ? `Viaje ${report.ride_id.slice(0, 10)}` : "Sin viaje asociado"} · {ago(report.created_at)}</p>
                <div className="mt-3 flex gap-2"><Button asChild size="sm" className="rounded-xl bg-red-600 font-black"><Link href="/admin/safety">Atender</Link></Button>{mapsUrl(report.lat, report.lng) && <Button asChild size="sm" variant="outline" className="rounded-xl border-white/20 bg-transparent text-white"><a href={mapsUrl(report.lat, report.lng)!} target="_blank" rel="noreferrer">Ubicación</a></Button>}</div>
              </div>)}
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-slate-900 text-white">
          <CardHeader className="border-b border-white/10"><CardTitle>Servicios activos y pendientes</CardTitle></CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {rides.map((ride) => <div key={ride.id} className="rounded-2xl border border-white/10 bg-slate-950 p-4">
              <div className="flex items-center justify-between gap-2"><Badge className={ride.status === "pending" ? "bg-amber-500 text-slate-950" : ride.status === "in_progress" ? "bg-cyan-500 text-slate-950" : "bg-blue-600"}>{ride.status}</Badge><span className="text-xs font-bold text-slate-500">{ago(ride.requested_at || ride.created_at)}</span></div>
              <p className="mt-3 truncate text-sm font-black">{ride.pickup_address || "Recogida sin dirección"}</p><p className="mt-1 truncate text-xs font-bold text-slate-400">→ {ride.dropoff_address || "Destino sin dirección"}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="rounded-xl border-white/20 bg-transparent text-white"><Link href={`/admin/journey-test`}>Auditar</Link></Button>{mapsUrl(ride.pickup_lat, ride.pickup_lng) && <Button asChild size="sm" variant="outline" className="rounded-xl border-white/20 bg-transparent text-white"><a href={mapsUrl(ride.pickup_lat, ride.pickup_lng)!} target="_blank" rel="noreferrer">Recogida</a></Button>}</div>
            </div>)}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Stat({ label, value, icon: Icon, urgent = false }: { label: string; value: number; icon: typeof Car; urgent?: boolean }) {
  return <Card className={`border-white/10 ${urgent ? "bg-red-600 text-white" : "bg-slate-900 text-white"}`}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-black uppercase opacity-70">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div><Icon className="h-6 w-6 opacity-80" /></CardContent></Card>;
}
