import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { BellRing, Car, Clock3, Radio, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

function statusLabel(status: string) {
  if (status === "pending") return "Pendiente";
  if (status === "assigned") return "Asignado";
  if (status === "in_progress") return "En curso";
  return status;
}

function money(value: unknown) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value ?? 0));
}

export function AdminLiveSummary() {
  const snapshot = trpc.system.taxiAdminOperations.snapshot.useQuery(undefined, {
    retry: false,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const data = snapshot.data;
  const summary = data?.summary;
  const rides = data?.rides ?? [];

  return (
    <section className="bg-[#eef6ff] px-4 pb-2 pt-4">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Datos reales</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Operación conectada</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Actualización automática cada 10 segundos desde Supabase.</p>
          </div>
          <Button variant="outline" onClick={() => snapshot.refetch()} disabled={snapshot.isFetching}>
            <RefreshCw className={`h-5 w-5 ${snapshot.isFetching ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        {snapshot.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            No se pudo cargar la operación real: {snapshot.error.message}
          </div>
        )}

        {!snapshot.error && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric icon={<Users className="h-7 w-7" />} title="Conductores" value={summary ? String(summary.totalDrivers) : "—"} note={summary ? `${summary.availableDrivers} disponibles · ${summary.freshDrivers} conectados` : "Cargando"} />
              <Metric icon={<Car className="h-7 w-7" />} title="Viajes activos" value={summary ? String(summary.pendingRides + summary.assignedRides + summary.inProgressRides) : "—"} note={summary ? `${summary.pendingRides} pendientes · ${summary.inProgressRides} en curso` : "Cargando"} />
              <Metric icon={<BellRing className="h-7 w-7" />} title="Ofertas activas" value={summary ? String(summary.activeOffers) : "—"} note="Esperando respuesta de conductores" />
              <Metric icon={<ShieldAlert className="h-7 w-7" />} title="Alertas" value={summary ? String(summary.activeAlerts) : "—"} note={summary ? `${summary.criticalAlerts} críticas` : "Cargando"} />
            </div>

            <div className="mt-5 rounded-[1.75rem] bg-slate-950 p-4 text-white sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Viajes activos reales</p>
                  <h3 className="mt-1 text-xl font-black">Cola operativa</h3>
                </div>
                <Radio className="h-6 w-6 text-emerald-300" />
              </div>

              <div className="space-y-3">
                {snapshot.isLoading && <p className="rounded-2xl bg-white/10 p-4 text-sm font-bold text-slate-300">Cargando operación...</p>}
                {!snapshot.isLoading && rides.length === 0 && <p className="rounded-2xl bg-white/10 p-4 text-sm font-bold text-slate-300">No hay viajes activos en este momento.</p>}
                {rides.slice(0, 8).map((ride: any) => (
                  <div key={ride.id} className="grid gap-3 rounded-3xl bg-white/10 p-4 sm:grid-cols-[0.7fr_1.5fr_0.8fr] sm:items-center">
                    <div>
                      <p className="text-xs font-black uppercase text-cyan-200">{statusLabel(String(ride.status))}</p>
                      <p className="mt-1 font-black">{String(ride.id).slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{ride.pickup_address}</p>
                      <p className="truncate text-xs font-semibold text-slate-300">→ {ride.dropoff_address}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                      <p className="font-black">{money(ride.final_fare ?? ride.estimated_fare)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-300"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{ride.requested_at ? new Date(ride.requested_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Ahora"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Metric({ icon, title, value, note }: { icon: ReactNode; title: string; value: string; note: string }) {
  return (
    <div className="min-h-36 rounded-[1.75rem] bg-gradient-to-br from-slate-900 to-blue-950 p-4 text-white shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-cyan-200">{icon}</div>
      <p className="mt-4 text-sm font-black text-slate-300">{title}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-400">{note}</p>
    </div>
  );
}
