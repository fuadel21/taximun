import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Car, CheckCircle2, Clock3, Loader2, Search, Sparkles, XCircle } from "lucide-react";

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

type CancellationReason = "changed_mind" | "wait_too_long" | "wrong_pickup" | "driver_delay" | "duplicate_request" | "other";

export function PassengerDispatchStatus() {
  const utils = trpc.useUtils();
  const [showCancellation, setShowCancellation] = useState(false);
  const [reason, setReason] = useState<CancellationReason>("changed_mind");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");

  const query = trpc.system.taxiRideOffers.passenger.getDispatchStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
  const cancelRide = trpc.system.taxiPassengerCancellation.cancel.useMutation({
    onSuccess: async () => {
      setActionError("");
      setShowCancellation(false);
      setNote("");
      await query.refetch();
      await utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      await utils.system.taxiOps.passenger.getRideHistory.invalidate();
    },
    onError: (error) => setActionError(error.message),
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

  const submitCancellation = () => {
    const confirmed = window.confirm("¿Confirmas que quieres cancelar este servicio? El motivo quedará registrado.");
    if (!confirmed) return;
    cancelRide.mutate({ rideId: status.rideId, reason, note: note.trim() || undefined });
  };

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

        <Button type="button" variant="outline" onClick={() => setShowCancellation((value) => !value)} className="mt-3 h-10 w-full rounded-2xl border-white/80 bg-white font-black text-slate-800 hover:bg-white/90">
          <XCircle className="mr-2 h-4 w-4" />{showCancellation ? "Cerrar cancelación" : "Cancelar servicio"}
        </Button>

        {showCancellation && (
          <div className="mt-3 space-y-3 rounded-2xl bg-white p-3 text-slate-800 shadow-sm">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Motivo</label>
              <select value={reason} onChange={(event) => setReason(event.target.value as CancellationReason)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
                <option value="changed_mind">He cambiado de opinión</option>
                <option value="wait_too_long">La búsqueda tarda demasiado</option>
                <option value="wrong_pickup">Punto de recogida incorrecto</option>
                <option value="driver_delay">El conductor se retrasa</option>
                <option value="duplicate_request">Solicitud duplicada</option>
                <option value="other">Otro motivo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Nota opcional</label>
              <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold" placeholder="Añade un detalle si es necesario" />
              <p className="mt-1 text-right text-[11px] font-bold text-slate-400">{note.length}/500</p>
            </div>
            {actionError && <p className="rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">{actionError}</p>}
            <Button type="button" onClick={submitCancellation} disabled={cancelRide.isPending} className="h-11 w-full rounded-xl bg-red-600 font-black text-white hover:bg-red-500">
              {cancelRide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}Confirmar cancelación
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
