import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
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
  BarChart,
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
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";

const weeklyData = [
  { day: "Lun", viajes: 38, ingresos: 418, espera: 5 },
  { day: "Mar", viajes: 44, ingresos: 484, espera: 4 },
  { day: "Mié", viajes: 41, ingresos: 451, espera: 6 },
  { day: "Jue", viajes: 58, ingresos: 638, espera: 4 },
  { day: "Vie", viajes: 72, ingresos: 792, espera: 3 },
  { day: "Sáb", viajes: 86, ingresos: 946, espera: 5 },
  { day: "Dom", viajes: 64, ingresos: 704, espera: 6 },
];

const statusData = [
  { name: "Libres", value: 18, color: "#06b6d4" },
  { name: "Ocupados", value: 11, color: "#2563eb" },
  { name: "Pausa", value: 5, color: "#f59e0b" },
  { name: "Offline", value: 7, color: "#94a3b8" },
];

const drivers = [
  { id: 1, name: "Juan García", taxi: "TX-102", zone: "Centro", status: "available", rating: 4.9, rides: 18, wait: "3 min" },
  { id: 2, name: "Marta Soler", taxi: "TX-118", zone: "Estación", status: "busy", rating: 4.8, rides: 15, wait: "En viaje" },
  { id: 3, name: "Karim Haddad", taxi: "TX-130", zone: "Hospital", status: "available", rating: 4.7, rides: 12, wait: "5 min" },
  { id: 4, name: "Laura Pérez", taxi: "TX-141", zone: "Ayuntamiento", status: "pause", rating: 4.6, rides: 9, wait: "Pausa" },
  { id: 5, name: "Said Amrani", taxi: "TX-154", zone: "Costa", status: "offline", rating: 4.9, rides: 21, wait: "Offline" },
];

const fleet = [
  { plate: "1234-LTX", taxi: "TX-102", driver: "Juan García", model: "Toyota Corolla", status: "available", inspection: "2026-10-14" },
  { plate: "9912-MDC", taxi: "TX-118", driver: "Marta Soler", model: "Hyundai Ioniq", status: "busy", inspection: "2026-09-02" },
  { plate: "7720-KRM", taxi: "TX-130", driver: "Karim Haddad", model: "Skoda Octavia", status: "available", inspection: "2026-12-20" },
  { plate: "5529-BLC", taxi: "TX-141", driver: "Laura Pérez", model: "Mercedes Vito", status: "maintenance", inspection: "2026-08-11" },
];

const rides = [
  { id: "R-2041", passenger: "Ana M.", driver: "Marta Soler", from: "Estación", to: "Hospital", status: "in_progress", price: "12,80 €", time: "09:42" },
  { id: "R-2040", passenger: "Carlos R.", driver: "Juan García", from: "Centro", to: "Costa", status: "completed", price: "16,20 €", time: "09:29" },
  { id: "R-2039", passenger: "Nora L.", driver: "Karim Haddad", from: "Ayuntamiento", to: "Estación", status: "assigned", price: "8,90 €", time: "09:16" },
  { id: "R-2038", passenger: "Mohamed A.", driver: "Laura Pérez", from: "Mercado", to: "Centro", status: "cancelled", price: "0,00 €", time: "08:58" },
];

const incidents = [
  { id: "I-88", type: "Retraso", text: "Conductor TX-141 acumula 12 min de demora", level: "medium", time: "Hace 8 min" },
  { id: "I-87", type: "Pago", text: "Pago pendiente en viaje R-2038", level: "low", time: "Hace 22 min" },
  { id: "I-86", type: "Soporte", text: "Pasajero solicita llamada de asistencia", level: "high", time: "Hace 31 min" },
];

const cityZones = [
  { name: "Centro", drivers: 7, demand: "Alta", eta: "3 min" },
  { name: "Estación", drivers: 5, demand: "Media", eta: "4 min" },
  { name: "Hospital", drivers: 3, demand: "Alta", eta: "5 min" },
  { name: "Costa", drivers: 4, demand: "Baja", eta: "7 min" },
];

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

function StatCard({ icon: Icon, title, value, note }: { icon: any; title: string; value: string; note: string }) {
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

export default function AdminPanel() {
  const { user, logout, isGuest } = useAuth() as any;
  const [searchTerm, setSearchTerm] = useState("");

  const filteredDrivers = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return drivers.filter(
      (driver) =>
        driver.name.toLowerCase().includes(query) ||
        driver.taxi.toLowerCase().includes(query) ||
        driver.zone.toLowerCase().includes(query)
    );
  }, [searchTerm]);

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
            <Button variant="outline" onClick={logout} className="rounded-2xl bg-white/80">
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-cyan-100 ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" />
                Centro de control municipal
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Operación en tiempo real</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Supervisa demanda, conductores, flota, viajes, incidencias y rendimiento desde una sola pantalla. Usuario actual: {user?.name ?? "Invitado Admin"}.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
                  <Plus className="mr-2 h-4 w-4" />
                  Alta conductor
                </Button>
                <Button variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar informe
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cityZones.map((zone) => (
                <div key={zone.name} className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                  <p className="text-sm font-black">{zone.name}</p>
                  <p className="mt-2 text-2xl font-black">{zone.drivers}</p>
                  <p className="text-xs text-slate-300">taxis · ETA {zone.eta}</p>
                  <Badge className="mt-3 bg-white/15 text-white hover:bg-white/15">Demanda {zone.demand}</Badge>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Car} title="Viajes activos" value="24" note="+12% frente a ayer" />
          <StatCard icon={Users} title="Conductores conectados" value="41" note="18 libres ahora" />
          <StatCard icon={CircleDollarSign} title="Ingresos hoy" value="946 €" note="Objetivo diario 78%" />
          <StatCard icon={Star} title="Valoración media" value="4,8" note="Últimos 7 días" />
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
              <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl font-black"><Activity className="h-5 w-5 text-cyan-600" /> Viajes e ingresos</CardTitle>
                  <CardDescription>Semana actual · datos demo para validar diseño</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
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
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl font-black"><Gauge className="h-5 w-5 text-blue-600" /> Estado de flota</CardTitle>
                  <CardDescription>Distribución actual por estado</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
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
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><CalendarClock className="h-5 w-5 text-indigo-600" /> Últimos viajes</CardTitle>
                <CardDescription>Servicios recientes de la ciudad</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operacion" className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><MapPin className="h-5 w-5 text-cyan-600" /> Zonas de demanda</CardTitle>
                <CardDescription>Estado operativo por zona</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cityZones.map((zone) => (
                  <div key={zone.name} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-black">{zone.name}</p>
                      <Badge variant="outline">ETA {zone.eta}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                      <span>{zone.drivers} conductores cerca</span>
                      <span>Demanda {zone.demand}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><BarChart className="h-5 w-5 text-blue-600" /> Tiempo de espera</CardTitle>
                <CardDescription>Minutos medios por día</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="espera" radius={[10, 10, 0, 0]} fill="#06b6d4" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conductores" className="space-y-5">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-black"><UserCheck className="h-5 w-5 text-cyan-600" /> Conductores</CardTitle>
                  <CardDescription>Control de estado, zona, viajes y rendimiento</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input placeholder="Buscar conductor..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="rounded-2xl bg-white pl-9" />
                  </div>
                  <Button variant="outline" className="rounded-2xl"><Filter className="mr-2 h-4 w-4" /> Filtro</Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Taxi</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead className="text-right">Viajes hoy</TableHead>
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
                        <TableCell className="text-right font-black">{driver.rides}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flota" className="space-y-5">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader className="gap-4 lg:flex lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-black"><Wrench className="h-5 w-5 text-amber-600" /> Flota</CardTitle>
                  <CardDescription>Vehículos, licencias, revisiones y disponibilidad</CardDescription>
                </div>
                <Button className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" /> Añadir taxi</Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taxi</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Conductor</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Inspección</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fleet.map((taxi) => (
                      <TableRow key={taxi.taxi}>
                        <TableCell className="font-mono font-black">{taxi.taxi}</TableCell>
                        <TableCell>{taxi.plate}</TableCell>
                        <TableCell>{taxi.model}</TableCell>
                        <TableCell>{taxi.driver}</TableCell>
                        <TableCell>{statusBadge(taxi.status)}</TableCell>
                        <TableCell>{taxi.inspection}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incidencias" className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><MessageSquareWarning className="h-5 w-5 text-red-600" /> Incidencias abiertas</CardTitle>
                <CardDescription>Alertas y soporte operativo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {incidents.map((incident) => (
                  <div key={incident.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{incident.type}</p>
                        <p className="mt-1 text-sm text-slate-600">{incident.text}</p>
                      </div>
                      <Badge className={incident.level === "high" ? "bg-red-100 text-red-800 hover:bg-red-100" : incident.level === "medium" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-slate-100 text-slate-800 hover:bg-slate-100"}>{incident.time}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><LifeBuoy className="h-5 w-5 text-cyan-600" /> Acciones rápidas</CardTitle>
                <CardDescription>Herramientas para el operador</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><Bell className="mr-3 h-5 w-5 text-cyan-600" /> Enviar aviso a conductores</Button>
                <Button variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><ShieldCheck className="mr-3 h-5 w-5 text-emerald-600" /> Revisar seguridad</Button>
                <Button variant="outline" className="justify-start rounded-2xl bg-white py-6 font-black"><FileText className="mr-3 h-5 w-5 text-indigo-600" /> Generar informe diario</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="grid gap-5 lg:grid-cols-3">
            {[
              { icon: Settings, title: "Reglas de servicio", text: "Tarifas, radio operativo, comisiones y límites." },
              { icon: AlertTriangle, title: "Alertas", text: "Tiempo máximo de espera, incidencias y pagos pendientes." },
              { icon: CheckCircle2, title: "Estado del sistema", text: "Supabase, Vercel, Auth y despliegues." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-white/70 bg-white/85 shadow-xl backdrop-blur-xl">
                  <CardHeader>
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="font-black">{item.title}</CardTitle>
                    <CardDescription>{item.text}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full rounded-2xl bg-white font-black">Configurar</Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
