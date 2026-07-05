import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Filter, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

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

function statusLabel(status: string) {
  if (status === "open") return "Abierta";
  if (status === "in_review") return "En revisión";
  if (status === "resolved") return "Resuelta";
  if (status === "dismissed") return "Descartada";
  return status;
}

function priorityLabel(priority: string) {
  if (priority === "low") return "Baja";
  if (priority === "normal") return "Normal";
  if (priority === "high") return "Alta";
  if (priority === "critical") return "Crítica";
  return priority;
}

function categoryLabel(category: string) {
  if (category === "sos") return "Alerta urgente";
  if (category === "safety") return "Seguridad";
  if (category === "lost_item") return "Objeto perdido";
  if (category === "route_issue") return "Ruta";
  if (category === "payment_issue") return "Pago";
  return "Otra";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: ReportStatus) {
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

export default function AdminSafetyPanel() {
  const [, setLocation] = useLocation();
  const { user, isGuest } = useAuth() as any;
  const utils = trpc.useUtils();
  const isRealAdmin = !isGuest && user?.role === "admin";
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("open");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ReportPriority>("all");
  const [search, setSearch] = useState("");
  const [resolutionNote, setResolutionNote] = useState("Resuelto desde panel admin");

  const listInput = {
    status: statusFilter === "all" ? undefined : statusFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
  } as { status?: ReportStatus; priority?: ReportPriority };

  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(listInput, {
    enabled: isRealAdmin,
    retry: false,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });

  const updateStatus = trpc.system.taxiSafety.adminUpdateStatus.useMutation({
    onSuccess: async () => {
      await utils.system.taxiSafety.adminList.invalidate();
    },
  });

  const reports = (reportsQuery.data ?? []) as SafetyReport[];
  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      [report.title, report.description, report.reporter_id, report.reporter_role, report.category, report.status, report.priority]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [reports, search]);

  const openCount = reports.filter((report) => report.status === "open").length;
  const reviewCount = reports.filter((report) => report.status === "in_review").length;
  const criticalCount = reports.filter((report) => report.priority === "critical" || report.priority === "high").length;
  const isSaving = updateStatus.isPending;

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Acceso admin requerido</CardTitle>
            <CardDescription>Esta sección solo funciona con una sesión real de administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] px-4 py-6 text-slate-950">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button onClick={() => setLocation("/admin")} variant="outline" className="mb-4 rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver al admin
            </Button>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Alertas e incidencias reales</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">Gestiona incidencias creadas desde pasajero y conductor. Datos conectados a Supabase.</p>
          </div>
          <Button onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">
            {reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
        </header>

        {reportsQuery.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            Error al cargar incidencias: {reportsQuery.error.message}
          </div>
        )}
        {updateStatus.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            Error al actualizar: {updateStatus.error.message}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Abiertas" value={String(openCount)} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
          <StatCard title="En revisión" value={String(reviewCount)} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
          <StatCard title="Alta prioridad" value={String(criticalCount)} icon={<ShieldCheck className="h-5 w-5" />} tone="cyan" />
        </section>

        <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black"><Filter className="h-5 w-5 text-cyan-600" /> Filtros</CardTitle>
            <CardDescription>Filtra por estado, prioridad o texto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, usuario, descripción..." className="h-12 rounded-2xl bg-white font-bold" />
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-black text-slate-500">Estado</p>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((status) => (
                    <Button key={status} type="button" variant={statusFilter === status ? "default" : "outline"} onClick={() => setStatusFilter(status)} className="rounded-2xl font-black">
                      {status === "all" ? "Todos" : statusLabel(status)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-black text-slate-500">Prioridad</p>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map((priority) => (
                    <Button key={priority} type="button" variant={priorityFilter === priority ? "default" : "outline"} onClick={() => setPriorityFilter(priority)} className="rounded-2xl font-black">
                      {priority === "all" ? "Todas" : priorityLabel(priority)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Nota de resolución" className="h-12 rounded-2xl bg-white font-bold" />
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-2">
          {reportsQuery.isLoading && (
            <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl xl:col-span-2">
              <CardContent className="flex items-center justify-center gap-3 p-8 font-black text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Cargando incidencias...</CardContent>
            </Card>
          )}

          {!reportsQuery.isLoading && filteredReports.length === 0 && (
            <Card className="rounded-[2rem] border-emerald-100 bg-emerald-50 shadow-sm xl:col-span-2">
              <CardContent className="flex items-center gap-3 p-6 font-black text-emerald-800"><CheckCircle2 className="h-6 w-6" /> No hay incidencias con estos filtros.</CardContent>
            </Card>
          )}

          {filteredReports.map((report) => (
            <Card key={report.id} className="rounded-[2rem] border-white/70 bg-white/95 shadow-xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">{categoryLabel(report.category)}</p>
                    <h2 className="mt-1 break-words text-xl font-black">{report.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{formatDate(report.created_at)} · {report.reporter_role} · {report.reporter_id}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {statusBadge(report.status)}
                    {priorityBadge(report.priority)}
                  </div>
                </div>

                {report.description && <p className="rounded-3xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">{report.description}</p>}

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <Info label="Viaje" value={report.ride_id ?? "Sin viaje asociado"} />
                  <Info label="Teléfono" value={report.contact_phone ?? "No indicado"} />
                  <Info label="Estado" value={statusLabel(report.status)} />
                  <Info label="Prioridad" value={priorityLabel(report.priority)} />
                </div>

                {report.resolution_note && (
                  <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Nota: {report.resolution_note}</div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <Button variant="outline" disabled={isSaving || report.status === "in_review"} onClick={() => updateStatus.mutate({ reportId: report.id, status: "in_review", resolutionNote: "En revisión por administración" })} className="rounded-2xl bg-white font-black">
                    <Clock3 className="mr-2 h-4 w-4" /> Revisar
                  </Button>
                  <Button disabled={isSaving || report.status === "resolved"} onClick={() => updateStatus.mutate({ reportId: report.id, status: "resolved", resolutionNote })} className="rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Resolver
                  </Button>
                  <Button variant="outline" disabled={isSaving || report.status === "dismissed"} onClick={() => updateStatus.mutate({ reportId: report.id, status: "dismissed", resolutionNote })} className="rounded-2xl border-slate-200 bg-white font-black text-slate-700">
                    <XCircle className="mr-2 h-4 w-4" /> Descartar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </section>
    </main>
  );
}

function StatCard({ title, value, icon, tone }: { title: string; value: string; icon: React.ReactNode; tone: "red" | "amber" | "cyan" }) {
  const toneClass = tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-700";
  return (
    <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneClass}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words font-bold text-slate-700">{value}</p>
    </div>
  );
}
