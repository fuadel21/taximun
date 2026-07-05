import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2, Clock3, Loader2, MessageSquareWarning, ShieldCheck } from "lucide-react";

type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
type ReportPriority = "low" | "normal" | "high" | "critical";

type SupportReport = {
  id: string;
  reporter_id: string;
  reporter_role: string;
  ride_id?: string | null;
  category: string;
  priority: ReportPriority;
  status: ReportStatus;
  title: string;
  description?: string | null;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function priorityBadge(priority: ReportPriority) {
  if (priority === "critical") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Máxima</Badge>;
  if (priority === "high") return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Alta</Badge>;
  if (priority === "normal") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Normal</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Baja</Badge>;
}

function statusBadge(status: ReportStatus) {
  if (status === "open") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Abierto</Badge>;
  if (status === "in_review") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Revisión</Badge>;
  if (status === "resolved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resuelto</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Cerrado</Badge>;
}

export default function AdminSupportPage() {
  const { user, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("open");
  const isRealAdmin = !isGuest && user?.role === "admin";

  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(
    statusFilter === "all" ? undefined : { status: statusFilter },
    { enabled: isRealAdmin, retry: false, refetchInterval: 10000, refetchOnWindowFocus: true }
  );

  const updateStatus = trpc.system.taxiSafety.adminUpdateStatus.useMutation({
    onSuccess: async () => {
      await utils.system.taxiSafety.adminList.invalidate();
    },
  });

  const reports = (reportsQuery.data ?? []) as SupportReport[];

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-cyan-600" /> Acceso requerido</CardTitle>
            <CardDescription>Entra con la cuenta autorizada para revisar reportes.</CardDescription>
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
        <header className="flex flex-col gap-3 rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun Admin</p>
            <h1 className="mt-1 text-3xl font-black">Centro de soporte operativo</h1>
            <p className="mt-2 text-sm font-semibold text-slate-300">Reportes enviados desde pasajero y conductor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLocation("/admin")} variant="outline" className="rounded-2xl border-white/20 bg-white/10 font-black text-white hover:bg-white/20"><ArrowLeft className="mr-2 h-4 w-4" /> Panel admin</Button>
            <Button onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching} className="rounded-2xl bg-cyan-500 font-black text-white hover:bg-cyan-400">{reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}Actualizar</Button>
          </div>
        </header>

        {(reportsQuery.error || updateStatus.error) && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {reportsQuery.error?.message || updateStatus.error?.message}
          </div>
        )}

        <Card className="rounded-[2rem] border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl font-black"><MessageSquareWarning className="h-6 w-6 text-cyan-600" /> Reportes reales</CardTitle>
                <CardDescription>Consulta, filtra y cierra reportes guardados en Supabase.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["open", "in_review", "resolved", "dismissed", "all"] as const).map((status) => (
                  <Button key={status} size="sm" variant={statusFilter === status ? "default" : "outline"} onClick={() => setStatusFilter(status)} className="rounded-xl font-black">
                    {status === "open" ? "Abiertos" : status === "in_review" ? "Revisión" : status === "resolved" ? "Resueltos" : status === "dismissed" ? "Cerrados" : "Todos"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Reporte</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-nowrap font-bold text-slate-500">{formatDate(report.created_at)}</TableCell>
                      <TableCell><div className="font-black capitalize">{report.reporter_role}</div><div className="max-w-[150px] truncate text-xs font-mono text-slate-500">{report.reporter_id}</div></TableCell>
                      <TableCell><div className="font-black">{report.title}</div><div className="max-w-md text-sm text-slate-500">{report.description ?? "Sin descripción"}</div>{report.ride_id && <div className="mt-1 text-xs font-mono text-slate-400">Viaje: {report.ride_id.slice(0, 8)}</div>}</TableCell>
                      <TableCell>{priorityBadge(report.priority)}</TableCell>
                      <TableCell>{statusBadge(report.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" disabled={updateStatus.isPending || report.status === "resolved"} onClick={() => updateStatus.mutate({ reportId: report.id, status: "resolved", resolutionNote: "Resuelto desde centro de soporte." })} className="rounded-xl">
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Resolver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reports.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center font-bold text-slate-500">No hay reportes para este filtro.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
