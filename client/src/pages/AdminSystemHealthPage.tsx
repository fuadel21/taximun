import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, Loader2, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";

 type Check = { name: string; ok: boolean; severity: "ok" | "warning" | "error"; message: string };

function CheckList({ title, items, icon: Icon }: { title: string; items: Check[]; icon: typeof Database }) {
  return (
    <Card className="rounded-3xl border-white bg-white shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-700" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
            <div className="min-w-0">
              <p className="truncate font-black text-slate-900">{item.name}</p>
              <p className="text-xs font-semibold text-slate-500">{item.message}</p>
            </div>
            {item.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : item.severity === "warning" ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /> : <XCircle className="h-5 w-5 shrink-0 text-red-600" />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminSystemHealthPage() {
  const { user, isGuest, loading } = useAuth();
  const allowed = !isGuest && user?.role === "admin";
  const health = trpc.system.taxiSystemHealth.run.useQuery(undefined, { enabled: allowed, retry: false, refetchOnWindowFocus: false });

  if (loading) return <div className="p-8 text-center font-bold">Comprobando sesión…</div>;
  if (!allowed) return <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-800">Esta auditoría solo está disponible para administradores reales.</div>;

  const data = health.data as any;
  const summary = data?.summary;
  const errors = [...(data?.tables ?? []), ...(data?.functions ?? [])].filter((x: Check) => !x.ok).length;
  const warnings = (data?.rls ?? []).filter((x: Check) => !x.ok).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" className="mb-2 -ml-3 rounded-xl" onClick={() => window.location.assign('/admin')}><ArrowLeft className="mr-2 h-4 w-4" />Volver al panel</Button>
            <h1 className="text-3xl font-black text-slate-950">Salud técnica de Taximun</h1>
            <p className="mt-1 font-semibold text-slate-500">Auditoría de API, Supabase, tablas, RPC y seguridad RLS.</p>
          </div>
          <Button onClick={() => health.refetch()} disabled={health.isFetching} className="rounded-2xl font-black">{health.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Ejecutar diagnóstico</Button>
        </div>

        {health.error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">{health.error.message}<p className="mt-2 text-sm">Ejecuta la migración 20260718090000_system_health_audit.sql y vuelve a intentarlo.</p></div>}

        {data && <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatusCard label="API" value={data.api?.ok ? "Operativa" : "Error"} ok={Boolean(data.api?.ok)} note={`${data.api?.latencyMs ?? 0} ms`} icon={Server} />
            <StatusCard label="Tablas" value={`${summary?.tablesOk ?? 0}/${summary?.tablesTotal ?? 0}`} ok={(summary?.tablesOk ?? 0) === (summary?.tablesTotal ?? 0)} note="Estructura requerida" icon={Database} />
            <StatusCard label="Funciones RPC" value={`${summary?.functionsOk ?? 0}/${summary?.functionsTotal ?? 0}`} ok={(summary?.functionsOk ?? 0) === (summary?.functionsTotal ?? 0)} note="Motor y operaciones" icon={CheckCircle2} />
            <StatusCard label="RLS" value={`${summary?.rlsOk ?? 0}/${summary?.rlsTotal ?? 0}`} ok={(summary?.rlsOk ?? 0) === (summary?.rlsTotal ?? 0)} note="Protección de datos" icon={ShieldCheck} />
          </div>

          <div className={`rounded-3xl border p-5 ${errors ? 'border-red-200 bg-red-50' : warnings ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex flex-wrap items-center gap-2"><Badge className={errors ? 'bg-red-600' : warnings ? 'bg-amber-600' : 'bg-emerald-600'}>{errors ? `${errors} errores` : warnings ? `${warnings} avisos` : 'Sistema preparado'}</Badge><span className="text-sm font-bold text-slate-700">Última comprobación: {new Date(data.checkedAt).toLocaleString('es-ES')}</span></div>
            <p className="mt-2 text-sm font-semibold text-slate-600">Los elementos rojos requieren ejecutar o reparar una migración. Los amarillos indican tablas existentes sin RLS activa.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2"><CheckList title="Tablas esenciales" items={data.tables ?? []} icon={Database} /><CheckList title="Funciones esenciales" items={data.functions ?? []} icon={Server} /></div>
          <CheckList title="Protección RLS" items={data.rls ?? []} icon={ShieldCheck} />
        </>}
      </div>
    </main>
  );
}

function StatusCard({ label, value, ok, note, icon: Icon }: { label: string; value: string; ok: boolean; note: string; icon: typeof Server }) {
  return <Card className="rounded-3xl border-white bg-white shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="text-xs font-semibold text-slate-400">{note}</p></div><div className={`rounded-2xl p-3 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><Icon className="h-6 w-6" /></div></div></CardContent></Card>;
}
