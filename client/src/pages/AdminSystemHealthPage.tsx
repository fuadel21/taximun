import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";

type Check = { name: string; ok: boolean; severity: "ok" | "warning" | "error"; message: string };

function CheckList({ title, items, icon: Icon }: { title: string; items: Check[]; icon: typeof Database }) {
  return (
    <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2 text-2xl font-black"><Icon className="h-6 w-6" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.name} className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-4">
            <div className="min-w-0"><p className="truncate font-black text-black">{item.name}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{item.message}</p></div>
            {item.ok ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" /> : item.severity === "warning" ? <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" /> : <XCircle className="h-6 w-6 shrink-0 text-red-600" />}
          </div>
        ))}
        {items.length === 0 && <div className="rounded-2xl bg-zinc-100 p-5 text-center text-sm font-bold text-zinc-500">Sin comprobaciones disponibles.</div>}
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
    <main className="min-h-screen bg-[#f3f3f3] px-4 pb-12 pt-4 text-black">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-black text-zinc-500">Infraestructura y seguridad</p><h2 className="text-2xl font-black tracking-tight">Salud técnica de Taximun</h2><p className="mt-1 text-sm font-semibold text-zinc-500">Auditoría de API, Supabase, tablas, funciones RPC y seguridad RLS.</p></div>
          <Button onClick={() => health.refetch()} disabled={health.isFetching} className="h-14 rounded-2xl bg-black px-6 font-black text-white">{health.isFetching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}Ejecutar diagnóstico</Button>
        </div>

        {health.error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">{health.error.message}<p className="mt-2 text-sm">La auditoría no pudo completarse. Revisa que la migración de salud del sistema esté aplicada antes de repetirla.</p></div>}

        {!data && !health.isLoading && !health.error && <div className="rounded-[2rem] border border-dashed border-black/20 bg-white p-10 text-center"><Server className="mx-auto h-12 w-12" /><p className="mt-4 font-black">Ejecuta el diagnóstico para comprobar todos los servicios.</p></div>}
        {health.isLoading && <div className="rounded-[2rem] bg-white p-10 text-center font-bold text-zinc-500"><Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />Comprobando servicios reales…</div>}

        {data && <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatusCard label="API" value={data.api?.ok ? "Operativa" : "Error"} ok={Boolean(data.api?.ok)} note={`${data.api?.latencyMs ?? 0} ms`} icon={Server} />
            <StatusCard label="Tablas" value={`${summary?.tablesOk ?? 0}/${summary?.tablesTotal ?? 0}`} ok={(summary?.tablesOk ?? 0) === (summary?.tablesTotal ?? 0)} note="Estructura requerida" icon={Database} />
            <StatusCard label="Funciones RPC" value={`${summary?.functionsOk ?? 0}/${summary?.functionsTotal ?? 0}`} ok={(summary?.functionsOk ?? 0) === (summary?.functionsTotal ?? 0)} note="Motor y operaciones" icon={CheckCircle2} />
            <StatusCard label="RLS" value={`${summary?.rlsOk ?? 0}/${summary?.rlsTotal ?? 0}`} ok={(summary?.rlsOk ?? 0) === (summary?.rlsTotal ?? 0)} note="Protección de datos" icon={ShieldCheck} />
          </div>

          <div className={`rounded-[2rem] border p-5 ${errors ? "border-red-200 bg-red-50" : warnings ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex flex-wrap items-center gap-2"><Badge className={errors ? "bg-red-600" : warnings ? "bg-amber-600" : "bg-emerald-600"}>{errors ? `${errors} errores` : warnings ? `${warnings} avisos` : "Sistema preparado"}</Badge><span className="text-sm font-bold text-zinc-700">Última comprobación: {new Date(data.checkedAt).toLocaleString("es-ES")}</span></div>
            <p className="mt-2 text-sm font-semibold text-zinc-600">Los elementos rojos requieren reparación. Los amarillos indican protecciones que necesitan revisión.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2"><CheckList title="Tablas esenciales" items={data.tables ?? []} icon={Database} /><CheckList title="Funciones esenciales" items={data.functions ?? []} icon={Server} /></div>
          <CheckList title="Protección RLS" items={data.rls ?? []} icon={ShieldCheck} />
        </>}
      </div>
    </main>
  );
}

function StatusCard({ label, value, ok, note, icon: Icon }: { label: string; value: string; ok: boolean; note: string; icon: typeof Server }) {
  return <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="flex min-h-32 items-center justify-between p-5"><div><p className="text-sm font-bold text-zinc-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p><p className="text-xs font-semibold text-zinc-400">{note}</p></div><div className={`rounded-full p-4 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><Icon className="h-7 w-7" /></div></CardContent></Card>;
}
