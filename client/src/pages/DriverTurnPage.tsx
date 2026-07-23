import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Loader2, MapPin, Navigation, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";
import DriverPanelModern from "./DriverPanelModern";

type ActiveRide = {
  id: string;
  status: "assigned" | "in_progress";
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
};

export default function DriverTurnPage() {
  const [, setLocation] = useLocation();
  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  if (activeQuery.isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
      </main>
    );
  }

  const active = (activeQuery.data ?? null) as ActiveRide | null;
  if (!active) return <DriverPanelModern />;

  const inProgress = active.status === "in_progress";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <Card className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border-white/10 bg-white text-slate-950 shadow-2xl">
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Servicio activo</p>
              <h1 className="mt-1 text-3xl font-black">{inProgress ? "Viaje en curso" : "Dirígete a la recogida"}</h1>
              <p className="mt-2 text-sm font-bold text-slate-500">{active.passenger_name || "Pasajero"}</p>
            </div>
            <Badge className={inProgress ? "bg-cyan-100 text-cyan-800 hover:bg-cyan-100" : "bg-blue-100 text-blue-800 hover:bg-blue-100"}>
              <Car className="mr-1 h-4 w-4" />{inProgress ? "En viaje" : "Asignado"}
            </Badge>
          </div>

          <div className="space-y-3 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
            <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{active.pickup_address}</p>
            <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{active.dropoff_address}</p>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            {inProgress
              ? "Finaliza el servicio únicamente desde el cierre profesional, confirmando importe y pago."
              : "Para iniciar debes abrir la navegación, marcar «He llegado» e introducir el PIN del pasajero."}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => setLocation("/driver/navigation")} className="h-14 rounded-2xl bg-blue-600 text-base font-black text-white hover:bg-blue-500">
              <Navigation className="mr-2 h-5 w-5" />Abrir navegación
            </Button>
            <Button onClick={() => setLocation("/driver/queue")} className="h-14 rounded-2xl bg-emerald-600 text-base font-black text-white hover:bg-emerald-500">
              <ReceiptText className="mr-2 h-5 w-5" />Ir al cierre
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
