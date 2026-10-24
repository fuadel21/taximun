import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-config";

export type MapPlace = { lat: number; lng: number; address: string };

export type RideMapPickerProps = {
  pickup: MapPlace | null;
  dropoff: MapPlace | null;
  route: { coords: [number, number][] } | null;
  /** Qué punto fija el próximo toque o arrastre en el mapa. */
  pickMode: "pickup" | "dropoff";
  onMapPick: (lat: number, lng: number) => void;
  userLocation: { lat: number; lng: number } | null;
  className?: string;
};

const BARCELONA_CENTER: [number, number] = [41.3874, 2.1686];

function markerIcon(kind: "pickup" | "dropoff") {
  const content = kind === "pickup" ? "●" : "◆";
  const className = kind === "pickup" ? "taximun-marker-pickup" : "taximun-marker-dropoff";
  return L.divIcon({
    className: "taximun-tracking-marker-wrapper",
    html: `<div class="${className}">${content}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

/**
 * Mapa interactivo OpenStreetMap para elegir origen y destino: toque o
 * arrastre de marcadores, ruta de conducción dibujada y ubicación del
 * usuario. Estilo apps de movilidad.
 */
export function RideMapPicker({ pickup, dropoff, route, pickMode, onMapPick, userLocation, className }: RideMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const userDotRef = useRef<L.CircleMarker | null>(null);
  const pickModeRef = useRef(pickMode);
  const onMapPickRef = useRef(onMapPick);
  const fittedRef = useRef<string>("");

  pickModeRef.current = pickMode;
  onMapPickRef.current = onMapPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(BARCELONA_CENTER, 13);
    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      onMapPickRef.current(event.latlng.lat, event.latlng.lng);
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      routeLineRef.current = null;
      userDotRef.current = null;
    };
  }, []);

  // Marcador de recogida (arrastrable).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pickup) {
      const latLng: L.LatLngExpression = [pickup.lat, pickup.lng];
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setLatLng(latLng);
      } else {
        const marker = L.marker(latLng, { icon: markerIcon("pickup"), draggable: true }).addTo(map);
        marker.bindPopup("Punto de recogida");
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          onMapPickRef.current(position.lat, position.lng);
        });
        pickupMarkerRef.current = marker;
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }
  }, [pickup]);

  // Marcador de destino (arrastrable).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (dropoff) {
      const latLng: L.LatLngExpression = [dropoff.lat, dropoff.lng];
      if (dropoffMarkerRef.current) {
        dropoffMarkerRef.current.setLatLng(latLng);
      } else {
        const marker = L.marker(latLng, { icon: markerIcon("dropoff"), draggable: true }).addTo(map);
        marker.bindPopup("Destino");
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          onMapPickRef.current(position.lat, position.lng);
        });
        dropoffMarkerRef.current = marker;
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }
  }, [dropoff]);

  // Ruta de conducción entre ambos puntos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (route && route.coords.length >= 2) {
      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(route.coords);
      } else {
        routeLineRef.current = L.polyline(route.coords, {
          color: "#09090b",
          weight: 5,
          opacity: 0.85,
          lineJoin: "round",
        }).addTo(map);
      }
    } else if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
  }, [route]);

  // Punto azul con la ubicación del usuario.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userLocation) {
      const latLng: L.LatLngExpression = [userLocation.lat, userLocation.lng];
      if (userDotRef.current) {
        userDotRef.current.setLatLng(latLng);
      } else {
        userDotRef.current = L.circleMarker(latLng, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        })
          .bindPopup("Tu ubicación")
          .addTo(map);
      }
    } else if (userDotRef.current) {
      userDotRef.current.remove();
      userDotRef.current = null;
    }
  }, [userLocation]);

  // Encuadre automático al cambiar ruta o puntos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngExpression[] = [];
    if (pickup) points.push([pickup.lat, pickup.lng]);
    if (dropoff) points.push([dropoff.lat, dropoff.lng]);
    if (route && route.coords.length >= 2) points.push(...route.coords.filter((_, index) => index % 3 === 0));
    if (points.length === 0) return;
    const fitKey = `${pickup?.lat ?? "-"},${pickup?.lng ?? "-"}|${dropoff?.lat ?? "-"},${dropoff?.lng ?? "-"}|${route?.coords.length ?? 0}`;
    if (fitKey === fittedRef.current) return;
    fittedRef.current = fitKey;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points).pad(0.25), { animate: true });
  }, [pickup, dropoff, route]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-zinc-200 ${className || ""}`}>
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 260 }} />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-2xl bg-white/95 px-3 py-2 text-xs font-black text-zinc-800 shadow-md">
        {pickMode === "pickup" ? "Toca o arrastra para ajustar la recogida" : "Toca el mapa para fijar el destino"}
      </div>
    </div>
  );
}
