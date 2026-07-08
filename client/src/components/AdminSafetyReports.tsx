import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw } from "lucide-react";

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
  created_at?: string | null;
  resolved_at?: string | null;
};

function formatDate(value: unknown) {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  if (status === "open") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abierta</Badge>;
  if (status === "in_review") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">En revisión</Badge>;
  if (status === "resolved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resuelta</Badge>;
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
  if (category === "sos") return "Urgente";
  return "Otro";
}

export function AdminSafetyReports() {
  const utils = trpc.useUtils();
  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(undefined, {
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
  const openCount = reports.filter((report) => report.status === "open").length;
  const reviewCount = reports.filter((report) => report.status === "in_review").length;
  const resolvedCount = reports.filter((report) => report.status === "resolved").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat title="Abiertas" value={String(openCount)} icon={<AlertTriangle className="h-5 w-5" />} />
        <MiniStat title="En revisión" value={String(reviewCount)} icon={<Clock3 className="h-5 w-5" />} />
        <MiniStat title="Resueltas" value={String(resolvedCount)} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {reportsQuery.error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          Error cargando incidencias reales: {reportsQuery.error.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Incidencias reales</h3>
          <p className="text-sm font-semibold text-slate-500">Datos desde taxi_safety_reports.</p>
        </div>
        <Button variant="outline" className="rounded-2xl bg-white font-black" onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching}>
          {reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <div className="space-y-3">
        {reportsQuery.isLoading && <div className="rounded-3xl bg-white p-5 text-center font-bold text-slate-500">Cargando incidencias...</div>}
        {!reportsQuery.isLoading && reports.length === 0 && (
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            No hay incidencias reales registradas.
          </div>
        )}

        {reports.map((report) => (
          <Card key={report.id} className="rounded-3xl border-white bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {priorityBadge(report.priority)}
                    {statusBadge(report.status)}
                    <Badge variant="outline">{categoryLabel(report.category)}</Badge>
                  </div>
                  <p className="text-lg font-black text-slate-950">{report.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{report.description || "Sin descripción"}</p>
                  <div className="mt-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-2">
                    <p>Usuario: {report.reporter_role} · {report.reporter_id.slice(0, 10)}</p>
                    <p>Fecha: {formatDate(report.created_at)}</p>
                    {report.ride_id && <p>Viaje: {report.ride_id.slice(0, 8)}</p>}
                    {report.contact_phone && <p>Teléfono: {report.contact_phone}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                  {report.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      className="rounded-xl bg-white font-black"
                      onClick={() => updateStatus.mutate({ reportId: report.id, status: "in_review", resolutionNote: "En revisión desde panel admin" })}
                    >
                      <Clock3 className="mr-2 h-4 w-4" /> Revisar
                    </Button>
                  )}
                  {report.status !== "resolved" && (
                    <Button
                      size="sm"
                      disabled={updateStatus.isPending}
                      className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-500"
                      onClick={() => updateStatus.mutate({ reportId: report.id, status: "resolved", resolutionNote: "Resuelta desde panel admin" })}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Resolver
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">{icon}</div>
      </div>
    </div>
  );
}
