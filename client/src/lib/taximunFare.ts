export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type FareServiceType = "taxi" | "eco" | "van" | string;

export type FareEstimate = {
  estimatedFare: number;
  lowerFare: number;
  upperFare: number;
  distanceKm: number;
  durationMinutes: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  serviceMultiplier: number;
  serviceLabel: string;
  airportSupplement: number;
  nightSupplement: number;
  bookingFee: number;
  minimumFare: number;
  isAirport: boolean;
  isNightOrHoliday: boolean;
};

const DEFAULT_DISTANCE_KM = 5.2;
const DEFAULT_DURATION_MINUTES = 14;

const FARE_MODEL = {
  baseFare: 3.1,
  perKm: 1.32,
  perMinute: 0.28,
  bookingFee: 1.2,
  minimumFare: 7,
  airportSupplement: 4.5,
  nightSupplement: 1.15,
  roadFactor: 1.28,
  averageUrbanSpeedKmh: 24,
};

const serviceMultipliers: Record<string, { multiplier: number; label: string }> = {
  taxi: { multiplier: 1, label: "Taxi" },
  eco: { multiplier: 1.06, label: "Eco" },
  van: { multiplier: 1.28, label: "Van" },
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundDistance(value: number) {
  return Number(value.toFixed(1));
}

function hasAirportKeyword(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  return ["aeroport", "aeropuerto", "el prat", "terminal", "t1", "t2", "bcn airport"].some((keyword) =>
    normalized.includes(keyword)
  );
}

function isNightOrHoliday(date = new Date()) {
  const hour = date.getHours();
  const day = date.getDay();
  return hour >= 20 || hour < 7 || day === 0 || day === 6;
}

export function estimateTaximunFare(input: {
  pickup?: Coordinates | null;
  dropoff?: Coordinates | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  serviceType?: FareServiceType;
  fallbackDistanceKm?: number;
  fallbackDurationMinutes?: number;
  requestedAt?: Date;
}): FareEstimate {
  const hasCoordinates = Boolean(input.pickup && input.dropoff);
  const straightKm = hasCoordinates ? haversineKm(input.pickup!, input.dropoff!) : Number(input.fallbackDistanceKm || DEFAULT_DISTANCE_KM);
  const distanceKm = roundDistance(Math.max(1.2, straightKm * (hasCoordinates ? FARE_MODEL.roadFactor : 1)));
  const durationMinutes = Math.max(
    5,
    Math.round(input.fallbackDurationMinutes || (distanceKm / FARE_MODEL.averageUrbanSpeedKmh) * 60 + 5)
  );

  const isAirport = hasAirportKeyword(input.pickupAddress) || hasAirportKeyword(input.dropoffAddress);
  const nightOrHoliday = isNightOrHoliday(input.requestedAt);
  const service = serviceMultipliers[String(input.serviceType || "taxi")] || serviceMultipliers.taxi;

  const baseFare = FARE_MODEL.baseFare;
  const distanceFare = distanceKm * FARE_MODEL.perKm;
  const timeFare = durationMinutes * FARE_MODEL.perMinute;
  const airportSupplement = isAirport ? FARE_MODEL.airportSupplement : 0;
  const nightSupplement = nightOrHoliday ? FARE_MODEL.nightSupplement : 1;
  const bookingFee = FARE_MODEL.bookingFee;

  const subtotal = baseFare + distanceFare + timeFare + airportSupplement + bookingFee;
  const estimatedFare = Math.max(FARE_MODEL.minimumFare, subtotal * nightSupplement * service.multiplier);

  return {
    estimatedFare: roundMoney(estimatedFare),
    lowerFare: roundMoney(estimatedFare * 0.9),
    upperFare: roundMoney(estimatedFare * 1.15),
    distanceKm,
    durationMinutes,
    baseFare: roundMoney(baseFare),
    distanceFare: roundMoney(distanceFare),
    timeFare: roundMoney(timeFare),
    serviceMultiplier: service.multiplier,
    serviceLabel: service.label,
    airportSupplement: roundMoney(airportSupplement),
    nightSupplement,
    bookingFee: roundMoney(bookingFee),
    minimumFare: FARE_MODEL.minimumFare,
    isAirport,
    isNightOrHoliday: nightOrHoliday,
  };
}
