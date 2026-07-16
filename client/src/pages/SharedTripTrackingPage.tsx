import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { PassengerTripTrackingMap, type TrackingPoint } from "@/components/PassengerTripTrackingMap";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Car, CheckCircle2, Clock3, Loader2, MapPin, Navigation } from "lucide-react";

type SharedTrip = {
  ride: {
    id: string;
    status: string;
    driver_name?: string | null;
    taxi_code?: string | null;
    plate?: string | null;
    pickup_address?: string | null;
    dropoff_address?: string | null;
    pickup_lat?: number | string | null;
    pickup_lng?: number | string | null;
    dropoff_lat?: number | string | null;
    dropoff_lng?: number | string | null;
  };
  driver?: {
    driver_name?: string | null;
    taxi_code?: string | null;
    plate?: string | null;
    current_lat?: number | string | null;
    current_lng?: number | string | null;
    updated_at?: string | null;
  } | null;
  phase: "driver_approaching" | "driver_arrived" | "in_progress" | "completed";
};

function point(lat: unknown, lng: unknown): TrackingPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export default function SharedTripTrackingPage() {
  const [, params] = useRoute("/track/:token");
  const token = params?.token || "";
  const query = trpc.system.taxiLiveTrip.public.getSharedTrip.useQuery(
    { token },
    { enabled: Boolean(token), retry: false, refetchInterval: 5000, refetchOnWindowFocus: true }
  );
  const data = (query.data ?? null) as SharedTrip | null;

  if (query.isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb]"><Loader2 className="h-9 w-9 animate-spin text-cyan-600" /></main>;
  }

  if (query.error || !data) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-10">
        <Card className="mx-auto max-w-xl rounded-[1.75rem] border-white bg-white shadow-xl">
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-3 text-2xl font-black">Seguimiento no disponible</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">{query.error?.message || "El enlace ha caducado o fue desactivado."}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const pickup = point(data.ride.pickup_lat, data.ride.pickup_lng);
  const dropoff = point(data.ride.dropoff_lat, data.ride.dropoff_lng);
  const driver = point(data.driver?.current_lat, data.driver?.current_lng);
  const title = data.phase === "completed" ? "Viaje finalizado" : data.phase === "in_progress" ? "En camino al destino" : data.phase === "driver_arrived" ? "El taxi ha llegado" : "El taxi está en camino";
  const icon = data.phase === "completed" ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : data.phase === "driver_arrived" ? <MapPin className="h-6 w-6 text-amber-300" /> : data.phase === "in_progress" ? <Navigation className="h-6 w-6 text-cyan-300" /> : <Car className="h-6 w-6 text-blue-300" />;

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Seguimiento compartido Taximun</p>
              <h1 className="mt-1 text-3xl font-black">{title}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-300">{data.driver?.driver_name || data.ride.driver_name || "Conductor"} · {data.driver?.taxi_code || data.ride.taxi_code || "Taxi"} · {data.driver?.plate || data.ride.plate || "Matrícula"}</p>
            </div>
            {icon}
          </div>
        </section>

        <PassengerTripTrackingMap
          pickup={pickup}
          dropoff={dropoff}
          driver={driver}
          status={data.phase === "completed" ? "completed" : data.phase === "in_progress" ? "in_progress" : "assigned"}
          driverName={data.driver?.driver_name || data.ride.driver_name}
          taxiCode={data.driver?.taxi_code || data.ride.taxi_code}
        />

        <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
          <CardContent className="space-y-3 p-4 text-sm font-bold text-slate-700">
            <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{data.ride.pickup_address || "Punto de recogida"}</p>
            <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{data.ride.dropoff_address || "Destino"}</p>
            <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500"><Clock3 className="mr-1 inline h-4 w-4" />La ubicación se actualiza aproximadamente cada 5 segundos mientras el conductor comparte GPS.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
