import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, Loader2, MapPin, PhoneCall, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  rideId: string;
  latitude?: number | null;
  longitude?: number | null;
  shareUrl?: string | null;
};

type SafetyReport = {
  id: string;
  ride_id?: string | null;
  category: string;
  priority: string;
  title: string;
  description?: string | null;
  status: "open" | "in_review" | "resolved" | "dismissed";
  resolution_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

const STATUS_LABEL: Record<SafetyReport["status"], string> = {
  open: "Enviada",
  in_review: "En revisión",
  resolved: "Resuelta",
  dismissed: "Cerrada",
};

const STATUS_STYLE: Record<SafetyReport["status"], string> = {
  open: "bg-red-100 text-red-800",
  in_review: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-700",
};

export function TripSafetyCenter({ rideId, latitude, longitude, shareUrl }: Props) {
  const [sent, setSent] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const utils = trpc.useUtils();
  const reportsQuery = trpc.system.taxiSafety.getMyReports.useQuery(undefined, {
    refetchInterval: historyOpen ? 10_000 : false,
    refetchOnWindowFocus: true,
  });
  const createReport = trpc.system.taxiSafety.createReport.useMutation({
    onSuccess: async () => {
      setSent(true);
      navigator.vibrate?.([250, 120, 250]);
      await utils.system.taxiSafety.getMyReports.invalidate();
    },
  });

  const rideReports = useMemo(
    () => ((reportsQuery.data ?? []) as SafetyReport[]).filter((report) => report.ride_id === rideId),
    [reportsQuery.data, rideId],
  );
  const latestReport = rideReports[0] ?? null;

  const sendSos = () => {
    createReport.mutate({
      rideId,
      category: "sos",
      priority: "critical",
      title: "SOS durante viaje activo",
      description: shareUrl
        ? `Alerta crítica enviada desde el viaje. Seguimiento: ${shareUrl}`
        : "Alerta crítica enviada desde el centro de seguridad del viaje.",
      lat: latitude ?? undefined,
      lng: longitude ?? undefined,
    });
  };

  return (
    <section className="rounded-3xl border border-red-200 bg-red-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-red-700 shadow-sm">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-red-950">Centro de seguridad</p>
          <p className="mt-1 text-xs font-bold text-red-800/80">El SOS registra una alerta crítica ligada al viaje y la hace visible para administración.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-red-900">
        <div className="rounded-2xl bg-white/80 p-3"><MapPin className="mr-2 inline h-4 w-4" />Ubicación incluida</div>
        <div className="rounded-2xl bg-white/80 p-3"><AlertTriangle className="mr-2 inline h-4 w-4" />Prioridad crítica</div>
      </div>

      {(sent || latestReport) && (
        <div className="mt-3 rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-900"><CheckCircle2 className="mr-2 inline h-5 w-5 text-emerald-600" />Alerta registrada</p>
            {latestReport && <span className={`rounded-full px-3 py-1 text-[11px] font-black ${STATUS_STYLE[latestReport.status]}`}>{STATUS_LABEL[latestReport.status]}</span>}
          </div>
          {latestReport && <p className="mt-2 text-xs font-bold text-slate-500">Actualizada {new Date(latestReport.resolved_at || latestReport.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</p>}
          {latestReport?.resolution_note && <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">Respuesta: {latestReport.resolution_note}</p>}
        </div>
      )}

      {!sent && !latestReport && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button onClick={sendSos} disabled={createReport.isPending} className="h-14 rounded-2xl bg-red-600 text-base font-black text-white hover:bg-red-500">
            {createReport.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldAlert className="mr-2 h-5 w-5" />}Enviar SOS
          </Button>
          <Button asChild variant="outline" className="h-14 rounded-2xl border-red-200 bg-white text-base font-black text-red-700">
            <a href="tel:112"><PhoneCall className="mr-2 h-5 w-5" />Llamar al 112</a>
          </Button>
        </div>
      )}

      <Button onClick={() => setHistoryOpen((value) => !value)} variant="outline" className="mt-3 h-11 w-full rounded-2xl border-red-200 bg-white font-black text-red-800">
        <Clock3 className="mr-2 h-4 w-4" />Historial de seguridad {historyOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
      </Button>

      {historyOpen && (
        <div className="mt-3 space-y-2 rounded-2xl bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Alertas de este viaje</p>
            <Button onClick={() => reportsQuery.refetch()} disabled={reportsQuery.isFetching} variant="ghost" className="h-9 rounded-xl px-3 text-xs font-black">
              <RefreshCw className={`mr-1 h-4 w-4 ${reportsQuery.isFetching ? "animate-spin" : ""}`} />Actualizar
            </Button>
          </div>
          {!reportsQuery.isLoading && rideReports.length === 0 && <p className="py-4 text-center text-xs font-bold text-slate-400">No hay alertas registradas en este viaje.</p>}
          {rideReports.map((report) => (
            <div key={report.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-black text-slate-900">{report.title}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{new Date(report.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</p></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS_STYLE[report.status]}`}>{STATUS_LABEL[report.status]}</span>
              </div>
              {report.resolution_note && <p className="mt-2 text-xs font-bold text-emerald-700">{report.resolution_note}</p>}
            </div>
          ))}
          {reportsQuery.error && <p className="text-xs font-bold text-red-700">{reportsQuery.error.message}</p>}
        </div>
      )}

      {createReport.error && <p className="mt-2 text-xs font-bold text-red-700">{createReport.error.message}</p>}
      <p className="mt-3 text-[11px] font-bold text-red-800/70">Usa el 112 ante una emergencia real. El aviso de Taximun no sustituye a los servicios de emergencia.</p>
    </section>
  );
}
