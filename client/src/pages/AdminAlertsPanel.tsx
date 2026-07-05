import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Filter, Loader2, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";

type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
type ReportPriority = "low" | "normal" | "high" | "critical";

type SafetyReport = {
  id: string;
  reporter_id: string;
  reporter_role: "passenger" | "driver" | "admin";
  ride_id?: string | null;
  category: string;
  priority: ReportPriority;
  status: ReportStatus;
  title: string;
  description?: string | null;
  contact_phone?: string | null;
  resolution_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

const statusOptions: Array<"all" | ReportStatus> = ["all", "open", "in_review", "resolved", "dismissed"];
const priorityOptions: Array<"all" | ReportPriority> = ["all", "low", "normal", "high", "critical"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function statusLabel(status: ReportStatus) {
  if (status === "open") return "Abierta";
  if (status === "in_review") return "En revisión";
  if (status === "resolved") return "Resuelta";
  return "Descartada";
}

function priorityLabel(priority: ReportPriority) {
  if (priority === "critical") return "Crítica";
  if (priority === "high") return "Alta";
  if (priority === "normal") return "Normal";
  return "Baja";
}

function reportStatusBadge(status: ReportStatus) {
  if (status === "open") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abierta</Badge>;
  if (status === "in_review") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">En revisión</Badge>;
  if (status === "resolved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resuelta</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Descartada</Badge>;
}

function priorityBadge(priority: ReportPriority) {
  if (priority === "critical") return <Badge className="bg-red-600 text-white hover:bg-red-600">Crítica</Badge>;
  if (priority === "high") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Alta</Badge>;
  if (priority === "normal") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Normal</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Baja</Badge>;
}

export default function AdminAlertsPanel() {
  const { user, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const isRealAdmin = !isGuest && user?.role === "admin";
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("open");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ReportPriority>("all");
  const [search, setSearch] = useState("");
  const [resolutionNote, setResolutionNote] = useState("Resuelto desde panel admin");

  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      priority: priorityFilter === "all" ? undefined : priorityFilter,
    },
    {
      enabled: isRealAdmin,
      retry: false,
      refetchInterval: 7000,
      refetchOnWindowFocus: true,
    }
  );

  const updateStatus = trpc.system.taxiSafety.adminUpdateStatus.useMutation({
    onSuccess: async () => {
      await utils.system.taxiSafety.adminList.invalidate();
    },
  });

  const reports = (reportsQuery.data ?? []) as SafetyReport[];
  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((report) =>
      [report.title, report.description, report.reporter_role, report.category, report.ride_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [reports, search]);

  const openCount = reports.filter((report) => report.status === "open").length;
  const reviewCount = reports.filter((report) => report.status === "in_review").length;
  const resolvedCount = reports.filter((report) => report.status === "resolved").length;
  const criticalCount = reports.filter((report) => report.priority === "critical").length;
  const isSaving = updateStatus.isPending;

  const changeStatus = (reportId: string, status: ReportStatus) => {
    updateStatus.mutate({ reportId, status, resolutionNote: status === "resolved" || status === "dismissed" ? resolutionNote : undefined });
  };

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl border-white bg-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Acceso admin requerido</CardTitle>
            <CardDescription>Entra con tu cuenta administradora para revisar incidencias reales.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => setLocation("/admin")} variant="outline" className="rounded-2xl bg-white/80">
              <ArrowLeft className="mr-2 h-4 w-4" /> Panel
            </Button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun Admin</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Alertas e incidencias reales</h1>
            </div>
          </div>
          <Button onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching} variant="outline" className="rounded-2xl bg-white/80 font-black">
            {reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {reportsQuery.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            Error al cargar incidencias: {reportsQuery.error.message}
          </div>
        )}
        {updateStatus.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            Error al actualizar incidencia: {updateStatus.error.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<AlertTriangle className="h-6 w-6" />} title="Abiertas" value={String(openCount)} note="Pendientes de revisar" />
          <MetricCard icon={<Clock3 className="h-6 w-6" />} title="En revisión" value={String(reviewCount)} note="Operador revisando" />
          <MetricCard icon={<CheckCircle2 className="h-6 w-6" />} title="Resueltas" value={String(resolvedCount)} note="Cerradas correctamente" />
          <MetricCard icon={<ShieldCheck className="h-6 w-6" />} title="Críticas" value={String(criticalCount)} note="Prioridad máxima" />
        </div>

        <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black">
              <Filter className="h-5 w-5 text-cyan-600" /> Filtros de incidencias
            </CardTitle>
            <CardDescription>Filtra por estado, prioridad o texto. Los datos vienen de Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr_0.8fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, descripción, viaje o rol..." className="h-12 rounded-2xl bg-white pl-9 font-bold" />
              </div>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <Button key={status} size="sm" variant={statusFilter === status ? "default" : "outline"} onClick={() => setStatusFilter(status)} className="rounded-2xl font-black">
                    {status === "all" ? "Todos" : statusLabel(status)}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((priority) => (
                  <Button key={priority} size="sm" variant={priorityFilter === priority ? "default" : "outline"} onClick={() => setPriorityFilter(priority)} className="rounded-2xl font-black">
                    {priority === "all" ? "Todas" : priorityLabel(priority)}
                  </Button>
                ))}
              </div>
            </div>
            <Input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Nota de resolución" className="h-12 rounded-2xl bg-slate-50 font-bold" />
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Listado real
            </CardTitle>
            <CardDescription>{filteredReports.length} incidencias encontradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {reportsQuery.isLoading ? (
              <div className="rounded-3xl bg-slate-50 p-8 text-center font-black text-slate-500">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" /> Cargando incidencias reales...
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
                <p className="text-lg font-black text-emerald-900">Sin incidencias para este filtro</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">Cuando pasajero o conductor registre una incidencia, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Incidencia</TableHead>
                      <TableHead>Reporta</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="min-w-[280px]">
                          <p className="font-black">{report.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{report.description || "Sin descripción"}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">{report.category}</Badge>
                            {report.ride_id && <Badge variant="outline">Viaje {report.ride_id.slice(0, 8)}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-bold capitalize">{report.reporter_role}</p>
                          <p className="font-mono text-xs text-slate-500">{report.reporter_id.slice(0, 10)}</p>
                        </TableCell>
                        <TableCell>{priorityBadge(report.priority)}</TableCell>
                        <TableCell>{reportStatusBadge(report.status)}</TableCell>
                        <TableCell>{formatDateTime(report.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={isSaving || report.status === "in_review"} onClick={() => changeStatus(report.id, "in_review")} className="rounded-xl">
                              Revisar
                            </Button>
                            <Button size="sm" disabled={isSaving || report.status === "resolved"} onClick={() => changeStatus(report.id, "resolved")} className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-500">
                              Resolver
                            </Button>
                            <Button size="sm" variant="outline" disabled={isSaving || report.status === "dismissed"} onClick={() => changeStatus(report.id, "dismissed")} className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Descartar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function MetricCard({ icon, title, value, note }: { icon: React.ReactNode; title: string; value: string; note: string }) {
  return (
    <Card className="overflow-hidden rounded-[1.75rem] border-white/70 bg-white/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{note}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 text-white shadow-lg shadow-cyan-500/20">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
