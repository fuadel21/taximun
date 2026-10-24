/**
 * Configuración de infraestructura geográfica por entorno.
 *
 * Los mapas y servicios de geocodificación/rutas usan por defecto los
 * servidores públicos de OpenStreetMap, que NO son aptos para producción a
 * escala (política de uso justo). Antes de escalar, define estas variables de
 * entorno (Vercel → Settings → Environment Variables) con un proveedor
 * comercial (p. ej. tiles de MapTiler/Stadia, geocodificación de Mapbox o
 * GraphHopper, rutas de tu propia instancia OSRM):
 *
 *   VITE_MAP_TILE_URL         URL plantilla de tiles ({z}/{x}/{y}, opcional {s})
 *   VITE_MAP_TILE_ATTRIBUTION Texto de atribución requerido por el proveedor
 *   VITE_GEOCODING_BASE_URL   Base del servicio de búsqueda de direcciones (Nominatim-compatible)
 *   VITE_ROUTING_BASE_URL     Base del servicio de rutas (OSRM-compatible)
 *
 * El cambio es transparente: no hay que tocar componentes.
 */

const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_TILE_ATTRIBUTION = "© OpenStreetMap contributors";
const DEFAULT_GEOCODING_BASE = "https://nominatim.openstreetmap.org";
const DEFAULT_ROUTING_BASE = "https://router.project-osrm.org";

export const MAP_TILE_URL: string = import.meta.env.VITE_MAP_TILE_URL || DEFAULT_TILE_URL;
export const MAP_TILE_ATTRIBUTION: string = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;
export const GEOCODING_BASE_URL: string = import.meta.env.VITE_GEOCODING_BASE_URL || DEFAULT_GEOCODING_BASE;
export const ROUTING_BASE_URL: string = import.meta.env.VITE_ROUTING_BASE_URL || DEFAULT_ROUTING_BASE;
