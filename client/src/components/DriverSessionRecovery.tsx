import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Car, Loader2, RotateCcw } from "lucide-react";

type RecoveryState = {
  pendingOffer?: { id: string } | null;
  activeRide?: { id: string; status: string; dropoff_address?: string | null } | null;
  resumePath?: string | null;
};

export function DriverSessionRecovery() {
  const [, setLocation] = useLocation();
  const query = trpc.system.taxiRideOffers.driver.recoverSession.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 pt-4">
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-800">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Recuperando estado del turno...
        </div>
      </section>
    );
  }

  if (query.error || !query.data) return null;
  const state = query.data as RecoveryState;
  if (!state.activeRide && !state.pendingOffer) return null;

  const hasRide = Boolean(state.activeRide);
  const title = hasRide ? "Viaje recuperado" : "Oferta recuperada";
  const text = hasRide
    ? `Tienes un viaje ${state.activeRide?.status === "in_progress" ? "en curso" : "asignado"}. Puedes continuar desde navegación.`
    : "Tienes una oferta activa que todavía no ha caducado.";

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4">
      <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
        <div className="mt-0.5"><AlertTriangle className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-black">{title}</p>
          <p className="mt-1 text-xs font-bold opacity-85">{text}</p>
        </div>
        <Button onClick={() => setLocation(state.resumePath || "/driver")} className="shrink-0 rounded-2xl bg-slate-950 font-black text-white">
          {hasRide ? <Car className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
          Continuar
        </Button>
      </div>
    </section>
  );
}
