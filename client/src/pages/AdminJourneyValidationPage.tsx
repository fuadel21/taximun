import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PlayCircle, Route, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PremiumInternalHeader } from "@/components/PremiumInternalHeader";

type StepStatus = "ok" | "warning" | "error" | "pending";

const statusConfig: Record<StepStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  ok: { label: "Correcto", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  warning: { label: "Revisar", icon: AlertTriangle, className: "border-amber-200 bg-amber-50 text-amber-700" },
  error: { label: "Error", icon: XCircle, className: "border-red-200 bg-red-50 text-red-700" },
  pending: { label: "Pendiente", icon: Clock3, className: "border-slate-200 bg-slate-50 text-slate-600" },
};

export default function AdminJourneyValidationPage() {
  const { user, isGuest } = useAuth() as any;
  const isAdmin = !isGuest && user?.role === "admin";
  const [rideId, setRideId] = useState("");
  const [requestedRideId, setRequestedRideId] = useState<string | undefined>();
  const [enabled, setEnabled] = useState(false);

  const validation = trpc.system.taxiJourneyValidation.run.useQuery(
    requestedRideId ? { rideId: requestedRideId } : undefined,
    { enabled: isAdmin && enabled, retry: false, refetchOnWindowFocus: false }
  );

  const runValidation = () => {
    const value = rideId.trim();
    setRequestedRideId(value || undefined);
    setEnabled(true);
    window.setTimeout(() => validation.refetch(), 0);
  };

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#111] p-8 text-center">
          <XCircle className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-3xl font-black">Acceso restringido</h1>
          <p className="mt-2 text-sm font-semibold text-white/55">Esta prueba solo puede ejecutarla un administrador real.</p>
        </section>
      </main>
    );
  }

  const result = validation.data as any;

  return (
    <main className="min-h-screen bg-[#f3f3f3] text-black">
      <PremiumInternalHeader
        eyebrow="Taximun Admin"
        title="Prueba integral del viaje"
        description="Audita un viaje real de principio a fin sin modificar datos."
        homePath="/admin/dashboard"
        icon={<Route className="h-8 w-8" />}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <Card className="rounded-[2rem] border-black/5 bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Seleccionar viaje</CardTitle>
            <CardDescription>Pega un UUID concreto o deja el campo vacío para revisar el viaje más reciente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input value={rideId} onChange={(event) => setRideId(event.target.value)} placeholder="UUID del viaje (opcional)" className="h-16 flex-1 rounded-2xl bg-[#f3f3f3] px-5 font-semibold" />
            <Button onClick={runValidation} disabled={validation.isFetching} className="h-16 rounded-2xl bg-black px-6 font-black text-white hover:bg-black/85">
              {validation.isFetching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayCircle className="mr-2 h-5 w-5" />}
              Ejecutar prueba completa
            </Button>
          </CardContent>
        </Card>

        {result?.checkedAt && (
          <div className="rounded-2xl bg-black p-4 text-sm font-bold text-white">
            Comprobado {new Date(result.checkedAt).toLocaleString("es-ES")} · {result.latencyMs} ms
          </div>
        )}

        {validation.error && (
          <Card className="rounded-[1.75rem] border-red-200 bg-red-50">
            <CardContent className="flex gap-3 p-5 text-red-800"><XCircle className="h-5 w-5 shrink-0" /><div><p className="font-black">No se pudo ejecutar la prueba</p><p className="text-sm">{validation.error.message}</p></div></CardContent>
          </Card>
        )}

        {result?.ride && (
          <Card className="rounded-[2rem] border-black/5 bg-white shadow-lg">
            <CardHeader><CardTitle>Viaje auditado</CardTitle><CardDescription className="break-all">{result.ride.id}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Estado" value={result.ride.status} />
              <Info label="Origen" value={result.ride.pickupAddress || "Sin dirección"} />
              <Info label="Destino" value={result.ride.dropoffAddress || "Sin dirección"} />
              <Info label="Conductor" value={result.ride.driverId || "Sin asignar"} />
            </CardContent>
          </Card>
        )}

        {result?.summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {(["ok", "warning", "error", "pending"] as StepStatus[]).map((status) => {
              const config = statusConfig[status];
              const Icon = config.icon;
              return <Card key={status} className={`rounded-[1.5rem] ${config.className}`}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-black uppercase">{config.label}</p><p className="mt-1 text-3xl font-black">{result.summary[status]}</p></div><Icon className="h-7 w-7" /></CardContent></Card>;
            })}
            <Card className="rounded-[1.5rem] border-black bg-black text-white"><CardContent className="p-4"><p className="text-xs font-black uppercase">Total</p><p className="mt-1 text-3xl font-black">{result.summary.total}</p></CardContent></Card>
          </div>
        )}

        {result?.steps && (
          <div className="space-y-3">
            {result.steps.map((item: any, index: number) => {
              const config = statusConfig[item.status as StepStatus];
              const Icon = config.icon;
              return (
                <Card key={item.key} className="rounded-[1.75rem] border-black/5 bg-white shadow-sm">
                  <CardContent className="flex gap-4 p-5">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${config.className}`}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-black/40">PASO {index + 1}</span><Badge variant="outline" className={config.className}>{config.label}</Badge></div>
                      <h2 className="mt-2 text-lg font-black">{item.title}</h2>
                      <p className="mt-1 text-sm font-semibold text-black/55">{item.message}</p>
                      {item.details && <pre className="mt-3 overflow-x-auto rounded-2xl bg-black p-4 text-xs text-white">{JSON.stringify(item.details, null, 2)}</pre>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!enabled && (
          <div className="rounded-[2rem] border border-dashed border-black/20 bg-white p-10 text-center">
            <PlayCircle className="mx-auto h-12 w-12" />
            <p className="mt-4 font-black">La prueba todavía no se ha ejecutado.</p>
            <p className="mt-1 text-sm font-semibold text-black/50">Pulsa el botón grande para revisar todo el ciclo del viaje.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f3f3f3] p-4"><p className="text-xs font-black uppercase text-black/40">{label}</p><p className="mt-1 break-all text-sm font-bold">{value}</p></div>;
}
