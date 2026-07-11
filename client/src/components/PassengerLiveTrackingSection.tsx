import { trpc } from "@/lib/trpc";
import { PassengerTripTrackingMap, type TrackingPoint } from "@/components/PassengerTripTrackingMap";
import { AlertCircle, MapPin } from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type CurrentRide = {
  id: string;
  status: RideStatus;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  pickup_lat?: number | string | null;
  pickup_lng?: number | string | null;
  dropoff_lat?: number | string | null;
  dropoff_lng?: number | string | null;
};

type LiveStatus = {
  rideId: string;
  driverName?: string | null;
  taxiCode?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  etaMinutes?: number | null;
};

function point(lat: unknown, lng: unknown): TrackingPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function PassengerLiveTrackingSection() {
  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const currentRide = (currentRideQuery.data ?? null) as CurrentRide | null;
  const liveStatusQuery = trpc.system.taxiPassengerTracking.getAssignedDriverLiveStatus.useQuery(undefined, {
    enabled: Boolean(currentRide && ["assigned", "in_progress"].includes(currentRide.status)),
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const liveStatus = (liveStatusQuery.data ?? null) as LiveStatus | null;

  if (!currentRide) return null;

  const pickup = point(currentRide.pickup_lat, currentRide.pickup_lng);
  const dropoff = point(currentRide.dropoff_lat, currentRide.dropoff_lng);
  const driver = point(liveStatus?.currentLat, liveStatus?.currentLng);

  if (!pickup && !dropoff && !driver) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <MapPin className="mr-2 inline h-4 w-4" />El seguimiento aparecerá cuando el viaje tenga coordenadas de origen o destino.
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pt-4">
      {(currentRideQuery.error || liveStatusQuery.error) && (
        <div className="mb-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {currentRideQuery.error?.message || liveStatusQuery.error?.message}
        </div>
      )}
      <PassengerTripTrackingMap
        pickup={pickup}
        dropoff={dropoff}
        driver={driver}
        status={currentRide.status}
        driverName={liveStatus?.driverName}
        taxiCode={liveStatus?.taxiCode}
        etaMinutes={liveStatus?.etaMinutes}
      />
      <div className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm">
        {currentRide.pickup_address || "Recogida"} → {currentRide.dropoff_address || "Destino"}
      </div>
    </section>
  );
}
