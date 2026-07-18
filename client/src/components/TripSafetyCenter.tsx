import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, PhoneCall, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  rideId: string;
  latitude?: number | null;
  longitude?: number | null;
  shareUrl?: string | null;
};

export function TripSafetyCenter({ rideId, latitude, longitude, shareUrl }: Props) {
  const [sent, setSent] = useState(false);
  const createReport = trpc.system.taxiSafety.createReport.useMutation({
    onSuccess: () => {
      setSent(true);
      navigator.vibrate?.([250, 120, 250]);
    },
  });

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
          <p className="mt-1 text-xs font-bold text-red-800/80">
            El SOS registra una alerta crítica ligada al viaje y la hace visible para administración.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-red-900">
        <div className="rounded-2xl bg-white/80 p-3">
          <MapPin className="mr-2 inline h-4 w-4" />Ubicación incluida
        </div>
        <div className="rounded-2xl bg-white/80 p-3">
          <AlertTriangle className="mr-2 inline h-4 w-4" />Prioridad crítica
        </div>
      </div>

      {sent ? (
        <div className="mt-3 rounded-2xl bg-white p-4 text-sm font-black text-emerald-700">
          <CheckCircle2 className="mr-2 inline h-5 w-5" />SOS enviado correctamente
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            onClick={sendSos}
            disabled={createReport.isPending}
            className="h-14 rounded-2xl bg-red-600 text-base font-black text-white hover:bg-red-500"
          >
            {createReport.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldAlert className="mr-2 h-5 w-5" />}
            Enviar SOS
          </Button>
          <Button asChild variant="outline" className="h-14 rounded-2xl border-red-200 bg-white text-base font-black text-red-700">
            <a href="tel:112"><PhoneCall className="mr-2 h-5 w-5" />Llamar al 112</a>
          </Button>
        </div>
      )}

      {createReport.error && <p className="mt-2 text-xs font-bold text-red-700">{createReport.error.message}</p>}
      <p className="mt-3 text-[11px] font-bold text-red-800/70">Usa el 112 ante una emergencia real. El aviso de Taximun no sustituye a los servicios de emergencia.</p>
    </section>
  );
}
