import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Loader2, PlayCircle, Route, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  const [requestedRideId, setRequestedRideId] = useState<string | undefined>(undefined);
  const [enabled, setEnabled] = useState(false);

  const validation = trpc.system.taxiJourneyValidation.run.useQuery(
    requestedRideId ? { rideId: requestedRideId } : undefined,
    {
      enabled: isAdmin && enabled,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const runValidation = () => {
    const value = rideId.trim();
    setRequestedRideId(value || undefined);
    setEnabled(true);
    window.setTimeout(() => validation.refetch(), 0);
  };

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <Card className="mx-auto max-w-xl border-red-200">
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Esta prueba solo puede ejecutarla un administrador real.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/">Volver al inicio</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const result = validation.data as any;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-blue-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" asChild className="mb-2 -ml-3">
              <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" />Volver al panel</Link>
            </Button>
            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-950">
              <Route className="h-8 w-8 text-cyan-600" /> Prueba integral del viaje
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Audita un viaje real de principio a fin sin modificar datos. Deja el identificador vacío para revisar automáticamente el viaje más reciente.
            </p>
          </div>
          {result?.checkedAt && (
            <Badge variant="outline" className="w-fit bg-white px-3 py-2">
              {new Date(result.checkedAt).toLocaleString("es-ES")} · {result.latencyMs} ms
            </Badge>
          )}
        </div>

        <Card className="border-white/70 bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Seleccionar viaje</CardTitle>
            <CardDescription>Puedes pegar un UUID concreto o ejecutar la prueba sobre el último viaje creado.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={rideId}
              onChange={(event) => setRideId(event.target.value)}
              placeholder="UUID del viaje (opcional)"
              className="flex-1"
            />
            <Button onClick={runValidation} disabled={validation.isFetching} className="bg-cyan-600 hover:bg-cyan-700">
              {validation.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Ejecutar prueba completa
            </Button>
          </CardContent>
        </Card>

        {validation.error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex gap-3 p-5 text-red-800">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-bold">No se pudo ejecutar la prueba</p><p className="text-sm">{validation.error.message}</p></div>
            </CardContent>
          </Card>
        )}

        {result?.ride && (
          <Card className="border-white/70 bg-white/90 shadow-lg">
            <CardHeader>
              <CardTitle>Viaje auditado</CardTitle>
              <CardDescription className="break-all">{result.ride.id}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs font-bold uppercase text-slate-400">Estado</p><p className="mt-1 font-bold">{result.ride.status}</p></div>
              <div><p className="text-xs font-bold uppercase text-slate-400">Origen</p><p className="mt-1 text-sm">{result.ride.pickupAddress || "Sin dirección"}</p></div>
              <div><p className="text-xs font-bold uppercase text-slate-400">Destino</p><p className="mt-1 text-sm">{result.ride.dropoffAddress || "Sin dirección"}</p></div>
              <div><p className="text-xs font-bold uppercase text-slate-400">Conductor</p><p className="mt-1 break-all text-sm">{result.ride.driverId || "Sin asignar"}</p></div>
            </CardContent>
          </Card>
        )}

        {result?.summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {(["ok", "warning", "error", "pending"] as StepStatus[]).map((status) => {
              const config = statusConfig[status];
              const Icon = config.icon;
              return (
                <Card key={status} className={config.className}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div><p className="text-xs font-black uppercase">{config.label}</p><p className="mt-1 text-3xl font-black">{result.summary[status]}</p></div>
                    <Icon className="h-7 w-7" />
                  </CardContent>
                </Card>
              );
            })}
            <Card className="border-blue-200 bg-blue-50 text-blue-700">
              <CardContent className="p-4"><p className="text-xs font-black uppercase">Total</p><p className="mt-1 text-3xl font-black">{result.summary.total}</p></CardContent>
            </Card>
          </div>
        )}

        {result?.steps && (
          <div className="space-y-3">
            {result.steps.map((item: any, index: number) => {
              const config = statusConfig[item.status as StepStatus];
              const Icon = config.icon;
              return (
                <Card key={item.key} className="border-white/70 bg-white/90 shadow-md">
                  <CardContent className="flex gap-4 p-5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${config.className}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-slate-400">PASO {index + 1}</span>
                        <Badge variant="outline" className={config.className}>{config.label}</Badge>
                      </div>
                      <h2 className="mt-1 text-lg font-black text-slate-950">{item.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                      {item.details && (
                        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                          {JSON.stringify(item.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!enabled && (
          <Card className="border-dashed border-cyan-300 bg-white/60">
            <CardContent className="py-12 text-center">
              <PlayCircle className="mx-auto h-12 w-12 text-cyan-500" />
              <p className="mt-4 font-bold text-slate-800">La prueba todavía no se ha ejecutado.</p>
              <p className="mt-1 text-sm text-slate-500">Pulsa el botón para revisar todo el ciclo del viaje.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
