// User roles
export const USER_ROLES = {
  PASSENGER: "passenger",
  DRIVER: "driver",
  ADMIN: "admin",
} as const;

// Driver statuses
export const DRIVER_STATUSES = {
  AVAILABLE: "available",
  BUSY: "busy",
  OFFLINE: "offline",
} as const;

// Ride statuses
export const RIDE_STATUSES = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

// Payment methods
export const PAYMENT_METHODS = {
  CASH: "cash",
  CARD: "card",
  WALLET: "wallet",
} as const;

// Languages
export const LANGUAGES = {
  SPANISH: "es",
  CATALAN: "ca",
  ENGLISH: "en",
} as const;

// Queue zones (Barcelona area - example)
export const DEFAULT_QUEUE_ZONES = [
  {
    id: "bcn_center",
    name: "Barcelona Centro",
    centerLatitude: 41.3851,
    centerLongitude: 2.1734,
    radiusMeters: 1000,
    city: "Barcelona",
    country: "Spain",
  },
  {
    id: "bcn_airport",
    name: "Aeropuerto de Barcelona",
    centerLatitude: 41.2974,
    centerLongitude: 2.0833,
    radiusMeters: 500,
    city: "Barcelona",
    country: "Spain",
  },
  {
    id: "bcn_port",
    name: "Puerto de Barcelona",
    centerLatitude: 41.3741,
    centerLongitude: 2.1882,
    radiusMeters: 500,
    city: "Barcelona",
    country: "Spain",
  },
  {
    id: "bcn_sants",
    name: "Estación de Sants",
    centerLatitude: 41.3783,
    centerLongitude: 2.1403,
    radiusMeters: 300,
    city: "Barcelona",
    country: "Spain",
  },
];

// Map defaults
export const MAP_DEFAULTS = {
  DEFAULT_CENTER: [41.3851, 2.1734] as [number, number], // Barcelona
  DEFAULT_ZOOM: 13,
  MIN_ZOOM: 10,
  MAX_ZOOM: 19,
};

// Ride estimation
export const RIDE_ESTIMATION = {
  BASE_FARE: 3.5, // EUR
  PER_KM: 1.2, // EUR per km
  PER_MINUTE: 0.25, // EUR per minute
  MINIMUM_FARE: 5.0, // EUR
};

// Queue management
export const QUEUE_CONFIG = {
  ESTIMATED_SERVICE_TIME: 10 * 60, // 10 minutes in seconds
  AUTO_REMOVE_TIMEOUT: 30 * 60, // 30 minutes in seconds
};

// Geolocation
export const GEOLOCATION_CONFIG = {
  TIMEOUT: 10000, // 10 seconds
  ENABLE_HIGH_ACCURACY: true,
  MAXIMUM_AGE: 0,
};

// API endpoints
export const API_ENDPOINTS = {
  RIDES: "/api/trpc/rides",
  DRIVERS: "/api/trpc/drivers",
  PASSENGERS: "/api/trpc/passengers",
  ADMIN: "/api/trpc/admin",
  AUTH: "/api/trpc/auth",
};

// Validation rules
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_NAME_LENGTH: 100,
  PHONE_REGEX: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

// Rating scale
export const RATING_SCALE = {
  MIN: 1,
  MAX: 5,
};

// Colors for UI (elegant palette)
export const COLORS = {
  PRIMARY: "#1e40af", // Deep blue
  SECONDARY: "#7c3aed", // Purple
  ACCENT: "#f59e0b", // Amber
  SUCCESS: "#10b981", // Emerald
  WARNING: "#f97316", // Orange
  ERROR: "#ef4444", // Red
  NEUTRAL_50: "#f9fafb",
  NEUTRAL_100: "#f3f4f6",
  NEUTRAL_200: "#e5e7eb",
  NEUTRAL_300: "#d1d5db",
  NEUTRAL_400: "#9ca3af",
  NEUTRAL_500: "#6b7280",
  NEUTRAL_600: "#4b5563",
  NEUTRAL_700: "#374151",
  NEUTRAL_800: "#1f2937",
  NEUTRAL_900: "#111827",
};
