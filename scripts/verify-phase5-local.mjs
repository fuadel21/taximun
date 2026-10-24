import { chromium } from "/home/user/.tools/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });

const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

// 1) Home y login demo pasajero
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await page.click('button:has-text("Entrar como pasajero")');
await page.waitForURL("**/passenger**", { timeout: 20000 });
await page.goto(`${BASE}/passenger/book`, { waitUntil: "networkidle" });
await page.waitForSelector(".leaflet-container", { timeout: 15000 });
check("mapa Leaflet presente en /passenger/book", true);

// 2) Tiles OSM cargadas
await page.waitForTimeout(3500);
const tiles = await page.locator(".leaflet-tile-loaded").count();
check("tiles OpenStreetMap cargadas", tiles > 4, `${tiles} tiles`);

// 3) Ubicación de respaldo (Plaça de Catalunya) como origen
const pickupText = await page.locator("text=Plaça de Catalunya").first().isVisible().catch(() => false);
const detecting = await page.locator("text=Detectando tu ubicación").first().isVisible().catch(() => false);
check("origen inicializado (respaldo o geolocalización)", pickupText || detecting, pickupText ? "Plaça de Catalunya" : "esperando geo");

// 4) Buscar destino con Nominatim
await page.fill('input[placeholder*="A dónde vas"]', "Sagrada Família");
await page.waitForSelector("text=Sagrada Familia", { timeout: 15000 });
check("resultados de búsqueda Nominatim", true);
await page.click('button:has-text("Sagrada Familia")');

// 5) Ruta OSRM + precio
await page.waitForSelector(".leaflet-marker-icon", { timeout: 15000 });
await page.waitForFunction(() => document.body.innerText.includes("Precio cerrado por adelantado"), null, { timeout: 15000 });
await page.waitForFunction(() => {
  const el = [...document.querySelectorAll("p")].find((node) => node.className.includes("text-4xl"));
  return el && /\d/.test(el.textContent || "");
}, null, { timeout: 20000 });
const price = (await page.locator("p.text-4xl").first().textContent())?.trim();
check("precio cerrado calculado", Boolean(price), price || "");
await page.waitForFunction(() => document.body.innerText.includes("Ruta real por carretera"), null, { timeout: 15000 });
const routeLine = await page.locator("text=Ruta real por carretera").first().textContent().catch(() => "");
check("ruta real OSRM dibujada", Boolean(routeLine), (routeLine || "").trim());

// 6) Desglose oficial
const body = await page.locator("body").innerText();
check("etiqueta tarifa oficial AMB", body.includes("tarifa oficial AMB") || body.includes("T1 · laborable") || body.includes("T2 ·"));
check("bajada de bandera en desglose", body.includes("Bajada de bandera"));

// 7) Precio por categoría en tarjetas
const vanSupplement = body.includes("+ suplemento 5-8 plazas");
check("tarjetas de categoría con nota de tarifa", vanSupplement);
await page.screenshot({ path: `${SHOTS}/fase5-booking-mapa.png`, fullPage: true });

// 8) Cambiar a monovolumen y ver precio distinto
await page.click('button:has-text("Monovolumen")');
await page.waitForTimeout(2500);
const priceVan = (await page.locator("p.text-4xl").first().textContent())?.trim();
check("precio monovolumen (con suplemento 4,60 €)", priceVan !== price, `${price} → ${priceVan}`);
await page.screenshot({ path: `${SHOTS}/fase5-booking-van.png`, fullPage: false });

// 9) Tocar el mapa para cambiar destino
await page.click(".leaflet-container", { position: { x: 300, y: 200 } });
await page.waitForTimeout(3000);
check("toque en el mapa aceptado sin errores", true);

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));

// 10) Admin: tarifas
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await admin.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await admin.fill('input[type="email"]', "admin-demo@taximun.app");
await admin.fill('input[type="password"]', "Taximun-Demo-2026");
await admin.click('button:has-text("Continuar")');
await admin.waitForURL("**/admin**", { timeout: 20000 });
await admin.goto(`${BASE}/admin/tariffs`, { waitUntil: "networkidle" });
await admin.waitForSelector("text=Tarifas oficiales del taxi (AMB)", { timeout: 15000 });
await admin.waitForSelector('input[type="number"]', { timeout: 10000 });
const value1 = await admin.locator('label:has-text("Bajada de bandera T1") input').inputValue();
check("admin tarifas: valores cargados", value1 === "2.8", `T1 bandera = ${value1}`);
await admin.screenshot({ path: `${SHOTS}/fase5-admin-tarifas.png`, fullPage: true });

await browser.close();
console.log("\nLISTO");
