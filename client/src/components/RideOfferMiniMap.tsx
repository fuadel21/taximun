import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchDrivingRoute } from "@/lib/osm-services";

export type OfferPoint = { lat: number; lng: number; address?: string };

type RideOfferMiniMapProps = {
  pickup: OfferPoint;
  dropoff?: OfferPoint | null;
  driverAt?: OfferPoint | null;
  className?: string;
};

function marker(kind: "pickup" | "dropoff" | "driver") {
  const content = kind === "pickup" ? "●" : kind === "dropoff" ? "◆" : "🚕";
  const style =
    kind === "driver"
      ? "background:#09090b;color:#22d3ee;border:2px solid #22d3ee;"
      : kind === "pickup"
        ? "background:#09090b;color:#fff;border:2px solid #fff;"
        : "background:#ffffff;color:#09090b;border:2px solid #09090b;";
  return L.divIcon({
    className: "taximun-tracking-marker-wrapper",
    html: `<div style="${style}position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;font-size:13px;font-weight:900;box-shadow:0 3px 8px rgba(0,0,0,.3);">${content}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/**
 * Mini-mapa de una oferta de viaje para el conductor: tu posición 🚕, el punto
 * de recogida, el destino y las rutas (tú→recogida con ETA real por OSRM y
 * recogida→destino en trazo suave). Ayuda a decidir antes de aceptar.
 */
export function RideOfferMiniMap({ pickup, dropoff, driverAt, className }: RideOfferMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker | null>>({});
  const toPickupLineRef = useRef<L.Polyline | null>(null);
  const tripLineRef = useRef<L.Polyline | null>(null);
  const [approach, setApproach] = useState<{ minutes: number; km: number } | null>(null);
  const [approachLoading, setApproachLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([pickup.lat, pickup.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
      toPickupLineRef.current = null;
      tripLineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMarker = (key: "pickup" | "dropoff" | "driver", point: OfferPoint | null | undefined, popup: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (point) {
      const latLng: L.LatLngExpression = [point.lat, point.lng];
      if (markersRef.current[key]) markersRef.current[key]!.setLatLng(latLng);
      else markersRef.current[key] = L.marker(latLng, { icon: marker(key), zIndexOffset: key === "driver" ? 500 : 0 }).bindPopup(popup).addTo(map);
    } else if (markersRef.current[key]) {
      markersRef.current[key]!.remove();
      markersRef.current[key] = null;
    }
  };

  useEffect(() => {
    setMarker("pickup", pickup, `Recogida: ${pickup.address || "punto de recogida"}`);
    setMarker("dropoff", dropoff, `Destino: ${dropoff?.address || "destino"}`);
    setMarker("driver", driverAt, "Tu posición");
  }, [pickup, dropoff, driverAt]);

  // Ruta tú → recogida (OSRM) + ETA.
  useEffect(() => {
    let stale = false;
    if (!driverAt) {
      setApproach(null);
      return;
    }
    setApproachLoading(true);
    fetchDrivingRoute(driverAt, pickup).then((route) => {
      if (stale) return;
      setApproachLoading(false);
      const map = mapRef.current;
      if (!map) return;
      if (route && toPickupLineRef.current) toPickupLineRef.current.setLatLngs(route.coords);
      else if (route) toPickupLineRef.current = L.polyline(route.coords, { color: "#09090b", weight: 4, opacity: 0.9 }).addTo(map);
      if (route) setApproach({ minutes: route.durationMinutes, km: route.distanceKm });
    });
    return () => {
      stale = true;
    };
  }, [driverAt, pickup]);

  // Ruta del viaje (recogida → destino), trazo suave.
  useEffect(() => {
    let stale = false;
    if (!dropoff) {
      if (tripLineRef.current) {
        tripLineRef.current.remove();
        tripLineRef.current = null;
      }
      return;
    }
    fetchDrivingRoute(pickup, dropoff).then((route) => {
      if (stale || !route) return;
      const map = mapRef.current;
      if (!map) return;
      if (tripLineRef.current) tripLineRef.current.setLatLngs(route.coords);
      else tripLineRef.current = L.polyline(route.coords, { color: "#3f3f46", weight: 3, opacity: 0.5, dashArray: "6 8" }).addTo(map);
    });
    return () => {
      stale = true;
    };
  }, [pickup, dropoff]);

  // Encuadre.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngExpression[] = [[pickup.lat, pickup.lng]];
    if (dropoff) points.push([dropoff.lat, dropoff.lng]);
    if (driverAt) points.push([driverAt.lat, driverAt.lng]);
    map.fitBounds(L.latLngBounds(points).pad(0.35), { animate: false });
  }, [pickup, dropoff, driverAt]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-zinc-200 ${className || ""}`}>
      <div ref={containerRef} className="h-52 w-full" />
      <div className="pointer-events-none absolute left-2 top-2 z-[500] rounded-xl bg-black/85 px-2.5 py-1.5 text-[11px] font-black text-white shadow">
        {driverAt
          ? approachLoading
            ? "Calculando tu llegada…"
            : approach
              ? `Llegada al punto: ${approach.minutes} min · ${approach.km.toFixed(1)} km`
              : "Tú → recogida"
          : "Punto de recogida"}
      </div>
    </div>
  );
}
