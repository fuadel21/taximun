/**
 * Motor de tarifas oficial del taxi del Área Metropolitana de Barcelona (AMB).
 *
 * Fuente de los valores por defecto: tarifa metropolitana vigente publicada por
 * la AMB (taxi.amb.cat) — T1/T2 con bajada de bandera y €/km, suplementos
 * oficiales (aeropuerto, Moll Adossat, Fira, Sants, vehículo 5-8 plazas,
 * noches especiales), mínimos de percepción y tope de suplementos.
 *
 * Todos los importes son editables desde el panel de administración
 * (tabla `taxi_tariff_config`); si la tabla no existe o falla la lectura se
 * usan los valores oficiales por defecto.
 */

import { supabase } from "./supabase-client";

export type AmbTariffConfig = {
  closedPriceMode: "T3" | "T1T2"; // T3 = tarifa oficial de precio cerrado por app (IMET)
  t1FlagDrop: number;      // Bajada de bandera T1 (laborables 08:00-20:00)
  t1PerKm: number;         // €/km T1
  t2FlagDrop: number;      // Bajada de bandera T2 (noche laborable + sábado/festivo 24h)
  t2PerKm: number;         // €/km T2
  // T3 · precio cerrado por app (anexo IMET 2026)
  t3DayFlagDrop: number;   // Laborable 8-20
  t3DayPerKm: number;
  t3DayPerMinute: number;  // Tiempo en condiciones de tráfico real
  t3NightFlagDrop: number; // Laborable 20-8, sábados y festivos
  t3NightPerKm: number;
  t3NightPerMinute: number;
  waitingPerHour: number;  // Espera/detención €/h
  supAirport: number;      // Suplemento aeropuerto (origen O destino)
  supMollAdossat: number;  // Suplemento Moll Adossat (cruceros, origen O destino)
  supFiraOrigen: number;   // Suplemento Fira de Barcelona - Gran Via (solo origen)
  supSantsOrigen: number;  // Suplemento Estació Sants (solo origen)
  supLargeVehicle: number; // Suplemento vehículo 5-8 plazas (monovolumen)
  supSpecialNight: number; // Suplemento noches especiales (La Nit/Badalada, Nadal, Sant Joan, Fin de Año)
  minAirportTotal: number; // Percepción mínima carrera con origen en el aeropuerto (incluye suplementos)
  minAppService: number;   // Percepción mínima servicio concertado por app
  maxSupplements: number;  // Tope máximo a la suma de suplementos
  t4FlatPortAirport: number; // T4: precio fijo aeropuerto <-> Moll Adossat
  serviceFee: number;      // Cargo de servicio de la app (0 = sin cargo, como el taxímetro)
  comfortMultiplier: number; // Multiplicador categoría confort (1 = tarifa oficial exacta)
  roadFactor: number;      // Factor recta->carretera cuando no hay ruta real del cliente
};

export const DEFAULT_AMB_CONFIG: AmbTariffConfig = {
  closedPriceMode: "T3",
  t1FlagDrop: 2.8,
  t1PerKm: 1.35,
  t2FlagDrop: 2.8,
  t2PerKm: 1.66,
  t3DayFlagDrop: 4.1117,
  t3DayPerKm: 1.1148,
  t3DayPerMinute: 0.2832,
  t3NightFlagDrop: 4.4321,
  t3NightPerKm: 1.471,
  t3NightPerMinute: 0.2226,
  waitingPerHour: 27.75,
  supAirport: 4.6,
  supMollAdossat: 4.6,
  supFiraOrigen: 3.3,
  supSantsOrigen: 2.55,
  supLargeVehicle: 4.6,
  supSpecialNight: 4.6,
  minAirportTotal: 21,
  minAppService: 8,
  maxSupplements: 17.1,
  t4FlatPortAirport: 46,
  serviceFee: 0,
  comfortMultiplier: 1,
  roadFactor: 1.28,
};

const TARIFF_TIME_ZONE = "Europe/Madrid";

/* ─────────────────────── Zonas con suplemento (BD) ─────────────────────── */

export type TariffZone = {
  id: string;
  label: string;
  supplementCode: "airport" | "moll_adossat" | "fira" | "sants";
  appliesTo: "origin" | "destination" | "both";
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  isActive: boolean;
};

/** Respaldo oficial si la tabla `taxi_tariff_zones` no existe o falla la lectura. */
export const DEFAULT_TARIFF_ZONES: TariffZone[] = [
  { id: "airport-t1", label: "Aeroport T1", supplementCode: "airport", appliesTo: "both", centerLat: 41.2974, centerLng: 2.0833, radiusMeters: 1500, isActive: true },
  { id: "airport-t2", label: "Aeroport T2", supplementCode: "airport", appliesTo: "both", centerLat: 41.3007, centerLng: 2.0746, radiusMeters: 1200, isActive: true },
  { id: "moll-adossat", label: "Moll Adossat · cruceros", supplementCode: "moll_adossat", appliesTo: "both", centerLat: 41.3534, centerLng: 2.1763, radiusMeters: 1500, isActive: true },
  { id: "fira-gran-via", label: "Fira Barcelona · Gran Via", supplementCode: "fira", appliesTo: "origin", centerLat: 41.3534, centerLng: 2.1277, radiusMeters: 900, isActive: true },
  { id: "sants-estacio", label: "Estació de Sants", supplementCode: "sants", appliesTo: "origin", centerLat: 41.3790, centerLng: 2.1400, radiusMeters: 320, isActive: true },
];

const radians = (value: number) => (value * Math.PI) / 180;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earth = 6371000;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function inZone(lat: number | undefined, lng: number | undefined, zone: TariffZone) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return distanceMeters(lat, lng, zone.centerLat, zone.centerLng) <= zone.radiusMeters;
}

const ZONE_CACHE_TTL_MS = 60_000;
let zoneCache: { value: TariffZone[]; at: number } | null = null;

export function invalidateTariffZoneCache() {
  zoneCache = null;
}

/** Zonas activas desde `taxi_tariff_zones`; ante fallo, las oficiales por defecto. */
export async function getAmbTariffZones(): Promise<TariffZone[]> {
  if (zoneCache && Date.now() - zoneCache.at < ZONE_CACHE_TTL_MS) return zoneCache.value;
  try {
    const { data, error } = await supabase
      .from("taxi_tariff_zones")
      .select("*")
      .eq("is_active", true);
    if (error || !Array.isArray(data) || data.length === 0) throw new Error(error?.message || "sin zonas");
    const value: TariffZone[] = data.map((row: any) => ({
      id: String(row.id),
      label: String(row.label || row.id),
      supplementCode: row.supplement_code,
      appliesTo: row.applies_to || "both",
      centerLat: Number(row.center_lat),
      centerLng: Number(row.center_lng),
      radiusMeters: Number(row.radius_meters),
      isActive: true,
    })).filter((zone) => Number.isFinite(zone.centerLat) && Number.isFinite(zone.centerLng) && zone.radiusMeters > 0);
    if (value.length === 0) throw new Error("zonas inválidas");
    zoneCache = { value, at: Date.now() };
    return value;
  } catch {
    zoneCache = { value: DEFAULT_TARIFF_ZONES, at: Date.now() };
    return DEFAULT_TARIFF_ZONES;
  }
}

/** ¿El punto cae en alguna zona activa del suplemento indicado en origen/destino? */
function inSupplementZone(zones: TariffZone[], code: TariffZone["supplementCode"], at: "origin" | "destination", lat?: number, lng?: number) {
  return zones.some(
    (zone) =>
      zone.supplementCode === code &&
      (zone.appliesTo === "both" || zone.appliesTo === at) &&
      inZone(lat, lng, zone),
  );
}

/** Festivos locales de Barcelona que arrastran T2 durante todo el día. */
const HOLIDAYS = new Set([
  "01-01", // Any Nou
  "01-06", // Reis
  "04-18", // Divendres Sant (2026, aproximado por Semana Santa)
  "04-20", // Dilluns de Pasqua (2026)
  "05-01", // Dia del Treball
  "06-24", // Verbana de Sant Joan
  "08-15", // Assumpció
  "09-11", // Diada Nacional de Catalunya
  "09-24", // La Mercè
  "11-01", // Tots Sants
  "12-06", // Constitució
  "12-08", // Immaculada
  "12-25", // Nadal
  "12-26", // Sant Esteve
]);

/** Noches con suplemento especial (20:00-08:00): Sant Joan, Nochebuena y Fin de Año. */
const SPECIAL_NIGHTS = new Set(["06-23", "12-24", "12-31"]);

export type AmbTariffPeriod = {
  hour: number;
  weekday: string;
  isHoliday: boolean;
  isSpecialNight: boolean;
  tariff: "T1" | "T2";
  /** Etiqueta legible del tramo horario aplicado. */
  label: string;
};

export function ambTariffPeriod(date: Date): AmbTariffPeriod {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TARIFF_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour") || "0");
  const weekday = get("weekday") || "Mon";
  const monthDay = `${get("month")}-${get("day")}`;
  const isHoliday = HOLIDAYS.has(monthDay);
  const isSaturday = weekday === "Sat";
  const nightHours = hour >= 20 || hour < 8;
  const t2 = isSaturday || isHoliday || nightHours;
  const isSpecialNight = SPECIAL_NIGHTS.has(monthDay) && nightHours;
  return {
    hour,
    weekday,
    isHoliday,
    isSpecialNight,
    tariff: t2 ? "T2" : "T1",
    label: t2
      ? isSaturday
        ? "T2 · sábado (todo el día)"
        : isHoliday
          ? "T2 · festivo (todo el día)"
          : "T2 · laborable de 20:00 a 8:00"
      : "T1 · laborable de 8:00 a 20:00",
  };
}

/* ───────────────────── Configuración persistida (admin) ─────────────────── */

const CACHE_TTL_MS = 60_000;
let cache: { value: AmbTariffConfig; at: number } | null = null;

export function invalidateTariffCache() {
  cache = null;
}

const CONFIG_COLUMN_MAP: Record<keyof AmbTariffConfig, string> = {
  closedPriceMode: "closed_price_mode",
  t1FlagDrop: "t1_flag_drop",
  t1PerKm: "t1_per_km",
  t2FlagDrop: "t2_flag_drop",
  t2PerKm: "t2_per_km",
  t3DayFlagDrop: "t3_day_flag_drop",
  t3DayPerKm: "t3_day_per_km",
  t3DayPerMinute: "t3_day_per_minute",
  t3NightFlagDrop: "t3_night_flag_drop",
  t3NightPerKm: "t3_night_per_km",
  t3NightPerMinute: "t3_night_per_minute",
  waitingPerHour: "waiting_per_hour",
  supAirport: "sup_airport",
  supMollAdossat: "sup_moll_adossat",
  supFiraOrigen: "sup_fira_origen",
  supSantsOrigen: "sup_sants_origen",
  supLargeVehicle: "sup_large_vehicle",
  supSpecialNight: "sup_special_night",
  minAirportTotal: "min_airport_total",
  minAppService: "min_app_service",
  maxSupplements: "max_supplements",
  t4FlatPortAirport: "t4_flat_port_airport",
  serviceFee: "service_fee",
  comfortMultiplier: "comfort_multiplier",
  roadFactor: "road_factor",
};

function coerceConfig(row: Record<string, unknown>): AmbTariffConfig {
  const num = (key: Exclude<keyof AmbTariffConfig, "closedPriceMode">) => {
    const raw = row[CONFIG_COLUMN_MAP[key]] ?? row[key];
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AMB_CONFIG[key];
  };
  const modeRaw = row[CONFIG_COLUMN_MAP.closedPriceMode] ?? row.closedPriceMode;
  const closedPriceMode = modeRaw === "T1T2" ? "T1T2" : "T3";
  return {
    closedPriceMode,
    t3DayFlagDrop: num("t3DayFlagDrop"),
    t3DayPerKm: num("t3DayPerKm"),
    t3DayPerMinute: num("t3DayPerMinute"),
    t3NightFlagDrop: num("t3NightFlagDrop"),
    t3NightPerKm: num("t3NightPerKm"),
    t3NightPerMinute: num("t3NightPerMinute"),
    t1FlagDrop: num("t1FlagDrop"),
    t1PerKm: num("t1PerKm"),
    t2FlagDrop: num("t2FlagDrop"),
    t2PerKm: num("t2PerKm"),
    waitingPerHour: num("waitingPerHour"),
    supAirport: num("supAirport"),
    supMollAdossat: num("supMollAdossat"),
    supFiraOrigen: num("supFiraOrigen"),
    supSantsOrigen: num("supSantsOrigen"),
    supLargeVehicle: num("supLargeVehicle"),
    supSpecialNight: num("supSpecialNight"),
    minAirportTotal: num("minAirportTotal"),
    minAppService: num("minAppService"),
    maxSupplements: num("maxSupplements"),
    t4FlatPortAirport: num("t4FlatPortAirport"),
    serviceFee: num("serviceFee"),
    comfortMultiplier: num("comfortMultiplier"),
    roadFactor: num("roadFactor"),
  };
}

/** Lee la configuración de la tabla `taxi_tariff_config`; ante cualquier fallo usa los valores oficiales. */
export async function getAmbTariffConfig(): Promise<AmbTariffConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase
      .from("taxi_tariff_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "sin configuración");
    const value = coerceConfig(data as Record<string, unknown>);
    cache = { value, at: Date.now() };
    return value;
  } catch {
    cache = { value: DEFAULT_AMB_CONFIG, at: Date.now() };
    return DEFAULT_AMB_CONFIG;
  }
}

/* ───────────────────────────── Cálculo de la tarifa ─────────────────────── */

export type AmbFareInput = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  /** Distancia real de ruta (km) calculada por el cliente con OSRM; el servidor la acota. */
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  category: "standard" | "comfort" | "van" | "accessible";
  requestedAt: Date;
};

export type AmbFareResult = {
  tariff: "T1" | "T2" | "T3" | "T4";
  tariffLabel: string;
  distanceKm: number;
  durationMinutes: number;
  flagDrop: number;
  perKm: number;
  distanceFare: number;
  timeMinutes: number;
  perMinute: number;
  timeFare: number;
  supplements: Array<{ code: string; label: string; amount: number }>;
  supplementsTotal: number;
  supplementsCapped: boolean;
  minimumApplied: number | null;
  minimumLabel: string | null;
  serviceFee: number;
  subtotal: number;
  isFlatRate: boolean;
};

const round = (value: number) => Number(value.toFixed(2));
const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const earth = 6371;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

function addressMentionsAirport(address: string) {
  const value = address.toLowerCase();
  return ["aeroport", "aeropuerto", "el prat", "airport", "terminal t1", "terminal t2", "bcn t1", "bcn t2"].some((item) => value.includes(item));
}
function addressMentionsPort(address: string) {
  const value = address.toLowerCase();
  return ["moll adossat", "moll de barcelona", "creuers", "cruceros", "world trade center", "terminal de cruceros", "estació marítima", "estacion maritima"].some((item) => value.includes(item));
}
function addressMentionsSants(address: string) {
  const value = address.toLowerCase();
  return ["sants estació", "sants estacio", "estació de sants", "estacion de sants", "barcelona-sants"].some((item) => value.includes(item));
}
function addressMentionsFira(address: string) {
  const value = address.toLowerCase();
  return ["fira", "gran via de l'hospitalet", "gran via l'hospitalet", "plaça europa", "plaza europa", "hospitalet fira"].some((item) => value.includes(item));
}

export async function quoteAmbFare(input: AmbFareInput): Promise<AmbFareResult> {
  const [config, zones] = await Promise.all([getAmbTariffConfig(), getAmbTariffZones()]);
  const period = ambTariffPeriod(input.requestedAt);

  const hasCoords = [input.pickupLat, input.pickupLng, input.dropoffLat, input.dropoffLng].every(Number.isFinite);
  const straightKm = hasCoords
    ? haversineKm(input.pickupLat!, input.pickupLng!, input.dropoffLat!, input.dropoffLng!)
    : 5.2;

  // Distancia: ruta real del cliente (acotada a un margen plausible sobre la
  // recta) o estimación por factor de carretera.
  let distanceKm = round(Math.max(1, straightKm * config.roadFactor));
  let isClientRoute = false;
  if (Number.isFinite(input.routeDistanceKm) && (input.routeDistanceKm as number) > 0) {
    const lower = Math.max(0.9, straightKm * 0.95);
    const upper = straightKm * 1.5 + 1;
    distanceKm = round(Math.min(Math.max(input.routeDistanceKm as number, lower), upper));
    isClientRoute = true;
  }

  let durationMinutes = Math.max(5, Math.round((distanceKm / 22) * 60 + 4));
  if (Number.isFinite(input.routeDurationMinutes) && (input.routeDurationMinutes as number) >= 2) {
    durationMinutes = Math.round(input.routeDurationMinutes as number);
  }

  // Zonas con suplemento (editor visual en /admin/tariffs): coordenadas cuando
  // existen, texto como respaldo.
  const pickupAtAirport =
    inSupplementZone(zones, "airport", "origin", input.pickupLat, input.pickupLng) || (!hasCoords && addressMentionsAirport(input.pickupAddress));
  const dropoffAtAirport =
    inSupplementZone(zones, "airport", "destination", input.dropoffLat, input.dropoffLng) || (!hasCoords && addressMentionsAirport(input.dropoffAddress));
  const pickupAtPort =
    inSupplementZone(zones, "moll_adossat", "origin", input.pickupLat, input.pickupLng) || (!hasCoords && addressMentionsPort(input.pickupAddress));
  const dropoffAtPort =
    inSupplementZone(zones, "moll_adossat", "destination", input.dropoffLat, input.dropoffLng) || (!hasCoords && addressMentionsPort(input.dropoffAddress));
  const pickupAtSants =
    inSupplementZone(zones, "sants", "origin", input.pickupLat, input.pickupLng) || (!hasCoords && addressMentionsSants(input.pickupAddress));
  const pickupAtFira =
    inSupplementZone(zones, "fira", "origin", input.pickupLat, input.pickupLng) || (!hasCoords && addressMentionsFira(input.pickupAddress));

  // T4: precio fijo aeropuerto <-> Moll Adossat (en ambos sentidos).
  if ((pickupAtAirport && dropoffAtPort) || (pickupAtPort && dropoffAtAirport)) {
    const flat = round(config.t4FlatPortAirport);
    return {
      tariff: "T4",
      tariffLabel: "T4 · precio fijo aeropuerto ↔ Moll Adossat",
      distanceKm,
      durationMinutes,
      flagDrop: 0,
      perKm: 0,
      distanceFare: 0,
      timeMinutes: 0,
      perMinute: 0,
      timeFare: 0,
      supplements: [{ code: "t4_flat", label: "Precio fijo T4 aeropuerto ↔ puerto (incluye suplementos)", amount: flat }],
      supplementsTotal: flat,
      supplementsCapped: false,
      minimumApplied: null,
      minimumLabel: null,
      serviceFee: 0,
      subtotal: flat,
      isFlatRate: true,
    };
  }

  // T3 = tarifa oficial de precio cerrado por app (anexo IMET): bandera +
  // longitud + TIEMPO con tráfico real, y solo los suplementos contemplados
  // (aeropuerto, vehículo 5-8 plazas, noches especiales). Incluye el
  // desplazamiento hasta la recogida y 5 minutos de espera.
  const isT3 = config.closedPriceMode !== "T1T2";
  const isNightPeriod = period.tariff === "T2";
  const flagDrop = isT3
    ? isNightPeriod ? config.t3NightFlagDrop : config.t3DayFlagDrop
    : isNightPeriod ? config.t2FlagDrop : config.t1FlagDrop;
  const perKm = isT3
    ? isNightPeriod ? config.t3NightPerKm : config.t3DayPerKm
    : isNightPeriod ? config.t2PerKm : config.t1PerKm;
  const perMinute = isT3
    ? isNightPeriod ? config.t3NightPerMinute : config.t3DayPerMinute
    : 0;
  const distanceFare = round(distanceKm * perKm);
  const timeMinutes = durationMinutes;
  const timeFare = round(timeMinutes * perMinute);

  const supplements: Array<{ code: string; label: string; amount: number }> = [];
  if (pickupAtAirport || dropoffAtAirport) {
    supplements.push({ code: "airport", label: pickupAtAirport ? "Suplemento aeropuerto (origen)" : "Suplemento aeropuerto (destino)", amount: round(config.supAirport) });
  }
  if (!isT3 && (pickupAtPort || dropoffAtPort)) {
    supplements.push({ code: "moll_adossat", label: pickupAtPort ? "Suplemento Moll Adossat · cruceros (origen)" : "Suplemento Moll Adossat · cruceros (destino)", amount: round(config.supMollAdossat) });
  }
  if (!isT3 && pickupAtFira) {
    supplements.push({ code: "fira", label: "Suplemento Fira Barcelona · Gran Via (origen)", amount: round(config.supFiraOrigen) });
  }
  if (!isT3 && pickupAtSants) {
    supplements.push({ code: "sants", label: "Suplemento Estació de Sants (origen)", amount: round(config.supSantsOrigen) });
  }
  if (input.category === "van") {
    supplements.push({ code: "large_vehicle", label: "Suplemento vehículo de 5 a 8 plazas", amount: round(config.supLargeVehicle) });
  }
  if (period.isSpecialNight) {
    supplements.push({ code: "special_night", label: "Suplemento noche especial (Sant Joan · Nochebuena · Fin de Año)", amount: round(config.supSpecialNight) });
  }

  const rawSupplementsTotal = round(supplements.reduce((sum, item) => sum + item.amount, 0));
  const supplementsTotal = round(Math.min(rawSupplementsTotal, config.maxSupplements));
  const supplementsCapped = rawSupplementsTotal > supplementsTotal;

  const round05 = (value: number) => Math.round(value * 20) / 20;
  let subtotal = round05(flagDrop + distanceFare + timeFare + supplementsTotal + config.serviceFee);
  if (input.category === "comfort" && config.comfortMultiplier !== 1) {
    subtotal = round05(subtotal * config.comfortMultiplier);
  }

  // Mínimos oficiales: aeropuerto (incluye suplementos) y servicio por app.
  let minimumApplied: number | null = null;
  let minimumLabel: string | null = null;
  if (pickupAtAirport && subtotal < config.minAirportTotal) {
    minimumApplied = round05(config.minAirportTotal);
    minimumLabel = "Percepción mínima oficial en carreras desde el aeropuerto";
    subtotal = round05(config.minAirportTotal);
  } else if (subtotal < config.minAppService) {
    minimumApplied = round05(config.minAppService);
    minimumLabel = "Importe mínimo de un servicio con precio cerrado";
    subtotal = round05(config.minAppService);
  }

  return {
    tariff: isT3 ? "T3" : period.tariff,
    tariffLabel: isT3
      ? period.tariff === "T2"
        ? "T3 · precio cerrado (laborable 20:00-8:00, sábados y festivos)"
        : "T3 · precio cerrado (laborable 8:00-20:00)"
      : period.label,
    distanceKm,
    durationMinutes,
    flagDrop: round(flagDrop),
    perKm,
    distanceFare,
    timeMinutes,
    perMinute,
    timeFare,
    supplements,
    supplementsTotal,
    supplementsCapped,
    minimumApplied,
    minimumLabel,
    serviceFee: round(config.serviceFee),
    subtotal,
    isFlatRate: false,
  };
}

/** Etiqueta pública para la UI: describe el tramo tarifario actual. */
export function ambTariffPublicLabel(date = new Date()) {
  return ambTariffPeriod(date).label;
}
