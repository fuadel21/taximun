import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PassengerTripTrackingMap, type TrackingPoint } from "@/components/PassengerTripTrackingMap";
import { TripChatPanel } from "@/components/TripChatPanel";
import { Button } from "@/components/ui/button";
import { AlertCircle, Car, CheckCircle2, Clock3, MapPin, Navigation, Share2 } from "lucide-react";

type LiveTrip = {
  ride: {
    id: string;
    status: "assigned" | "in_progress";
    pickup_address?: string | null;
    dropoff_address?: string | null;
    pickup_lat?: number | string | null;
    pickup_lng?: number | string | null;
    dropoff_lat?: number | string | null;
    dropoff_lng?: number | string | null;
    driver_name?: string | null;
    taxi_code?: string | null;
    plate?: string | null;
    share_token?: string | null;
  };
  driver?: {
    driver_name?: string | null;
    taxi_code?: string | null;
    plate?: string | null;
    current_lat?: number | string | null;
    current_lng?: number | string | null;
    updated_at?: string | null;
  } | null;
  phase: "driver_approaching" | "driver_arrived" | "in_progress";
};

function point(lat: unknown, lng: unknown): TrackingPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function PassengerLiveTrackingSection() {
  const [shared, setShared] = useState(false);
  const query = trpc.system.taxiLiveTrip.passenger.getLiveTrip.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const data = (query.data ?? null) as LiveTrip | null;

  if (!data) return null;

  const pickup = point(data.ride.pickup_lat, data.ride.pickup_lng);
  const dropoff = point(data.ride.dropoff_lat, data.ride.dropoff_lng);
  const driver = point(data.driver?.current_lat, data.driver?.current_lng);
  const phaseTitle = data.phase === "in_progress"
    ? "Viaje en curso"
    : data.phase === "driver_arrived"
      ? "Tu taxi ha llegado"
      : "El conductor está en camino";
  const phaseText = data.phase === "in_progress"
    ? "Sigue el recorrido hasta tu destino en tiempo real."
    : data.phase === "driver_arrived"
      ? "Dirígete al punto de recogida. El conductor está esperando."
      : "La posición y la ruta se actualizan automáticamente.";

  const shareTrip = async () => {
    if (!data.ride.share_token) return;
    const url = `${window.location.origin}/track/${data.ride.share_token}`;
    const text = `Sigue mi viaje Taximun: ${url}`;
    try {
      if ("share" in navigator && typeof navigator.share === "function") {
        await navigator.share({ title: "Seguimiento Taximun", text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {}
  };

  return (
    <section className="mx-auto max-w-5xl space-y-3 px-4 pt-4">
      {query.error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mr-2 inline h-4 w-4" />{query.error.message}
        </div>
      )}

      <div className={`rounded-3xl border p-4 shadow-sm ${data.phase === "driver_arrived" ? "border-amber-200 bg-amber-50 text-amber-900" : data.phase === "in_progress" ? "border-cyan-200 bg-cyan-50 text-cyan-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
            {data.phase === "driver_arrived" ? <MapPin className="h-5 w-5 text-amber-600" /> : data.phase === "in_progress" ? <Navigation className="h-5 w-5 text-cyan-600" /> : <Car className="h-5 w-5 text-blue-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black">{phaseTitle}</p>
            <p className="mt-1 text-xs font-bold opacity-85">{phaseText}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{data.driver?.driver_name || data.ride.driver_name || "Conductor"} · {data.driver?.taxi_code || data.ride.taxi_code || "Taxi"} · {data.driver?.plate || data.ride.plate || "Matrícula"}</p>
          </div>
          {data.phase === "driver_arrived" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Clock3 className="h-5 w-5 shrink-0" />}
        </div>
      </div>

      {(pickup || dropoff || driver) ? (
        <PassengerTripTrackingMap
          pickup={pickup}
          dropoff={dropoff}
          driver={driver}
          status={data.ride.status}
          driverName={data.driver?.driver_name || data.ride.driver_name}
          taxiCode={data.driver?.taxi_code || data.ride.taxi_code}
        />
      ) : (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <MapPin className="mr-2 inline h-4 w-4" />El seguimiento aparecerá cuando el viaje tenga coordenadas.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="rounded-2xl bg-white px-3 py-3 text-xs font-bold text-slate-500 shadow-sm">
          {data.ride.pickup_address || "Recogida"} → {data.ride.dropoff_address || "Destino"}
        </div>
        <Button onClick={shareTrip} disabled={!data.ride.share_token} variant="outline" className="h-11 rounded-2xl bg-white font-black">
          <Share2 className="mr-2 h-4 w-4" />{shared ? "Enlace copiado" : "Compartir viaje"}
        </Button>
      </div>

      <TripChatPanel rideId={data.ride.id} role="passenger" />
    </section>
  );
}
