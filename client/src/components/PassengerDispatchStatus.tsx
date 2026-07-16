import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Car, CheckCircle2, Clock3, Loader2, Search, Sparkles } from "lucide-react";

type DispatchStatus = {
  rideId: string;
  rideStatus: string;
  phase: "searching_driver" | "waiting_driver_response" | "driver_assigned" | "search_delayed";
  attempts: number;
  activeOfferExpiresAt?: string | null;
  driverName?: string | null;
  taxiCode?: string | null;
  plate?: string | null;
  waitingSeconds?: number;
  lastAttemptStatus?: string | null;
};

export function PassengerDispatchStatus() {
  const query = trpc.system.taxiRideOffers.passenger.getDispatchStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
  const status = (query.data ?? null) as DispatchStatus | null;

  if (!status) return null;

  const assigned = status.phase === "driver_assigned";
  const waiting = status.phase === "waiting_driver_response";
  const delayed = status.phase === "search_delayed";
  const title = assigned ? "Conductor localizado" : waiting ? "Esperando respuesta" : delayed ? "Búsqueda ampliada" : "Buscando conductor";
  const text = assigned
    ? `${status.driverName || "Tu conductor"} · ${status.taxiCode || "Taxi"} · ${status.plate || "matrícula pendiente"}`
    : waiting
      ? "Un conductor cercano está revisando tu solicitud. Si no responde, buscamos al siguiente automáticamente."
      : delayed
        ? "La búsqueda está tardando más de lo habitual. Taximun sigue limpiando ofertas caducadas y buscando conductores con GPS reciente."
        : "Estamos comparando conductores verificados, disponibles y con GPS reciente.";

  const classes = assigned
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : waiting
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : delayed
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-cyan-200 bg-cyan-50 text-cyan-900";

  return (
    <section className="mx-auto max-w-5xl px-4 pt-4">
      <div className={`rounded-3xl border p-4 shadow-sm ${classes}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            {assigned ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : waiting ? <Clock3 className="h-5 w-5 text-blue-600" /> : delayed ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : query.isFetching ? <Loader2 className="h-5 w-5 animate-spin text-cyan-600" /> : <Search className="h-5 w-5 text-cyan-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black">{title}</p>
              <Badge className="bg-white text-slate-700 hover:bg-white"><Sparkles className="mr-1 h-3.5 w-3.5" />Intentos {status.attempts}</Badge>
              {status.waitingSeconds ? <Badge className="bg-white text-slate-700 hover:bg-white">{Math.floor(status.waitingSeconds / 60)}m {status.waitingSeconds % 60}s</Badge> : null}
            </div>
            <p className="mt-1 text-xs font-bold opacity-85">{text}</p>
          </div>
          <Car className="h-5 w-5 shrink-0 opacity-60" />
        </div>
      </div>
    </section>
  );
}
