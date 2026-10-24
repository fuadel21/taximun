/**
 * Validación del mini-mapa en la oferta del conductor.
 * 1) Crea una oferta real como Laura (pasajera) vía tRPC con coordenadas.
 * 2) Entra como Pau (conductor) y comprueba la tarjeta con mini-mapa + ETA.
 * 3) Cancela el viaje como pasajera para dejar el estado limpio.
 */
import { chromium } from "/home/user/.tools/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
const prefix = process.env.SHOT_PREFIX || "offer";
fs.mkdirSync(SHOTS, { recursive: true });

const env = {};
for (const line of fs.readFileSync("/home/user/taximun/.env", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
}

async function login(email) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: "Taximun-Demo-2026" }),
  });
  if (!response.ok) throw new Error(`login ${email}: ${response.status}`);
  const payload = await response.json();
  return payload.access_token;
}

async function trpc(token, procedure, input) {
  const url = new URL(`${BASE}/api/trpc/${procedure}`);
  if (input === undefined) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || response.status);
    return payload.result?.data?.json;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: input }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} :: ${JSON.stringify(payload).slice(0, 400)}`);
  return payload.result?.data?.json;
}

const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

// 1) Oferta real como Laura: aeropuerto T1 → Plaça Catalunya
const laura = await login("pasajero@taximun.app");
// Idempotencia: si queda un viaje activo de una ejecución anterior, cancelarlo.
const previous = await trpc(laura, "system.taxiOps.passenger.getCurrentRide", undefined).catch(() => null);
if (previous && ["pending", "assigned", "in_progress"].includes(previous.status)) {
  await trpc(laura, "system.taxiPassengerCancellation.cancel", { rideId: previous.id, reason: "changed_mind", note: "Limpieza previa al test" });
  console.log("· viaje previo cancelado antes de empezar");
}
const ride = await trpc(laura, "system.taxiPassengerBooking.createImmediate", {
  pickupAddress: "Aeroport del Prat T1 · Barcelona",
  dropoffAddress: "Plaça de Catalunya · Barcelona",
  pickupLat: 41.2974, pickupLng: 2.0833,
  dropoffLat: 41.3874, dropoffLng: 2.1686,
  routeDistanceKm: 16.5, routeDurationMinutes: 27,
  category: "standard", paymentMethod: "cash",
  intermediateStops: [],
  requirements: { wheelchair: false, largeLuggage: false, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "Test mini-mapa oferta" },
});
check("oferta creada (Laura, aeropuerto→centro)", ride?.status === "pending", `${ride?.id?.slice(0, 8)} · ${ride?.estimated_fare} €`);

// 2) Pau ve la tarjeta con mini-mapa
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });

await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await page.click('button:has-text("Entrar como conductor")');
await page.waitForURL("**/driver**", { timeout: 20000 });
await page.goto(`${BASE}/driver/queue`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Solicitudes disponibles", { timeout: 20000 });
await page.waitForSelector("text=Test mini-mapa oferta", { timeout: 20000 }).catch(() => {});
await page.waitForSelector(".rounded-\\[2rem\\] .leaflet-container", { timeout: 20000 });
check("mini-mapa en la tarjeta de oferta", true);

await page.waitForTimeout(4500);
const info = await page.evaluate(() => ({
  markers: document.querySelectorAll(".leaflet-marker-icon").length,
  paths: document.querySelectorAll(".leaflet-overlay-pane svg path").length,
  eta: document.body.innerText.includes("Llegada al punto:"),
  etaText: (document.body.innerText.match(/Llegada al punto: [^\n]*/) || [])[0] || "",
  fare: document.body.innerText.includes("Tarifa") || document.body.innerText.includes("Estimado"),
}));
check("marcadores (recogida + destino + tú)", info.markers >= 3, `${info.markers} marcadores`);
check("rutas OSRM dibujadas (aproximación + viaje)", info.paths >= 2, `${info.paths} polilíneas`);
check("ETA de llegada al punto", info.eta, info.etaText);
check("importe estimado visible", info.fare);
await page.screenshot({ path: `${SHOTS}/${prefix}-driver-oferta-minimapa.png`, fullPage: true });

// 3) Limpieza: cancelar como Laura
try {
  await trpc(laura, "system.taxiPassengerCancellation.cancel", { rideId: ride.id, reason: "changed_mind", note: "Limpieza tras test de mini-mapa" });
  check("viaje de prueba cancelado (estado limpio)", true);
} catch (err) {
  const current = await trpc(laura, "system.taxiOps.passenger.getCurrentRide", undefined).catch(() => null);
  check("viaje de prueba cancelado (estado limpio)", false, `${err.message} · actual: ${current?.status}`);
}

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));
await browser.close();
console.log("LISTO");
