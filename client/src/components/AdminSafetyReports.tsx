import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Loader2, MapPin, RefreshCw, ShieldAlert, TimerReset, UserRoundCheck } from "lucide-react";

type SafetyReport = {
  id: string;
  reporter_id: string;
  reporter_role: string;
  ride_id?: string | null;
  category: string;
  priority: string;
  status: string;
  title: string;
  description?: string | null;
  contact_phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  resolution_note?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
};

type Filter = "active" | "critical" | "all" | "resolved";

function formatDate(value: unknown) {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function elapsedLabel(value: unknown, now: number) {
  if (typeof value !== "string") return "00:00";
  const startedAt = new Date(value).getTime();
  if (Number.isNaN(startedAt)) return "00:00";
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusBadge(status: string) {
  if (status === "open") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Pendiente de atención</Badge>;
  if (status === "in_review") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Atendida · seguimiento</Badge>;
  if (status === "resolved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Cerrada</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Descartada</Badge>;
}

function priorityBadge(priority: string) {
  if (priority === "critical") return <Badge className="bg-red-600 text-white hover:bg-red-600">Crítica</Badge>;
  if (priority === "high") return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Alta</Badge>;
  if (priority === "normal") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Normal</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Baja</Badge>;
}

function categoryLabel(category: string) {
  if (category === "route_issue") return "Ruta";
  if (category === "payment_issue") return "Pago";
  if (category === "lost_item") return "Objeto perdido";
  if (category === "safety") return "Seguridad";
  if (category === "sos") return "SOS";
  return "Otro";
}

const priorityWeight: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

export function AdminSafetyReports() {
  const { user } = useAuth() as any;
  const [filter, setFilter] = useState<Filter>("active");
  const [now, setNow] = useState(() => Date.now());
  const utils = trpc.useUtils();
  const adminIdentity = user?.name ?? user?.email ?? "Administración";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const updateStatus = trpc.system.taxiSafety.adminUpdateStatus.useMutation({
    onSuccess: async () => utils.system.taxiSafety.adminList.invalidate(),
  });

  const reports = (reportsQuery.data ?? []) as SafetyReport[];
  const active = reports.filter((report) => report.status === "open" || report.status === "in_review");
  const critical = active.filter((report) => report.priority === "critical" || report.category === "sos");
  const resolved = reports.filter((report) => report.status === "resolved");
  const unattendedCritical = critical.filter((report) => report.status === "open");
  const visible = useMemo(() => {
    const selected = filter === "active" ? active : filter === "critical" ? critical : filter === "resolved" ? resolved : reports;
    return [...selected].sort((a, b) => {
      const activeA = a.status === "open" || a.status === "in_review" ? 1 : 0;
      const activeB = b.status === "open" || b.status === "in_review" ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      const priority = (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0);
      if (priority !== 0) return priority;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [filter, reports]);

  const protocolNote = (action: "attended" | "resolved") => {
    const stamp = new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return action === "attended"
      ? `SOS atendido por ${adminIdentity} · ${stamp}. Seguimiento activo.`
      : `Incidencia cerrada por ${adminIdentity} · ${stamp}. Protocolo finalizado.`;
  };

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div className="rounded-[2rem] border border-red-300 bg-gradient-to-r from-red-600 to-rose-700 p-5 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><ShieldAlert className="h-6 w-6" /></span>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">Protocolo SOS activo</p>
              <p className="mt-1 text-xl font-black">{critical.length} alerta{critical.length === 1 ? "" : "s"} crítica{critical.length === 1 ? "" : "s"}</p>
              <p className="mt-1 text-sm font-semibold text-red-100">{unattendedCritical.length > 0 ? `${unattendedCritical.length} pendiente${unattendedCritical.length === 1 ? "" : "s"} de ser atendida${unattendedCritical.length === 1 ? "" : "s"}.` : "Todas están siendo atendidas y continúan en seguimiento."}</p>
            </div>
            <Button onClick={() => setFilter("critical")} className="rounded-2xl bg-white font-black text-red-700 hover:bg-red-50">Abrir protocolo</Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat title="SOS sin atender" value={String(unattendedCritical.length)} icon={<TimerReset className="h-5 w-5" />} urgent={unattendedCritical.length > 0} />
        <MiniStat title="Abiertas" value={String(reports.filter((r) => r.status === "open").length)} icon={<AlertTriangle className="h-5 w-5" />} />
        <MiniStat title="En seguimiento" value={String(reports.filter((r) => r.status === "in_review").length)} icon={<UserRoundCheck className="h-5 w-5" />} />
        <MiniStat title="Cerradas" value={String(resolved.length)} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {reportsQuery.error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">Error cargando incidencias: {reportsQuery.error.message}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-black">Protocolo de atención</h3><p className="text-sm font-semibold text-slate-500">Detectar → atender → hacer seguimiento → cerrar.</p></div>
        <Button variant="outline" className="rounded-2xl bg-white font-black" onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching}>{reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Actualizar</Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['active', `Activas (${active.length})`], ['critical', `SOS/críticas (${critical.length})`], ['all', `Todas (${reports.length})`], ['resolved', `Cerradas (${resolved.length})`]] as [Filter, string][]).map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className="shrink-0 rounded-xl font-black">{label}</Button>
        ))}
      </div>

      <div className="space-y-3">
        {reportsQuery.isLoading && <div className="rounded-3xl bg-white p-5 text-center font-bold text-slate-500">Cargando incidencias...</div>}
        {!reportsQuery.isLoading && visible.length === 0 && <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">No hay alertas en este filtro.</div>}

        {visible.map((report) => {
          const urgent = report.priority === "critical" || report.category === "sos";
          const hasLocation = Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng));
          const mapsUrl = hasLocation ? `https://www.google.com/maps?q=${report.lat},${report.lng}` : null;
          return (
            <Card key={report.id} className={`rounded-3xl bg-white shadow-sm ${urgent && report.status !== "resolved" ? "border-2 border-red-400 shadow-red-100" : "border-white"}`}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">{priorityBadge(report.priority)}{statusBadge(report.status)}<Badge variant="outline">{categoryLabel(report.category)}</Badge>{urgent && report.status !== "resolved" && <Badge className="animate-pulse bg-red-50 text-red-700 hover:bg-red-50">Respuesta prioritaria</Badge>}</div>
                    <p className="text-lg font-black text-slate-950">{report.title}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{report.description || "Sin descripción"}</p>

                    {report.status !== "resolved" && (
                      <div className={`mt-3 flex items-center justify-between gap-3 rounded-2xl p-3 ${report.status === "open" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-wide">{report.status === "open" ? "Tiempo sin atender" : "Tiempo total del protocolo"}</span></div>
                        <span className="font-mono text-lg font-black">{elapsedLabel(report.created_at, now)}</span>
                      </div>
                    )}

                    <div className="mt-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-2">
                      <p>Usuario: {report.reporter_role} · {report.reporter_id.slice(0, 10)}</p><p>Creada: {formatDate(report.created_at)}</p>
                      {report.ride_id && <p>Viaje: {report.ride_id}</p>}{report.contact_phone && <p>Teléfono: {report.contact_phone}</p>}
                    </div>
                    {report.resolution_note && <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><span className="text-slate-950">Registro:</span> {report.resolution_note}</div>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {mapsUrl && <Button asChild size="sm" variant="outline" className="rounded-xl font-black"><a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin className="mr-2 h-4 w-4" />Abrir ubicación<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                      {report.contact_phone && <Button asChild size="sm" variant="outline" className="rounded-xl font-black"><a href={`tel:${report.contact_phone}`}>Llamar al usuario</a></Button>}
                      {report.ride_id && <Button size="sm" variant="outline" className="rounded-xl font-black" onClick={() => navigator.clipboard?.writeText(report.ride_id!)}>Copiar ID del viaje</Button>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    {report.status === "open" && <Button size="sm" disabled={updateStatus.isPending} className="rounded-xl bg-amber-500 font-black text-white hover:bg-amber-400" onClick={() => updateStatus.mutate({ reportId: report.id, status: "in_review", resolutionNote: protocolNote("attended") })}><UserRoundCheck className="mr-2 h-4 w-4" />Yo la atiendo</Button>}
                    {report.status !== "resolved" && <Button size="sm" disabled={updateStatus.isPending} className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-500" onClick={() => updateStatus.mutate({ reportId: report.id, status: "resolved", resolutionNote: protocolNote("resolved") })}><CheckCircle2 className="mr-2 h-4 w-4" />Cerrar protocolo</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ title, value, icon, urgent = false }: { title: string; value: string; icon: React.ReactNode; urgent?: boolean }) {
  return <div className={`rounded-3xl p-4 shadow-sm ${urgent ? "border border-red-200 bg-red-50" : "bg-white"}`}><div className="flex items-center justify-between gap-3"><div><p className={`text-sm font-bold ${urgent ? "text-red-700" : "text-slate-500"}`}>{title}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div><div className={`rounded-2xl p-3 ${urgent ? "bg-red-600 text-white" : "bg-cyan-50 text-cyan-700"}`}>{icon}</div></div></div>;
}
