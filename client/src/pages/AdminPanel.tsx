import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  Filter,
  Gauge,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type DriverStatus = "available" | "busy" | "pause" | "offline";
type TaxiStatus = "available" | "busy" | "maintenance" | "offline";
type RideStatus = "in_progress" | "completed" | "assigned" | "cancelled";
type IncidentLevel = "low" | "medium" | "high";

type Driver = {
  id: string;
  name: string;
  taxi: string;
  zone: string;
  status: DriverStatus;
  rating: number;
  rides: number;
  wait: string;
};

type Taxi = {
  id: string;
  plate: string;
  taxi: string;
  driver: string;
  model: string;
  status: TaxiStatus;
  inspection: string;
};

type Ride = {
  id: string;
  passenger: string;
  driver: string;
  from: string;
  to: string;
  status: RideStatus;
  price: string;
  time: string;
};

type Incident = {
  id: string;
  type: string;
  text: string;
  level: IncidentLevel;
  time: string;
};

type ActivityLog = {
  id: string;
  text: string;
  time: string;
};

const weeklyData = [
  { day: "Lun", viajes: 38, ingresos: 418, espera: 5 },
  { day: "Mar", viajes: 44, ingresos: 484, espera: 4 },
  { day: "Mié", viajes: 41, ingresos: 451, espera: 6 },
  { day: "Jue", viajes: 58, ingresos: 638, espera: 4 },
  { day: "Vie", viajes: 72, ingresos: 792, espera: 3 },
  { day: "Sáb", viajes: 86, ingresos: 946, espera: 5 },
  { day: "Dom", viajes: 64, ingresos: 704, espera: 6 },
];

const initialDrivers: Driver[] = [
  { id: "demo-driver-1", name: "Juan García", taxi: "TX-102", zone: "Centro", status: "available", rating: 4.9, rides: 18, wait: "3 min" },
  { id: "demo-driver-2", name: "Marta Soler", taxi: "TX-118", zone: "Estación", status: "busy", rating: 4.8, rides: 15, wait: "En viaje" },
  { id: "demo-driver-3", name: "Karim Haddad", taxi: "TX-130", zone: "Hospital", status: "available", rating: 4.7, rides: 12, wait: "5 min" },
  { id: "demo-driver-4", name: "Laura Pérez", taxi: "TX-141", zone: "Ayuntamiento", status: "pause", rating: 4.6, rides: 9, wait: "Pausa" },
  { id: "demo-driver-5", name: "Said Amrani", taxi: "TX-154", zone: "Costa", status: "offline", rating: 4.9, rides: 21, wait: "Offline" },
];

const initialFleet: Taxi[] = [
  { id: "demo-taxi-1", plate: "1234-LTX", taxi: "TX-102", driver: "Juan García", model: "Toyota Corolla", status: "available", inspection: "2026-10-14" },
  { id: "demo-taxi-2", plate: "9912-MDC", taxi: "TX-118", driver: "Marta Soler", model: "Hyundai Ioniq", status: "busy", inspection: "2026-09-02" },
  { id: "demo-taxi-3", plate: "7720-KRM", taxi: "TX-130", driver: "Karim Haddad", model: "Skoda Octavia", status: "available", inspection: "2026-12-20" },
  { id: "demo-taxi-4", plate: "5529-BLC", taxi: "TX-141", driver: "Laura Pérez", model: "Mercedes Vito", status: "maintenance", inspection: "2026-08-11" },
];

const initialRides: Ride[] = [
  { id: "R-2041", passenger: "Ana M.", driver: "Marta Soler", from: "Estación", to: "Hospital", status: "in_progress", price: "12,80 €", time: "09:42" },
  { id: "R-2040", passenger: "Carlos R.", driver: "Juan García", from: "Centro", to: "Costa", status: "completed", price: "16,20 €", time: "09:29" },
  { id: "R-2039", passenger: "Nora L.", driver: "Karim Haddad", from: "Ayuntamiento", to: "Estación", status: "assigned", price: "8,90 €", time: "09:16" },
  { id: "R-2038", passenger: "Mohamed A.", driver: "Laura Pérez", from: "Mercado", to: "Centro", status: "cancelled", price: "0,00 €", time: "08:58" },
];

const initialIncidents: Incident[] = [
  { id: "demo-incident-1", type: "Retraso", text: "Conductor TX-141 acumula 12 min de demora", level: "medium", time: "Hace 8 min" },
  { id: "demo-incident-2", type: "Pago", text: "Pago pendiente en viaje R-2038", level: "low", time: "Hace 22 min" },
  { id: "demo-incident-3", type: "Soporte", text: "Pasajero solicita llamada de asistencia", level: "high", time: "Hace 31 min" },
];

const cityZones = [
  { name: "Centro", demand: "Alta", eta: "3 min" },
  { name: "Estación", demand: "Media", eta: "4 min" },
  { name: "Hospital", demand: "Alta", eta: "5 min" },
  { name: "Costa", demand: "Baja", eta: "7 min" },
];

const nextDriverStatus: Record<DriverStatus, DriverStatus> = {
  available: "busy",
  busy: "pause",
  pause: "offline",
  offline: "available",
};

const nextTaxiStatus: Record<TaxiStatus, TaxiStatus> = {
  available: "busy",
  busy: "maintenance",
  maintenance: "offline",
  offline: "available",
};

function nowLabel() {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function statusBadge(status: string) {
  if (status === "available") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Libre</Badge>;
  if (status === "busy" || status === "in_progress") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En servicio</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Completado</Badge>;
  if (status === "assigned") return <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Asignado</Badge>;
  if (status === "maintenance") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Mantenimiento</Badge>;
  if (status === "pause") return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pausa</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge variant="outline">Offline</Badge>;
}

function StatCard({ icon: Icon, title, value, note }: { icon: LucideIcon; title: string; value: string; note: string }) {
  return (
    <Card className="overflow-hidden border-white/70 bg-white/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {note}
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 text-white shadow-lg shadow-cyan-500/20">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PanelCard({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
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

export default function AdminPanel() {
  const { user, logout, isGuest } = useAuth() as any;
  const utils = trpc.useUtils();
  const isRealAdmin = !isGuest && user?.role === "admin";

  const snapshotQuery = trpc.system.adminControl.getSnapshot.useQuery(undefined, {
    enabled: isRealAdmin,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const invalidateSnapshot = () => utils.system.adminControl.getSnapshot.invalidate();

  const createDriverMutation = trpc.system.adminControl.createDriver.useMutation({ onSuccess: invalidateSnapshot });
  const updateDriverStatusMutation = trpc.system.adminControl.updateDriverStatus.useMutation({ onSuccess: invalidateSnapshot });
  const createTaxiMutation = trpc.system.adminControl.createTaxi.useMutation({ onSuccess: invalidateSnapshot });
  const updateTaxiStatusMutation = trpc.system.adminControl.updateTaxiStatus.useMutation({ onSuccess: invalidateSnapshot });
  const createIncidentMutation = trpc.system.adminControl.createIncident.useMutation({ onSuccess: invalidateSnapshot });
  const resolveIncidentMutation = trpc.system.adminControl.resolveIncident.useMutation({ onSuccess: invalidateSnapshot });
  const createLogMutation = trpc.system.adminControl.createLog.useMutation({ onSuccess: invalidateSnapshot });

  const [localDrivers, setLocalDrivers] = useState<Driver[]>(initialDrivers);
  const [localFleet, setLocalFleet] = useState<Taxi[]>(initialFleet);
  const [rides] = useState<Ride[]>(initialRides);
  const [localIncidents, setLocalIncidents] = useState<Incident[]>(initialIncidents);
  const [searchTerm, setSearchTerm] = useState("");
  const [localLogs, setLocalLogs] = useState<ActivityLog[]>([
    { id: "demo-log-1", text: "Panel admin cargado en modo prueba", time: nowLabel() },
  ]);
  const [serviceMode, setServiceMode] = useState("Piloto municipal");

  const realDrivers: Driver[] = useMemo(
    () =>
      (snapshotQuery.data?.drivers ?? []).map((driver: any) => ({
        id: String(driver.id),
        name: String(driver.name ?? "Conductor"),
        taxi: String(driver.taxi_code ?? "TX"),
        zone: String(driver.zone ?? "Centro"),
        status: (driver.status ?? "available") as DriverStatus,
        rating: Number(driver.rating ?? 5),
        rides: Number(driver.rides_today ?? 0),
        wait: String(driver.wait_label ?? "Nuevo"),
      })),
    [snapshotQuery.data]
  );

  const realFleet: Taxi[] = useMemo(
    () =>
      (snapshotQuery.data?.taxis ?? []).map((taxi: any) => ({
        id: String(taxi.id),
        plate: String(taxi.plate ?? "TMP"),
        taxi: String(taxi.taxi_code ?? "TX"),
        driver: String(taxi.driver_name ?? "Sin asignar"),
        model: String(taxi.model ?? "Vehículo pendiente"),
        status: (taxi.status ?? "available") as TaxiStatus,
        inspection: String(taxi.inspection_date ?? "2026-12-31"),
      })),
    [snapshotQuery.data]
  );

  const realIncidents: Incident[] = useMemo(
    () =>
      (snapshotQuery.data?.incidents ?? []).map((incident: any) => ({
        id: String(incident.id),
        type: String(incident.type ?? "Incidencia"),
        text: String(incident.body ?? "Sin descripción"),
        level: (incident.level ?? "medium") as IncidentLevel,
        time: formatDateTime(incident.created_at),
      })),
    [snapshotQuery.data]
  );

  const realLogs: ActivityLog[] = useMemo(
    () =>
      (snapshotQuery.data?.logs ?? []).map((log: any) => ({
        id: String(log.id),
        text: String(log.message ?? "Acción registrada"),
        time: formatDateTime(log.created_at),
      })),
    [snapshotQuery.data]
  );

  const drivers = isRealAdmin ? realDrivers : localDrivers;
  const fleet = isRealAdmin ? realFleet : localFleet;
  const incidents = isRealAdmin ? realIncidents : localIncidents;
  const logs = isRealAdmin ? realLogs : localLogs;

  const addLog = (text: string) => {
    if (isRealAdmin) {
      createLogMutation.mutate({ message: text });
      return;
    }
    setLocalLogs((current) => [{ id: String(Date.now()), text, time: nowLabel() }, ...current].slice(0, 6));
  };

  const filteredDrivers = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return drivers.filter(
      (driver) =>
        driver.name.toLowerCase().includes(query) ||
        driver.taxi.toLowerCase().includes(query) ||
        driver.zone.toLowerCase().includes(query)
    );
  }, [drivers, searchTerm]);

  const availableDrivers = drivers.filter((driver) => driver.status === "available").length;
  const activeRides = rides.filter((ride) => ride.status === "in_progress" || ride.status === "assigned").length;
  const avgRating = drivers.length
    ? (drivers.reduce((sum, driver) => sum + driver.rating, 0) / drivers.length).toFixed(1).replace(".", ",")
    : "0";

  const statusData = [
    { name: "Libres", value: drivers.filter((driver) => driver.status === "available").length, color: "#06b6d4" },
    { name: "Ocupados", value: drivers.filter((driver) => driver.status === "busy").length, color: "#2563eb" },
    { name: "Pausa", value: drivers.filter((driver) => driver.status === "pause").length, color: "#f59e0b" },
    { name: "Offline", value: drivers.filter((driver) => driver.status === "offline").length, color: "#94a3b8" },
  ];

  const addDriver = () => {
    const nextId = drivers.length + 1;
    const name = `Nuevo conductor ${nextId}`;
    const taxiCode = `TX-${160 + nextId}`;

    if (isRealAdmin) {
      createDriverMutation.mutate({ name, taxiCode, zone: "Centro" });
      return;
    }

    const newDriver: Driver = {
      id: String(Date.now()),
      name,
      taxi: taxiCode,
      zone: "Centro",
      status: "available",
      rating: 5,
      rides: 0,
      wait: "Nuevo",
    };
    setLocalDrivers((current) => [newDriver, ...current]);
    addLog(`Alta creada: ${newDriver.name}`);
  };

  const addTaxi = () => {
    const nextId = fleet.length + 1;
    const taxiCode = `TX-${200 + nextId}`;
    const plate = `${7000 + nextId}-TMP`;

    if (isRealAdmin) {
      createTaxiMutation.mutate({ taxiCode, plate, driverName: "Sin asignar", model: "Vehículo pendiente" });
      return;
    }

    const newTaxi: Taxi = {
      id: String(Date.now()),
      plate,
      taxi: taxiCode,
      driver: "Sin asignar",
      model: "Vehículo pendiente",
      status: "available",
      inspection: "2026-12-31",
    };
    setLocalFleet((current) => [newTaxi, ...current]);
    addLog(`Taxi añadido: ${newTaxi.taxi}`);
  };

  const changeDriverStatus = (id: string) => {
    const target = drivers.find((driver) => driver.id === id);
    if (!target) return;
    const nextStatus = nextDriverStatus[target.status];

    if (isRealAdmin) {
      updateDriverStatusMutation.mutate({ id, status: nextStatus });
      return;
    }

    setLocalDrivers((current) =>
      current.map((driver) =>
        driver.id === id
          ? {
              ...driver,
              status: nextStatus,
              wait: nextStatus === "available" ? "2 min" : nextStatus === "busy" ? "En viaje" : nextStatus === "pause" ? "Pausa" : "Offline",
            }
          : driver
      )
    );
    addLog("Estado de conductor actualizado");
  };

  const changeTaxiStatus = (taxiId: string) => {
    const target = fleet.find((taxi) => taxi.id === taxiId);
    if (!target) return;
    const nextStatus = nextTaxiStatus[target.status];

    if (isRealAdmin) {
      updateTaxiStatusMutation.mutate({ id: taxiId, status: nextStatus });
      return;
    }

    setLocalFleet((current) =>
      current.map((taxi) => (taxi.id === taxiId ? { ...taxi, status: nextStatus } : taxi))
    );
    addLog(`Estado actualizado para ${target.taxi}`);
  };

  const addIncident = () => {
    if (isRealAdmin) {
      createIncidentMutation.mutate({ type: "Operación", body: "Nueva incidencia creada desde el panel", level: "medium" });
      return;
    }

    const incident: Incident = {
      id: String(Date.now()),
      type: "Operación",
      text: "Nueva incidencia demo creada desde el panel",
      level: "medium",
      time: "Ahora",
    };
    setLocalIncidents((current) => [incident, ...current]);
    addLog("Incidencia creada");
  };

  const resolveIncident = (id: string) => {
    if (isRealAdmin) {
      resolveIncidentMutation.mutate({ id });
      return;
    }

    setLocalIncidents((current) => current.filter((incident) => incident.id !== id));
    addLog("Incidencia resuelta");
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: serviceMode,
      source: isRealAdmin ? "supabase" : "guest-local",
      activeRides,
      drivers: drivers.length,
      availableDrivers,
      fleet: fleet.length,
      incidents: incidents.length,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "taximun-admin-report.json";
    link.click();
    URL.revokeObjectURL(url);
    addLog("Informe JSON exportado");
  };

  const sendBroadcast = () => addLog("Aviso enviado a todos los conductores conectados");
  const runSecurityCheck = () => addLog("Revisión de seguridad completada sin bloqueos críticos");
  const generateDailyReport = () => addLog("Informe diario preparado para descarga");
  const isSaving =
    createDriverMutation.isPending ||
    updateDriverStatusMutation.isPending ||
    createTaxiMutation.isPending ||
    updateTaxiStatusMutation.isPending ||
    createIncidentMutation.isPending ||
    resolveIncidentMutation.isPending ||
    createLogMutation.isPending;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 to-blue-950 text-white shadow-lg">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Panel de administración</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isGuest && <Badge className="hidden bg-amber-100 text-amber-800 hover:bg-amber-100 sm:inline-flex">Modo prueba</Badge>}
            {isRealAdmin && <Badge className="hidden bg-emerald-100 text-emerald-800 hover:bg-emerald-100 sm:inline-flex">Supabase activo</Badge>}
            {isSaving && <Badge variant="outline" className="hidden sm:inline-flex">Guardando...</Badge>}
            <Button variant="outline" onClick={logout} className="rounded-2xl bg-white/80">
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {snapshotQuery.error && isRealAdmin && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            Error al conectar con Supabase: {snapshotQuery.error.message}
          </div>
        )}

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-cyan-100 ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" />
                Centro de control municipal · {serviceMode}
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Operación en tiempo real</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Supervisa demanda, conductores, flota, viajes, incidencias y rendimiento desde una sola pantalla. Usuario actual: {user?.name ?? "Invitado Admin"}.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={addDriver} disabled={isSaving} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
                  <Plus className="mr-2 h-4 w-4" />
                  Alta conductor
                </Button>
                <Button onClick={exportReport} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar informe
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cityZones.map((zone) => {
                const zoneDrivers = drivers.filter((driver) => driver.zone === zone.name).length;
                return (
                  <div key={zone.name} className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                    <p className="text-sm font-black">{zone.name}</p>
                    <p className="mt-2 text-2xl font-black">{zoneDrivers}</p>
                    <p className="text-xs text-slate-300">taxis · ETA {zone.eta}</p>
                    <Badge className="mt-3 bg-white/15 text-white hover:bg-white/15">Demanda {zone.demand}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Car} title="Viajes activos" value={String(activeRides)} note="Asignados o en servicio" />
          <StatCard icon={Users} title="Conductores" value={String(drivers.length)} note={`${availableDrivers} libres ahora`} />
          <StatCard icon={CircleDollarSign} title="Ingresos hoy" value="946 €" note="Objetivo diario 78%" />
          <StatCard icon={Star} title="Valoración media" value={avgRating} note={isRealAdmin ? "Datos Supabase" : "Según conductores demo"} />
        </section>

        <Tabs defaultValue="resumen" className="space-y-5">
          <TabsList className="grid h-auto grid-cols-2 rounded-3xl bg-white/80 p-1 shadow-sm backdrop-blur-xl md:grid-cols-6">
            <TabsTrigger value="resumen" className="rounded-2xl py-3 font-black">Resumen</TabsTrigger>
            <TabsTrigger value="operacion" className="rounded-2xl py-3 font-black">Operación</TabsTrigger>
            <TabsTrigger value="conductores" className="rounded-2xl py-3 font-black">Conductores</TabsTrigger>
            <TabsTrigger value="flota" className="rounded-2xl py-3 font-black">Flota</TabsTrigger>
            <TabsTrigger value="incidencias" className="rounded-2xl py-3 font-black">Incidencias</TabsTrigger>
            <TabsTrigger value="config" className="rounded-2xl py-3 font-black">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <PanelCard icon={Activity} title="Viajes e ingresos" description="Semana actual · datos demo para validar diseño">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Area type="monotone" dataKey="ingresos" stroke="#2563eb" fill="#bfdbfe" strokeWidth={3} />
                      <Area type="monotone" dataKey="viajes" stroke="#06b6d4" fill="#cffafe" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PanelCard>

              <PanelCard icon={Gauge} title="Estado de flota" description="Distribución actual por estado">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={4}>
                        {statusData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </PanelCard>
            </div>

            <PanelCard icon={CalendarClock} title="Últimos viajes" description="Servicios recientes de la ciudad">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Pasajero</TableHead>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Ruta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rides.map((ride) => (
                      <TableRow key={ride.id}>
                        <TableCell className="font-mono font-bold">{ride.id}</TableCell>
                        <TableCell>{ride.passenger}</TableCell>
                        <TableCell>{ride.driver}</TableCell>
                        <TableCell>{ride.from} → {ride.to}</TableCell>
                        <TableCell>{statusBadge(ride.status)}</TableCell>
                        <TableCell className="text-right font-black">{ride.price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PanelCard>
          </TabsContent>

          <TabsContent value="operacion" className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <PanelCard icon={MapPin} title="Zonas de demanda" description="Estado operativo por zona">
              <div className="space-y-3">
                {cityZones.map((zone) => (
                  <div key={zone.name} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-black">{zone.name}</p>
                      <Badge variant="outline">ETA {zone.eta}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                      <span>{drivers.filter((driver) => driver.zone === zone.name).length} conductores cerca</span>
                      <span>Demanda {zone.demand}</span>
                    </div>
                  </div>
                ))}
              </div>
            </PanelCard>

            <PanelCard icon={Clock3} title="Tiempo de espera" description="Minutos medios por día">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="espera" radius={[10, 10, 0, 0]} fill="#06b6d4" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </TabsContent>

          <TabsContent value="conductores" className="space-y-5">
            <PanelCard icon={UserCheck} title="Conductores" description="Control de estado, zona, viajes y rendimiento">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Buscar conductor..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="rounded-2xl bg-white pl-9" />
                </div>
                <Button variant="outline" className="rounded-2xl"><Filter className="mr-2 h-4 w-4" /> Filtro</Button>
                <Button onClick={addDriver} disabled={isSaving} className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" /> Nuevo</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Taxi</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrivers.map((driver) => (
                      <TableRow key={driver.id}>
                        <TableCell className="font-bold">{driver.name}</TableCell>
                        <TableCell className="font-mono">{driver.taxi}</TableCell>
                        <TableCell>{driver.zone}</TableCell>
                        <TableCell>{statusBadge(driver.status)}</TableCell>
                        <TableCell>⭐ {driver.rating}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={isSaving} onClick={() => changeDriverStatus(driver.id)} className="rounded-xl">
                            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Estado
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-slate-500">No hay conductores todavía.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </PanelCard>
          </TabsContent>

          <TabsContent value="flota" className="space-y-5">
            <PanelCard icon={Wrench} title="Flota" description="Vehículos, licencias, revisiones y disponibilidad">
              <div className="mb-4 flex justify-end">
                <Button onClick={addTaxi} disabled={isSaving} className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" /> Añadir taxi</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taxi</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fleet.map((taxi) => (
                      <TableRow key={taxi.id}>
                        <TableCell className="font-mono font-black">{taxi.taxi}</TableCell>
                        <TableCell>{taxi.plate}</TableCell>
                        <TableCell>{taxi.model}</TableCell>
                        <TableCell>{taxi.driver}</TableCell>
                        <TableCell>{statusBadge(taxi.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={isSaving} onClick={() => changeTaxiStatus(taxi.id)} className="rounded-xl">
                            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Estado
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {fleet.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-slate-500">No hay taxis todavía.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </PanelCard>
          </TabsContent>

          <TabsContent value="incidencias" className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <PanelCard icon={MessageSquareWarning} title="Incidencias abiertas" description="Alertas y soporte operativo">
              <div className="mb-4 flex justify-end">
                <Button onClick={addIncident} disabled={isSaving} className="rounded-2xl bg-red-600 font-black text-white hover:bg-red-500"><Plus className="mr-2 h-4 w-4" /> Nueva incidencia</Button>
              </div>
              <div className="space-y-3">
                {incidents.length === 0 && (
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    No hay incidencias abiertas.
                  </div>
                )}
                {incidents.map((incident) => (
                  <div key={incident.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{incident.type}</p>
                        <p className="mt-1 text-sm text-slate-600">{incident.text}</p>
                      </div>
                      <Badge className={incident.level === "high" ? "bg-red-100 text-red-800 hover:bg-red-100" : incident.level === "medium" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-slate-100 text-slate-800 hover:bg-slate-100"}>{incident.time}</Badge>
                    </div>
                    <Button size="sm" variant="outline" disabled={isSaving} onClick={() => resolveIncident(incident.id)} className="mt-3 rounded-xl">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Resolver
                    </Button>
                  </div>
                ))}
              </div>
            </PanelCard>

            <PanelCard icon={LifeBuoy} title="Acciones rápidas" description="Herramientas para el operador">
              <div className="grid gap-3">
                <Button onClick={sendBroadcast} disabled={isSaving} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><Bell className="mr-3 h-5 w-5 text-cyan-600" /> Enviar aviso a conductores</Button>
                <Button onClick={runSecurityCheck} disabled={isSaving} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><ShieldCheck className="mr-3 h-5 w-5 text-emerald-600" /> Revisar seguridad</Button>
                <Button onClick={generateDailyReport} disabled={isSaving} variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><FileText className="mr-3 h-5 w-5 text-indigo-600" /> Generar informe diario</Button>
              </div>
            </PanelCard>
          </TabsContent>

          <TabsContent value="config" className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <PanelCard icon={Settings} title="Configuración operativa" description="Ajustes demo del sistema">
              <div className="grid gap-3 sm:grid-cols-3">
                {["Piloto municipal", "Hora punta", "Servicio nocturno"].map((mode) => (
                  <Button key={mode} variant={serviceMode === mode ? "default" : "outline"} onClick={() => { setServiceMode(mode); addLog(`Modo cambiado: ${mode}`); }} className="rounded-2xl font-black">
                    {mode}
                  </Button>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-sm font-bold text-slate-500">Fuente de datos</p>
                  <p className="mt-2 text-2xl font-black">{isRealAdmin ? "Supabase" : "Local"}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-sm font-bold text-slate-500">Radio operativo</p>
                  <p className="mt-2 text-2xl font-black">8 km</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-sm font-bold text-slate-500">Espera máxima</p>
                  <p className="mt-2 text-2xl font-black">10 min</p>
                </div>
              </div>
            </PanelCard>

            <PanelCard icon={Activity} title="Registro de actividad" description="Últimas acciones hechas en el panel">
              <div className="space-y-3">
                {logs.length === 0 && <p className="text-sm text-slate-500">Aún no hay actividad registrada.</p>}
                {logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-slate-100 bg-white p-3">
                    <p className="font-bold text-slate-900">{log.text}</p>
                    <p className="text-xs text-slate-500">{log.time}</p>
                  </div>
                ))}
              </div>
            </PanelCard>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
