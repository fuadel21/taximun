/**
 * Taximun — Modo local (demo sin Supabase).
 *
 * Cuando no hay SUPABASE_URL configurada, el backend usa este cliente en
 * memoria en lugar del SDK de Supabase. Los datos viven mientras corre el
 * proceso y se siembran con datos realistas de Barcelona.
 *
 * Además gestiona sesiones de desarrollo (login rápido por rol) mediante
 * la cookie `taximun_dev_session`. SOLO para desarrollo/demo.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { createLocalQueryFactory } from "./postgrest";
import { runLocalRpc } from "./rpcs";
import { seedIfEmpty, store, allRows, findRow, insertRow, LOCAL_USERS, nowISO } from "./store";
import { seedQueueZones, syncZoneQueues } from "./queues";

/** Reinicia el almacén demo a su estado inicial (solo modo local). */
export function resetLocalDemo() {
  store.clear();
  seedIfEmpty();
  seedQueueZones();
  syncZoneQueues();
  return { ok: true, reset: true, zones: allRows("queue_zones").length };
}

export const DEV_SESSION_COOKIE = "taximun_dev_session";

export function isLocalModeActive(): boolean {
  return !(process.env.SUPABASE_URL ?? "").trim();
}

// Los efectos de modo demo (semillas + planificador) solo arrancan sin Supabase real.
if (isLocalModeActive()) {
  seedIfEmpty();
  seedQueueZones();
  syncZoneQueues();
}

// ---------------------------------------------------------------------------
// Planificador local (equivalente al pg_cron de producción):
//   - taximun_process_scheduled_bookings → recordatorios 24h/2h/30m y
//     conversión de reservas en viajes 15 min antes de la hora programada.
//   - syncZoneQueues() → reconstruye las colas FIFO de zona.
// ---------------------------------------------------------------------------
const LOCAL_SCHEDULER_MS = Number(process.env.TAXIMUN_LOCAL_SCHEDULER_MS ?? 30_000);
if (isLocalModeActive() && Number.isFinite(LOCAL_SCHEDULER_MS) && LOCAL_SCHEDULER_MS >= 1000) {
  const tick = () => {
    try {
      runLocalRpc("taximun_process_scheduled_bookings", {});
      syncZoneQueues();
    } catch (error) {
      console.warn("[local-mode] scheduler tick:", error);
    }
  };
  const timer = setInterval(tick, LOCAL_SCHEDULER_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[local-mode] scheduler activo cada ${Math.round(LOCAL_SCHEDULER_MS / 1000)}s (reservas + colas por zona)`);
}

// ---------------------------------------------------------------------------
// Cliente compatible con el subconjunto de supabase-js usado por Taximun
// ---------------------------------------------------------------------------

const fromFactory = createLocalQueryFactory(store);

function storageBucket(name: string) {
  return {
    upload: async (_path: string, _file: any) => ({ data: { path: _path }, error: null }),
    getPublicUrl: (_path: string) => ({ data: { publicUrl: `https://demo.taximun.local/storage/${name}/${_path}` } }),
    createSignedUrl: async (_path: string, _seconds: number) => ({
      data: { signedUrl: `https://demo.taximun.local/storage/${name}/${_path}?demo=1` },
      error: null,
    }),
    remove: async () => ({ data: null, error: null }),
    list: async () => ({ data: [], error: null }),
  };
}

export const localSupabase: any = {
  from: (table: string) => fromFactory(table),
  rpc: (name: string, params?: any) => Promise.resolve(runLocalRpc(name, params)),
  auth: {
    getUser: async (_token: string) => ({ data: { user: null }, error: { message: "Modo demo: sin Supabase Auth" } }),
    admin: {
      listUsers: async () => ({
        data: {
          users: allRows("users").map((u) => ({
            id: u.openId, email: u.email, user_metadata: { role: u.role, name: u.name },
            created_at: u.createdAt,
          })),
        },
        error: null,
      }),
    },
  },
  storage: { from: storageBucket },
  channel: (_name: string) => ({
    on: () => ({ subscribe: (cb?: (status: string) => void) => { cb?.("SUBSCRIBED"); return { channelState: () => "joined" }; } }),
    subscribe: (cb?: (status: string) => void) => { cb?.("SUBSCRIBED"); return { channelState: () => "joined" }; },
  }),
  removeChannel: () => {},
  getChannels: () => [],
};

// ---------------------------------------------------------------------------
// Sesiones de desarrollo
// ---------------------------------------------------------------------------

/**
 * Sesiones de desarrollo STATELESS: el token lleva el openId firmado con HMAC
 * (secreto local fijo o JWT_SECRET), de modo que las sesiones sobreviven a
 * reinicios del servidor de desarrollo. Solo modo demo.
 */
const DEV_SESSION_SECRET = process.env.JWT_SECRET?.trim() || "taximun-local-demo-secret";

function sign(payload: string): string {
  return crypto.createHmac("sha256", DEV_SESSION_SECRET).update(payload).digest("base64url");
}

function mintDevToken(openId: string): string {
  const payload = Buffer.from(JSON.stringify({ openId, iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function setDevCookie(res: any, token: string) {
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${DEV_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${isProduction ? "; Secure" : ""}`,
  );
}

function readDevToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed?.openId === "string" ? parsed.openId : null;
  } catch {
    return null;
  }
}

/** Conductores de demo disponibles para el login rápido (1..4). */
export const LOCAL_DRIVERS: Record<number, string> = {
  1: LOCAL_USERS.driver1.openId,
  2: LOCAL_USERS.driver2.openId,
  3: LOCAL_USERS.driver3.openId,
  4: LOCAL_USERS.driver4.openId,
};

function userByOpenId(openId: string) {
  return findRow("users", (u) => u.openId === openId);
}

export type DevLoginRole = "passenger" | "driver" | "admin";

const DEFAULT_DEMO_ACCOUNT: Record<DevLoginRole, { openId: string; name: string; email: string }> = {
  passenger: { openId: LOCAL_USERS.passenger.openId, name: LOCAL_USERS.passenger.name, email: LOCAL_USERS.passenger.email },
  driver: { openId: LOCAL_USERS.driver1.openId, name: LOCAL_USERS.driver1.name, email: LOCAL_USERS.driver1.email },
  admin: { openId: LOCAL_USERS.admin.openId, name: LOCAL_USERS.admin.name, email: LOCAL_USERS.admin.email },
};

export function createDevSession(res: any, role: DevLoginRole, name?: string | null, driverIndex?: number | null) {
  name = name ?? undefined;
  driverIndex = driverIndex ?? undefined;
  const base = DEFAULT_DEMO_ACCOUNT[role];
  let openId = base.openId;
  if (role === "driver" && driverIndex && LOCAL_DRIVERS[driverIndex]) {
    openId = LOCAL_DRIVERS[driverIndex];
    const named = findRow("users", (u) => u.openId === openId);
    const useName = name && name.trim().length >= 2 ? name.trim() : named?.name ?? base.name;
    setDevCookie(res, mintDevToken(openId));
    return { ...named, name: useName, lastSignedIn: nowISO() };
  }

  if (name && name.trim().length >= 2 && name.trim() !== base.name) {
    // cuenta nueva para esta demo
    openId = `local:${role}-${crypto.randomUUID().slice(0, 8)}`;
    const existing = userByOpenId(openId);
    if (!existing) {
      insertRow("users", {
        id: allRows("users").length + 1,
        openId,
        name: name.trim(),
        email: `${role}.${openId.split(":")[1]}@taximun.local`,
        phone: null,
        loginMethod: "local-demo",
        role,
        language: "es",
        profilePicture: null,
        isActive: true,
      });
      if (role === "driver") {
        // perfil pendiente de verificar → flujo de verificación visible en admin
        insertRow("driver_live_status", {
          driver_id: openId, driver_name: name.trim(), taxi_code: "TX-NEW", plate: "PEND-000",
          status: "offline", current_lat: 41.3874, current_lng: 2.1686, current_zone: "Eixample",
          total_earnings: 0, total_rides: 0, rating: null,
          offers_received: 0, offers_accepted: 0, offers_rejected: 0, offers_expired: 0, last_offer_at: null,
        });
      }
    }
  }

  setDevCookie(res, mintDevToken(openId));

  const user = userByOpenId(openId);
  return { ...user, lastSignedIn: nowISO() };
}

export function destroyDevSession(req: Request, res: any) {
  res.setHeader("Set-Cookie", `${DEV_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function readDevCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === DEV_SESSION_COOKIE) return v.join("=");
  }
  return null;
}

/** Devuelve el usuario de la sesión dev o null. Usado desde sdk.authenticateRequest. */
export function resolveDevSession(req: Request) {
  const token = readDevCookie(req);
  if (!token) return null;
  const openId = readDevToken(token);
  if (!openId) return null;
  const user = userByOpenId(openId);
  if (!user) return null;
  return user;
}
