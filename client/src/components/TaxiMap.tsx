import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18nContext } from "@/contexts/I18nContext";
import { MAP_DEFAULTS } from "@shared/constants";
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-config";

interface TaxiLocation {
  id: number;
  latitude: number;
  longitude: number;
  driverName: string;
  rating: number;
  status: "available" | "busy" | "offline";
}

interface TaxiMapProps {
  onLocationSelect?: (lat: number, lng: number) => void;
  userLocation?: { latitude: number; longitude: number };
  taxis?: TaxiLocation[];
  selectedTaxi?: number;
  readOnly?: boolean;
}

export function TaxiMap({
  onLocationSelect,
  userLocation,
  taxis = [],
  selectedTaxi,
  readOnly = false,
}: TaxiMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [userMarker, setUserMarker] = useState<L.Marker | null>(null);
  const taxiMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const { t } = useI18nContext();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = L.map(mapContainer.current).setView(
      MAP_DEFAULTS.DEFAULT_CENTER,
      MAP_DEFAULTS.DEFAULT_ZOOM
    );

    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: MAP_DEFAULTS.MAX_ZOOM,
      minZoom: MAP_DEFAULTS.MIN_ZOOM,
    }).addTo(map.current);

    // Handle map clicks for location selection
    if (!readOnly) {
      map.current.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onLocationSelect?.(lat, lng);
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [onLocationSelect, readOnly]);

  // Update user location marker
  useEffect(() => {
    if (!map.current || !userLocation) return;

    const { latitude, longitude } = userLocation;

    if (userMarker) {
      userMarker.setLatLng([latitude, longitude]);
    } else {
      const marker = L.marker([latitude, longitude], {
        icon: L.icon({
          iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      })
        .bindPopup(t.map.myLocation)
        .addTo(map.current);

      setUserMarker(marker);
    }

    map.current.setView([latitude, longitude], MAP_DEFAULTS.DEFAULT_ZOOM);
  }, [userLocation, userMarker, t]);

  // Update taxi markers
  useEffect(() => {
    if (!map.current) return;

    // Remove old markers that are no longer in the list
    taxiMarkersRef.current.forEach((marker, taxiId) => {
      if (!taxis.find((t) => t.id === taxiId)) {
        marker.remove();
        taxiMarkersRef.current.delete(taxiId);
      }
    });

    // Add or update taxi markers
    taxis.forEach((taxi) => {
      const existingMarker = taxiMarkersRef.current.get(taxi.id);

      const markerColor =
        taxi.status === "available"
          ? "green"
          : taxi.status === "busy"
            ? "orange"
            : "gray";

      const iconUrl = `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`;

      if (existingMarker) {
        existingMarker.setLatLng([taxi.latitude, taxi.longitude]);
      } else {
        const marker = L.marker([taxi.latitude, taxi.longitude], {
          icon: L.icon({
            iconUrl,
            shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
          }),
        })
          .bindPopup(
            `<div class="text-sm">
              <p class="font-semibold">${taxi.driverName}</p>
              <p class="text-xs text-gray-600">⭐ ${taxi.rating.toFixed(1)}</p>
              <p class="text-xs text-gray-600">${taxi.status}</p>
            </div>`
          )
          .addTo(map.current!);

        if (selectedTaxi === taxi.id) {
          marker.openPopup();
        }

        taxiMarkersRef.current.set(taxi.id, marker);
      }
    });
  }, [taxis, selectedTaxi, t]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-full rounded-lg border border-border/50 shadow-sm"
      style={{ minHeight: "400px" }}
    />
  );
}
