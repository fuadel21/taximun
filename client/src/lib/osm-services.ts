/**
 * Servicios geográficos gratuitos basados en OpenStreetMap:
 *  - Nominatim: búsqueda de direcciones y geocodificación inversa.
 *  - OSRM: ruta real de conducción entre dos puntos.
 * Sin claves de API. Se usa con moderación (debounce + caché en memoria).
 */

export type OsmPlace = {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
};

export type OsmRoute = {
  coords: [number, number][];
  distanceKm: number;
  durationMinutes: number;
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";

// Área preferida: Área Metropolitana de Barcelona (sesgo, no filtro estricto).
const VIEWBOX = "1.85,41.60,2.35,41.25";

const searchCache = new Map<string, OsmPlace[]>();
const routeCache = new Map<string, OsmRoute>();
const reverseCache = new Map<string, string>();

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<OsmPlace[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];
  if (searchCache.has(key)) return searchCache.get(key)!;
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(key)}&format=jsonv2&addressdetails=1&limit=6&accept-language=es&countrycodes=es&viewbox=${VIEWBOX}&bounded=0&dedupe=1`;
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  const places = payload
    .map((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const displayName = String(item.display_name || item.name || "");
      const name = String(item.name || displayName.split(",")[0] || displayName);
      return { name, displayName, lat, lng } satisfies OsmPlace;
    })
    .filter((item): item is OsmPlace => item !== null);
  searchCache.set(key, places);
  return places;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key)!;
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=17&accept-language=es`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const payload = (await response.json()) as Record<string, unknown>;
  const address = payload.address as Record<string, string> | undefined;
  const parts: string[] = [];
  if (address) {
    const road = address.road || address.pedestrian || address.footway;
    const house = address.house_number;
    if (road) parts.push(house ? `${road}, ${house}` : road);
    const area = address.neighbourhood || address.suburb || address.city_district;
    if (area) parts.push(area);
    const city = address.city || address.town || address.municipality || address.village;
    if (city && city !== area) parts.push(city);
  }
  const label = parts.length > 0 ? parts.join(" · ") : String(payload.display_name || key);
  reverseCache.set(key, label);
  return label;
}

export async function fetchDrivingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<OsmRoute | null> {
  const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
  if (routeCache.has(key)) return routeCache.get(key)!;
  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    const route = payload?.routes?.[0];
    const list = route?.geometry?.coordinates;
    if (!Array.isArray(list) || list.length < 2) return null;
    const result: OsmRoute = {
      coords: list.map((item: number[]) => [item[1], item[0]] as [number, number]),
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
    routeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
