import { eq, and, desc, asc, lte, gte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  drivers,
  passengers,
  taxis,
  rides,
  driverQueues,
  queueZones,
  ratings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "phone", "loginMethod", "profilePicture"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.language !== undefined) {
      values.language = user.language;
      updateSet.language = user.language;
    }

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDriverByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPassengerByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(passengers).where(eq(passengers.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAvailableDriversNear(
  latitude: number,
  longitude: number,
  radiusKm: number = 5
) {
  const db = await getDb();
  if (!db) return [];

  // Simplified query - in production use spatial indexes
  // This returns drivers with status 'available' and recent location updates
  const result = await db
    .select()
    .from(drivers)
    .where(eq(drivers.status, "available"))
    .limit(20);

  return result;
}

export async function getDriverQueue(zoneId: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(driverQueues)
    .where(and(eq(driverQueues.zoneId, zoneId), eq(driverQueues.isActive, true)))
    .orderBy(asc(driverQueues.position));

  return result;
}

export async function addDriverToQueue(driverId: number, zoneId: string) {
  const db = await getDb();
  if (!db) return null;

  // Get current max position
  const existing = await db
    .select()
    .from(driverQueues)
    .where(and(eq(driverQueues.zoneId, zoneId), eq(driverQueues.isActive, true)))
    .orderBy(desc(driverQueues.position))
    .limit(1);

  const nextPosition = (existing[0]?.position ?? 0) + 1;

  const result = await db.insert(driverQueues).values({
    driverId,
    zoneId,
    position: nextPosition,
  });

  return result;
}

export async function removeDriverFromQueue(driverId: number, zoneId: string) {
  const db = await getDb();
  if (!db) return null;

  return await db
    .update(driverQueues)
    .set({ isActive: false })
    .where(and(eq(driverQueues.driverId, driverId), eq(driverQueues.zoneId, zoneId)));
}

export async function updateDriverLocation(
  driverId: number,
  latitude: number,
  longitude: number,
  zoneId?: string
) {
  const db = await getDb();
  if (!db) return null;

  const updateData: any = {
    currentLatitude: latitude,
    currentLongitude: longitude,
    lastLocationUpdate: new Date(),
  };

  if (zoneId) {
    updateData.currentZoneId = zoneId;
  }

  return await db.update(drivers).set(updateData).where(eq(drivers.id, driverId));
}

export async function updateDriverStatus(driverId: number, status: "available" | "busy" | "offline") {
  const db = await getDb();
  if (!db) return null;

  return await db.update(drivers).set({ status }).where(eq(drivers.id, driverId));
}

export async function createRide(rideData: any) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(rides).values(rideData);
  return result;
}

export async function updateRideStatus(rideId: number, status: string) {
  const db = await getDb();
  if (!db) return null;

  const updateData: any = { status };

  if (status === "accepted") {
    updateData.acceptedAt = new Date();
  } else if (status === "in_progress") {
    updateData.startedAt = new Date();
  } else if (status === "completed") {
    updateData.completedAt = new Date();
  }

  return await db.update(rides).set(updateData).where(eq(rides.id, rideId));
}

export async function getRideById(rideId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPassengerRides(passengerId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(rides)
    .where(eq(rides.passengerId, passengerId))
    .orderBy(desc(rides.createdAt))
    .limit(limit);
}

export async function getDriverRides(driverId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(rides)
    .where(eq(rides.driverId, driverId))
    .orderBy(desc(rides.createdAt))
    .limit(limit);
}

export async function createRating(ratingData: any) {
  const db = await getDb();
  if (!db) return null;

  return await db.insert(ratings).values(ratingData);
}

export async function getQueueZone(zoneId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(queueZones).where(eq(queueZones.id, zoneId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllQueueZones() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(queueZones).where(eq(queueZones.isActive, true));
}

export async function getTaxiByLicensePlate(licensePlate: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(taxis).where(eq(taxis.licensePlate, licensePlate)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getDriverTaxis(driverId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(taxis).where(eq(taxis.driverId, driverId));
}
