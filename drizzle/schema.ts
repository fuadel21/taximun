import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Extended users table with role-based fields
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["passenger", "driver", "admin"]).default("passenger").notNull(),
  language: mysqlEnum("language", ["es", "ca", "en"]).default("es").notNull(),
  profilePicture: text("profilePicture"), // URL to profile picture
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Driver-specific information
 */
export const drivers = mysqlTable("drivers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  licenseNumber: varchar("licenseNumber", { length: 50 }).notNull().unique(),
  licenseExpiry: timestamp("licenseExpiry").notNull(),
  taxiLicense: varchar("taxiLicense", { length: 50 }).notNull().unique(),
  taxiLicenseExpiry: timestamp("taxiLicenseExpiry").notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalTrips: int("totalTrips").default(0),
  isVerified: boolean("isVerified").default(false),
  status: mysqlEnum("status", ["available", "busy", "offline"]).default("offline").notNull(),
  currentLatitude: decimal("currentLatitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("currentLongitude", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("lastLocationUpdate"),
  currentZoneId: varchar("currentZoneId", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;

/**
 * Taxi vehicle information
 */
export const taxis = mysqlTable("taxis", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull(),
  licensePlate: varchar("licensePlate", { length: 20 }).notNull().unique(),
  make: varchar("make", { length: 50 }).notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  year: int("year").notNull(),
  color: varchar("color", { length: 30 }),
  capacity: int("capacity").default(4).notNull(),
  insuranceExpiry: timestamp("insuranceExpiry"),
  inspectionExpiry: timestamp("inspectionExpiry"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Taxi = typeof taxis.$inferSelect;
export type InsertTaxi = typeof taxis.$inferInsert;

/**
 * Queue zones (geographic areas for virtual queues)
 */
export const queueZones = mysqlTable("queue_zones", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: text("name").notNull(),
  centerLatitude: decimal("centerLatitude", { precision: 10, scale: 8 }).notNull(),
  centerLongitude: decimal("centerLongitude", { precision: 11, scale: 8 }).notNull(),
  radiusMeters: int("radiusMeters").default(500).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).default("Spain").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QueueZone = typeof queueZones.$inferSelect;
export type InsertQueueZone = typeof queueZones.$inferInsert;

/**
 * Virtual queue entries (FIFO queue for drivers in zones)
 */
export const driverQueues = mysqlTable("driver_queues", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull(),
  zoneId: varchar("zoneId", { length: 50 }).notNull(),
  position: int("position").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DriverQueue = typeof driverQueues.$inferSelect;
export type InsertDriverQueue = typeof driverQueues.$inferInsert;

/**
 * Ride/Service records
 */
export const rides = mysqlTable("rides", {
  id: int("id").autoincrement().primaryKey(),
  passengerId: int("passengerId").notNull(),
  driverId: int("driverId"),
  taxiId: int("taxiId"),
  pickupLatitude: decimal("pickupLatitude", { precision: 10, scale: 8 }).notNull(),
  pickupLongitude: decimal("pickupLongitude", { precision: 11, scale: 8 }).notNull(),
  pickupAddress: text("pickupAddress"),
  dropoffLatitude: decimal("dropoffLatitude", { precision: 10, scale: 8 }).notNull(),
  dropoffLongitude: decimal("dropoffLongitude", { precision: 11, scale: 8 }).notNull(),
  dropoffAddress: text("dropoffAddress"),
  status: mysqlEnum("status", ["pending", "accepted", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  estimatedFare: decimal("estimatedFare", { precision: 10, scale: 2 }),
  actualFare: decimal("actualFare", { precision: 10, scale: 2 }),
  estimatedDuration: int("estimatedDuration"), // in seconds
  actualDuration: int("actualDuration"), // in seconds
  distance: decimal("distance", { precision: 10, scale: 2 }), // in km
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "wallet"]).default("cash"),
  isPaid: boolean("isPaid").default(false),
  cancelledBy: mysqlEnum("cancelledBy", ["passenger", "driver"]),
  cancellationReason: text("cancellationReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  acceptedAt: timestamp("acceptedAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Ride = typeof rides.$inferSelect;
export type InsertRide = typeof rides.$inferInsert;

/**
 * Ratings and reviews
 */
export const ratings = mysqlTable("ratings", {
  id: int("id").autoincrement().primaryKey(),
  rideId: int("rideId").notNull(),
  ratedById: int("ratedById").notNull(), // passenger or driver
  ratedUserId: int("ratedUserId").notNull(), // driver or passenger
  score: int("score").notNull(), // 1-5
  comment: text("comment"),
  categories: json("categories"), // {cleanliness: 5, safety: 5, communication: 4}
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = typeof ratings.$inferInsert;

/**
 * Passenger-specific information
 */
export const passengers = mysqlTable("passengers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  homeAddress: text("homeAddress"),
  workAddress: text("workAddress"),
  favoriteLocations: json("favoriteLocations"), // [{name: "Home", lat: 41.3851, lng: 2.1734}]
  totalRides: int("totalRides").default(0),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("5.00"),
  preferredPaymentMethod: mysqlEnum("preferredPaymentMethod", ["cash", "card", "wallet"]).default("cash"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Passenger = typeof passengers.$inferSelect;
export type InsertPassenger = typeof passengers.$inferInsert;

/**
 * Admin audit logs
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(),
  entityId: int("entityId"),
  oldValue: json("oldValue"),
  newValue: json("newValue"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
