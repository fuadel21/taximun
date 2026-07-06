import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type SupportRow = {
  id: string;
  reporter_role: string;
  ride_id?: string | null;
  category: string;
  priority: string;
  status: string;
  title: string;
  description?: string | null;
  created_at?: string | null;
};

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function stateBadge(value: string) {
  if (value === "open") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Abierta</Badge>;
  if (value === "in_review") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">En revisión</Badge>;
  if (value === "resolved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resuelta</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Cerrada</Badge>;
}

function priorityBadge(value: string) {
  if (value === "high") return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Alta</Badge>;
  if (value === "normal") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Normal</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{value}</Badge>;
}

export default function AdminSupportReports() {
  const { user, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"open" | "in_review" | "resolved" | "all">("open");
  const isRealAdmin = !isGuest && user?.role === "admin";

  const reportsQuery = trpc.system.taxiSafety.adminList.useQuery(
    filter === "all" ? undefined : { status: filter },
    { enabled: isRealAdmin, retry: false, refetchInterval: 8000 }
  );

  const updateStatus = trpc.system.taxiSafety.adminUpdateStatus.useMutation({
    onSuccess: () => utils.system.taxiSafety.adminList.invalidate(),
  });

  const rows = (reportsQuery.data ?? []) as SupportRow[];

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Acceso admin requerido</CardTitle>
            <CardDescription>Entra con el correo administrador para revisar soporte real.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-slate-950">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-700">Taximun Admin</p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Soporte real</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">Solicitudes creadas desde pasajero y conductor, guardadas en Supabase.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLocation("/admin")} variant="outline" className="rounded-2xl bg-white font-black"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
            <Button onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching} className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">
              {reportsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
          </div>
        </div>

        {reportsQuery.error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{reportsQuery.error.message}</div>}

        <Card className="rounded-[2rem] border-white bg-white shadow-xl">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-cyan-600" />Bandeja de soporte</CardTitle>
                <CardDescription>Filtra y cambia el estado de cada solicitud.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["open", "in_review", "resolved", "all"] as const).map((item) => (
                  <Button key={item} variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)} className="rounded-2xl font-black">
                    {item === "open" ? "Abiertas" : item === "in_review" ? "Revisión" : item === "resolved" ? "Resueltas" : "Todas"}
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
                    <TableHead>Rol</TableHead>
                    <TableHead>Solicitud</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Viaje</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-bold text-slate-600">{dateLabel(row.created_at)}</TableCell>
                      <TableCell><Badge variant="outline">{row.reporter_role}</Badge></TableCell>
                      <TableCell>
                        <p className="font-black">{row.title}</p>
                        <p className="max-w-md truncate text-xs font-semibold text-slate-500">{row.description ?? "Sin descripción"}</p>
                      </TableCell>
                      <TableCell>{priorityBadge(row.priority)}</TableCell>
                      <TableCell>{stateBadge(row.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ride_id ? row.ride_id.slice(0, 8) : "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={updateStatus.isPending || row.status === "in_review"} onClick={() => updateStatus.mutate({ reportId: row.id, status: "in_review", resolutionNote: "Revisión iniciada desde admin" })} className="rounded-xl">Revisar</Button>
                          <Button size="sm" disabled={updateStatus.isPending || row.status === "resolved"} onClick={() => updateStatus.mutate({ reportId: row.id, status: "resolved", resolutionNote: "Solicitud resuelta desde admin" })} className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-500"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Resolver</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm font-bold text-slate-500">No hay solicitudes con este filtro.</TableCell>
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
