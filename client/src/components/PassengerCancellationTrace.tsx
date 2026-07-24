import { AlertTriangle, CalendarClock, FileText, UserRound } from "lucide-react";

type CancellationTraceProps = {
  status: string;
  cancelledAt?: string | null;
  cancelledByRole?: string | null;
  reason?: string | null;
  note?: string | null;
};

const reasonLabels: Record<string, string> = {
  changed_mind: "Cambio de opinión",
  wait_too_long: "Espera excesiva",
  wrong_pickup: "Punto de recogida incorrecto",
  driver_delay: "Retraso del conductor",
  duplicate_request: "Solicitud duplicada",
  operational: "Incidencia operativa",
  passenger_no_show: "Pasajero ausente",
  vehicle_breakdown: "Avería del vehículo",
  driver_emergency: "Emergencia del conductor",
  unsafe_pickup: "Recogida insegura",
  other: "Otro motivo",
  legacy_unspecified: "Motivo no especificado",
};

function actorLabel(role?: string | null) {
  if (role === "passenger") return "Pasajero";
  if (role === "driver") return "Conductor";
  if (role === "admin") return "Administración";
  if (role === "system") return "Sistema";
  return "No identificado";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha registrada";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PassengerCancellationTrace({
  status,
  cancelledAt,
  cancelledByRole,
  reason,
  note,
}: CancellationTraceProps) {
  if (status !== "cancelled") return null;

  return (
    <section className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-950">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">Información de la cancelación</p>
          <div className="mt-3 grid gap-2 text-sm font-bold sm:grid-cols-2">
            <p className="rounded-2xl bg-white/80 p-3">
              <UserRound className="mr-2 inline h-4 w-4 text-red-600" />
              Cancelado por: <span className="text-slate-950">{actorLabel(cancelledByRole)}</span>
            </p>
            <p className="rounded-2xl bg-white/80 p-3">
              <FileText className="mr-2 inline h-4 w-4 text-red-600" />
              Motivo: <span className="text-slate-950">{reasonLabels[reason || ""] || "No especificado"}</span>
            </p>
            <p className="rounded-2xl bg-white/80 p-3 sm:col-span-2">
              <CalendarClock className="mr-2 inline h-4 w-4 text-red-600" />
              Fecha: <span className="text-slate-950">{formatDate(cancelledAt)}</span>
            </p>
          </div>
          {note ? (
            <div className="mt-2 rounded-2xl border border-red-100 bg-white p-3 text-sm font-bold text-slate-700">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-red-600">Nota registrada</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{note}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
