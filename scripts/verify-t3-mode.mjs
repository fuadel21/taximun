/**
 * Validación T3: etiqueta y componente de tiempo en la reserva, y control
 * del modo de tarifa (T3 ↔ T1/T2) desde administración.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
const prefix = process.env.SHOT_PREFIX || "t3";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

async function login(page, email) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  const resolved = email === "conductor" ? "conductor@taximun.app" : email;
  await page.fill('input[type="email"]', resolved);
  await page.fill('input[type="password"]', "Taximun-Demo-2026");
  await page.click('button:has-text("Continuar")');
  await page.waitForURL(/passenger|driver|admin/, { timeout: 20000 });
}

// ── Pasajero: precio T3 con tiempo ─────────────────────────────────────
const passenger = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
passenger.on("pageerror", (err) => errors.push(`pasajero: ${err.message}`));
passenger.on("console", (msg) => { if (msg.type() === "error") errors.push(`pasajero: ${msg.text()}`); });
await login(passenger, "pasajero@taximun.app");
await passenger.goto(`${BASE}/passenger/book`, { waitUntil: "networkidle" });
await passenger.waitForSelector(".leaflet-container", { timeout: 15000 });
await passenger.fill('input[placeholder*="A dónde vas"]', "Sagrada Familia");
await passenger.waitForSelector('button:has-text("Sagrada Familia")', { timeout: 15000 });
await passenger.click('button:has-text("Sagrada Familia")');
await passenger.waitForFunction(() => {
  const el = [...document.querySelectorAll("p")].find((node) => node.className.includes("text-4xl"));
  return el && /\d/.test(el.textContent || "");
}, null, { timeout: 25000 });
await passenger.waitForTimeout(1500);
const body1 = await passenger.locator("body").innerText();
const price1 = (await passenger.locator("p.text-4xl").first().textContent())?.trim();
check("etiqueta T3 en la reserva", body1.includes("T3 · precio cerrado"), (body1.match(/T3 · [^\n]*/) || [])[0] || "");
check("componente de tiempo con tráfico", body1.includes("Tiempo con tráfico"), (body1.match(/Tiempo con tráfico[^\n]*/) || [])[0] || "");
check("nota T3 por app", body1.includes("(T3 por app)"));
check("precio T3 calculado", Boolean(price1), price1 || "");
await passenger.screenshot({ path: `${SHOTS}/${prefix}-booking-t3.png`, fullPage: true });

// ── Admin: modo de tarifa visible y conmutables ────────────────────────
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
admin.on("pageerror", (err) => errors.push(`admin: ${err.message}`));
await login(admin, "admin-demo@taximun.app");
await admin.goto(`${BASE}/admin/tariffs`, { waitUntil: "networkidle" });
await admin.waitForSelector("text=Modo de precio de la app", { timeout: 20000 });
const t3Flag = await admin.locator('label:has-text("T3 diurna · bajada de bandera") input').inputValue();
check("grupo T3 con valores oficiales", t3Flag === "4.1117", `bandera T3 = ${t3Flag}`);
const modeValue = await admin.locator("#tariff-mode-select").inputValue();
check("modo activo T3", modeValue === "T3", modeValue);

// Cambiar a T1/T2 y guardar
await admin.selectOption("#tariff-mode-select", "T1T2");
await admin.click('button:has-text("Guardar tarifa")');
await admin.waitForSelector("text=Tarifa actualizada", { timeout: 20000 });
check("modo cambiado a T1/T2 y guardado", true);

// ── Pasajero (recarga): ahora taxímetro, sin componente de tiempo ──────
await passenger.goto(`${BASE}/passenger/book`, { waitUntil: "networkidle" });
await passenger.fill('input[placeholder*="A dónde vas"]', "Sagrada Familia");
await passenger.waitForSelector('button:has-text("Sagrada Familia")', { timeout: 15000 });
await passenger.click('button:has-text("Sagrada Familia")');
await passenger.waitForFunction(() => {
  const el = [...document.querySelectorAll("p")].find((node) => node.className.includes("text-4xl"));
  return el && /\d/.test(el.textContent || "");
}, null, { timeout: 25000 });
await passenger.waitForTimeout(1500);
const body2 = await passenger.locator("body").innerText();
const price2 = (await passenger.locator("p.text-4xl").first().textContent())?.trim();
check("etiqueta T1/T2 tras el cambio", body2.includes("T1 ·") || body2.includes("T2 ·"), (body2.match(/T[12] · [^\n]*/) || [])[0] || "");
check("sin componente de tiempo en T1/T2", !body2.includes("Tiempo con tráfico"));
check("precio distinto entre modos", price1 !== price2, `${price1} → ${price2}`);

// Volver al modo oficial T3
await admin.selectOption("#tariff-mode-select", "T3");
await admin.click('button:has-text("Guardar tarifa")');
await admin.waitForSelector("text=Tarifa actualizada", { timeout: 20000 });
check("modo T3 restaurado", true);
await admin.screenshot({ path: `${SHOTS}/${prefix}-admin-modo-t3.png`, fullPage: false });

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));
await browser.close();
console.log("LISTO");
