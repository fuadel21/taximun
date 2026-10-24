import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, ROUTING_BASE_URL } from "@/lib/map-config";

export type TrackingPoint = {
  latitude: number;
  longitude: number;
};

type PassengerTripTrackingMapProps = {
  pickup?: TrackingPoint | null;
  dropoff?: TrackingPoint | null;
  driver?: TrackingPoint | null;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";
  driverName?: string | null;
  taxiCode?: string | null;
  etaMinutes?: number | null;
};

type RouteGeometry = {
  points: [number, number][];
  durationMinutes?: number | null;
  distanceKm?: number | null;
};

const fallbackCenter: [number, number] = [41.3874, 2.1686];

function validPoint(point?: TrackingPoint | null): point is TrackingPoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
  );
}

function markerIcon(kind: "pickup" | "dropoff" | "driver") {
  const content = kind === "pickup" ? "●" : kind === "dropoff" ? "◆" : "🚕";
  const className = kind === "pickup" ? "taximun-marker-pickup" : kind === "dropoff" ? "taximun-marker-dropoff" : "taximun-marker-driver";

  return L.divIcon({
    className: "taximun-tracking-marker-wrapper",
    html: `<div class="${className}">${content}</div>`,
    iconSize: kind === "driver" ? [42, 42] : [30, 30],
    iconAnchor: kind === "driver" ? [21, 21] : [15, 15],
    popupAnchor: [0, -18],
  });
}

async function fetchRoadRoute(from: TrackingPoint, to: TrackingPoint): Promise<RouteGeometry | null> {
  try {
    const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const response = await fetch(
      `${ROUTING_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const route = payload?.routes?.[0];
    const coordinatesList = route?.geometry?.coordinates;
    if (!Array.isArray(coordinatesList) || coordinatesList.length < 2) return null;

    return {
      points: coordinatesList.map((item: number[]) => [item[1], item[0]] as [number, number]),
      durationMinutes: Number.isFinite(route.duration) ? Math.max(1, Math.round(route.duration / 60)) : null,
      distanceKm: Number.isFinite(route.distance) ? Number((route.distance / 1000).toFixed(1)) : null,
    };
  } catch {
    return null;
  }
}

export function PassengerTripTrackingMap({
  pickup,
  dropoff,
  driver,
  status,
  driverName,
  taxiCode,
  etaMinutes,
}: PassengerTripTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const activeRouteRef = useRef<L.Polyline | null>(null);
  const tripRouteRef = useRef<L.Polyline | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteGeometry | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(fallbackCenter, 13);

    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (validPoint(pickup)) {
      const latLng: L.LatLngExpression = [pickup.latitude, pickup.longitude];
      if (pickupMarkerRef.current) pickupMarkerRef.current.setLatLng(latLng);
      else {
        pickupMarkerRef.current = L.marker(latLng, { icon: markerIcon("pickup") })
          .bindPopup("Punto de recogida")
          .addTo(map);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    if (validPoint(dropoff)) {
      const latLng: L.LatLngExpression = [dropoff.latitude, dropoff.longitude];
      if (dropoffMarkerRef.current) dropoffMarkerRef.current.setLatLng(latLng);
      else {
        dropoffMarkerRef.current = L.marker(latLng, { icon: markerIcon("dropoff") })
          .bindPopup("Destino")
          .addTo(map);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }

    if (validPoint(driver)) {
      const latLng: L.LatLngExpression = [driver.latitude, driver.longitude];
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng(latLng);
        driverMarkerRef.current.setPopupContent(`${driverName || "Conductor"}${taxiCode ? ` · ${taxiCode}` : ""}`);
      } else {
        driverMarkerRef.current = L.marker(latLng, {
          icon: markerIcon("driver"),
          zIndexOffset: 1000,
        })
          .bindPopup(`${driverName || "Conductor"}${taxiCode ? ` · ${taxiCode}` : ""}`)
          .addTo(map);
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }

    const boundsPoints = [pickup, dropoff, driver]
      .filter(validPoint)
      .map((point) => [point.latitude, point.longitude] as [number, number]);

    if (boundsPoints.length >= 2) map.fitBounds(L.latLngBounds(boundsPoints), { padding: [42, 42], maxZoom: 16 });
    else if (boundsPoints.length === 1) map.setView(boundsPoints[0], 15);

    window.setTimeout(() => map.invalidateSize(), 80);
  }, [pickup, dropoff, driver, driverName, taxiCode]);

  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    if (!map) return;

    const drawRoutes = async () => {
      activeRouteRef.current?.remove();
      tripRouteRef.current?.remove();
      activeRouteRef.current = null;
      tripRouteRef.current = null;
      setRouteSummary(null);

      if (validPoint(pickup) && validPoint(dropoff)) {
        const fullTrip = await fetchRoadRoute(pickup, dropoff);
        if (cancelled) return;
        const points = fullTrip?.points ?? [
          [pickup.latitude, pickup.longitude],
          [dropoff.latitude, dropoff.longitude],
        ];
        tripRouteRef.current = L.polyline(points, {
          color: "#64748b",
          weight: 5,
          opacity: 0.55,
          dashArray: "10 10",
        }).addTo(map);
      }

      const activeTarget = status === "assigned" ? pickup : status === "in_progress" ? dropoff : null;
      if (validPoint(driver) && validPoint(activeTarget)) {
        const activeRoute = await fetchRoadRoute(driver, activeTarget);
        if (cancelled) return;
        const points = activeRoute?.points ?? [
          [driver.latitude, driver.longitude],
          [activeTarget.latitude, activeTarget.longitude],
        ];
        activeRouteRef.current = L.polyline(points, {
          color: "#0891b2",
          weight: 7,
          opacity: 0.9,
        }).addTo(map);
        setRouteSummary(activeRoute);
      }
    };

    drawRoutes();
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, driver, status]);

  const displayEta = routeSummary?.durationMinutes ?? etaMinutes ?? null;

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white bg-slate-200 shadow-xl">
      <style>{`
        .taximun-tracking-marker-wrapper { background: transparent; border: 0; }
        .taximun-marker-pickup, .taximun-marker-dropoff, .taximun-marker-driver {
          display: flex; align-items: center; justify-content: center; border-radius: 999px;
          border: 3px solid white; box-shadow: 0 8px 24px rgba(15,23,42,.3); font-weight: 900;
        }
        .taximun-marker-pickup { width: 30px; height: 30px; background: #06b6d4; color: white; }
        .taximun-marker-dropoff { width: 30px; height: 30px; background: #0f172a; color: white; }
        .taximun-marker-driver { width: 42px; height: 42px; background: white; font-size: 23px; transition: transform .4s ease; }
      `}</style>
      <div ref={containerRef} className="h-[390px] w-full" />
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="rounded-2xl bg-slate-950/90 px-3 py-2 text-white shadow-lg backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Seguimiento en directo</p>
          <p className="text-sm font-black">
            {status === "pending" ? "Buscando conductor" : status === "assigned" ? "Conductor hacia recogida" : status === "in_progress" ? "En camino al destino" : "Viaje actualizado"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/95 px-3 py-2 text-right shadow-lg backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">ETA</p>
          <p className="text-lg font-black text-slate-950">{displayEta ? `${displayEta} min` : "Esperando GPS"}</p>
          {routeSummary?.distanceKm ? <p className="text-xs font-bold text-slate-500">{routeSummary.distanceKm} km</p> : null}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-[500] rounded-2xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur">
        <span className="text-cyan-600">●</span> Recogida · <span className="text-slate-950">◆</span> Destino · 🚕 Conductor
      </div>
    </div>
  );
}
