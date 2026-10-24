import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-config";

export type QueueZone = {
  zoneId: string;
  zoneName: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
  waiting: number;
  myPosition: number | null;
  members: Array<{
    driverId: string;
    driverName: string;
    taxiCode: string | null;
    isMe?: boolean;
    position: number;
    lat: number | null;
    lng: number | null;
  }>;
};

type DriverQueueMapProps = {
  zones: QueueZone[];
  myPositionCoords: { lat: number; lng: number } | null;
  className?: string;
};

const BARCELONA_CENTER: [number, number] = [41.37, 2.13];

function taxiIcon(position: number, isMe: boolean) {
  return L.divIcon({
    className: "taximun-tracking-marker-wrapper",
    html: `<div class="${isMe ? "taximun-marker-driver" : "taximun-marker-queue-taxi"}" style="position:relative;${isMe ? "background:#09090b;color:#22d3ee;border:2px solid #22d3ee;" : "background:#09090b;color:#fff;border:2px solid #52525b;"}font-weight:900;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:9999px;font-size:15px;box-shadow:0 4px 10px rgba(0,0,0,.35);">🚕<span style="position:absolute;bottom:-6px;right:-6px;background:${isMe ? "#22d3ee" : "#fff"};color:#000;border-radius:9999px;font-size:10px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px;">${position}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/**
 * Mapa de colas FIFO por zona: círculos oficiales (aeropuerto T1/T2, Sants,
 * puerto, centro), posición GPS de los taxis en cola y tu posición resaltada.
 */
export function DriverQueueMap({ zones, myPositionCoords, className }: DriverQueueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<Map<string, L.Circle>>(new Map());
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const meDotRef = useRef<L.CircleMarker | null>(null);
  const fittedRef = useRef("");

  // Marcadores con posición válida (todos los taxis en cola con GPS).
  const taxis = useMemo(
    () =>
      zones.flatMap((zone) =>
        zone.members
          .filter((member) => member.lat !== null && member.lng !== null)
          .map((member) => ({ ...member, zoneName: zone.zoneName, isMe: Boolean(member.isMe) })),
      ),
    [zones],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(BARCELONA_CENTER, 12);
    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      circlesRef.current.clear();
      markersRef.current.clear();
      meDotRef.current = null;
    };
  }, []);

  // Círculos de zona con etiqueta de ocupación.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const zone of zones) {
      if (zone.centerLat === null || zone.centerLng === null) continue;
      const id = zone.zoneId;
      seen.add(id);
      const center: L.LatLngExpression = [zone.centerLat, zone.centerLng];
      const radius = zone.radiusMeters ?? 900;
      const mine = zone.myPosition !== null;
      const existing = circlesRef.current.get(id);
      if (existing) {
        existing.setLatLng(center);
        existing.setRadius(radius);
        existing.setStyle(mine ? { color: "#22d3ee", fillColor: "#22d3ee" } : { color: "#09090b", fillColor: "#09090b" });
        existing.setTooltipContent(`${zone.zoneName} · ${zone.waiting} en cola${mine ? ` · tu posición #${zone.myPosition}` : ""}`);
      } else {
        const circle = L.circle(center, {
          radius,
          color: mine ? "#22d3ee" : "#09090b",
          weight: 2,
          dashArray: mine ? undefined : "6 6",
          fillColor: mine ? "#22d3ee" : "#09090b",
          fillOpacity: 0.08,
        })
          .bindTooltip(`${zone.zoneName} · ${zone.waiting} en cola${mine ? ` · tu posición #${zone.myPosition}` : ""}`, { direction: "top" })
          .addTo(map);
        circlesRef.current.set(id, circle);
      }
    }
    for (const [id, circle] of Array.from(circlesRef.current.entries())) {
      if (!seen.has(id)) {
        circle.remove();
        circlesRef.current.delete(id);
      }
    }
  }, [zones]);

  // Taxis en cola con GPS (número = posición FIFO; cian = tú).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const taxi of taxis) {
      seen.add(taxi.driverId);
      const latLng: L.LatLngExpression = [taxi.lat!, taxi.lng!];
      const tooltip = `#${taxi.position} ${taxi.driverName}${taxi.taxiCode ? ` · ${taxi.taxiCode}` : ""}${taxi.isMe ? " (tú)" : ""} — ${taxi.zoneName}`;
      const existing = markersRef.current.get(taxi.driverId);
      if (existing) {
        existing.setLatLng(latLng);
        existing.setIcon(taxiIcon(taxi.position, taxi.isMe));
        existing.setTooltipContent(tooltip);
      } else {
        const marker = L.marker(latLng, { icon: taxiIcon(taxi.position, taxi.isMe), zIndexOffset: taxi.isMe ? 1000 : 0 })
          .bindTooltip(tooltip, { direction: "top" })
          .addTo(map);
        markersRef.current.set(taxi.driverId, marker);
      }
    }
    for (const [id, marker] of Array.from(markersRef.current.entries())) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [taxis]);

  // Tu posición GPS en vivo (punto cian).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (myPositionCoords) {
      const latLng: L.LatLngExpression = [myPositionCoords.lat, myPositionCoords.lng];
      if (meDotRef.current) meDotRef.current.setLatLng(latLng);
      else
        meDotRef.current = L.circleMarker(latLng, {
          radius: 7,
          color: "#ffffff",
          weight: 3,
          fillColor: "#22d3ee",
          fillOpacity: 1,
        })
          .bindTooltip("Tu posición GPS", { direction: "top" })
          .addTo(map);
    } else if (meDotRef.current) {
      meDotRef.current.remove();
      meDotRef.current = null;
    }
  }, [myPositionCoords]);

  // Encuadre: todas las zonas y taxis.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngExpression[] = [];
    for (const zone of zones) {
      if (zone.centerLat !== null && zone.centerLng !== null) points.push([zone.centerLat, zone.centerLng]);
    }
    for (const taxi of taxis) points.push([taxi.lat!, taxi.lng!]);
    if (myPositionCoords) points.push([myPositionCoords.lat, myPositionCoords.lng]);
    if (points.length === 0) return;
    const fitKey = `${zones.length}-${taxis.length}-${points.length}`;
    if (fitKey === fittedRef.current) return;
    fittedRef.current = fitKey;
    map.fitBounds(L.latLngBounds(points).pad(0.35), { animate: true });
  }, [zones, taxis, myPositionCoords]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 ${className || ""}`}>
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 260 }} />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-2xl bg-zinc-900/95 px-3 py-2 text-xs font-black text-white shadow-md">
        Colas FIFO por zona · {taxis.length} taxi{taxis.length === 1 ? "" : "s"} en el mapa
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-2xl bg-zinc-900/95 px-3 py-2 text-[10px] font-bold text-zinc-300 shadow-md">
        🚕 número = turno · <span className="text-cyan-300">cian = tú</span> · círculo = zona oficial
      </div>
    </div>
  );
}
