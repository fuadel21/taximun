/**
 * Validación de ajustes, flechas de vuelta y cierre de sesión en las tres
 * apps (pasajero móvil/escritorio, conductor y admin).
 */
import { chromium } from "/home/user/.tools/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
const prefix = process.env.SHOT_PREFIX || "settings";
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

const browser = await chromium.launch();

async function login(page, email) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  if (email === "conductor") await page.click('button:has-text("Entrar como conductor")');
  else if (email === "pasajero") await page.click('button:has-text("Entrar como pasajero")');
  else {
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "Taximun-Demo-2026");
    await page.click('button:has-text("Continuar")');
  }
  await page.waitForURL(/passenger|driver|admin/, { timeout: 20000 });
}

// ── 1) PASAJERO EN MÓVIL: ajustes → perfil → cerrar sesión ─────────────
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on("pageerror", (err) => errors.push(`móvil: ${err.message}`));
await login(mobile, "pasajero");
await mobile.waitForSelector('button[aria-label="Ajustes"]', { timeout: 15000 });
check("móvil: botón de ajustes en la home del pasajero", true);
const navLabels = await mobile.locator("nav button").allInnerTexts();
check("móvil: nav inferior con Perfil", navLabels.some((label) => label.includes("Perfil")), navLabels.join("·"));
await mobile.click('button[aria-label="Ajustes"]');
await mobile.waitForURL("**/passenger/profile**", { timeout: 15000 });
check("móvil: ajustes lleva al perfil", true);
await mobile.waitForSelector("button:has-text(\"Cerrar sesión\")", { timeout: 15000 });
check("móvil: botón Cerrar sesión visible", true);
await mobile.screenshot({ path: `${SHOTS}/${prefix}-perfil-logout-movil.png`, fullPage: false });
await mobile.click('button:has-text("Cerrar sesión")');
await mobile.waitForURL("**/auth**", { timeout: 20000 });
check("móvil: cierre de sesión vuelve a /auth", true);
await mobile.close();

// ── 2) PASAJERO ESCRITORIO: flecha atrás en la reserva ─────────────────
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
desktop.on("pageerror", (err) => errors.push(`escritorio: ${err.message}`));
await login(desktop, "pasajero");
await desktop.waitForURL("**/passenger**", { timeout: 15000 });
await desktop.goto(`${BASE}/passenger/book`, { waitUntil: "networkidle" });
await desktop.waitForSelector("button:has-text(\"Volver\")", { timeout: 15000 });
check("escritorio: flecha Volver en la reserva", true);
await desktop.click('button:has-text("Volver")');
await desktop.waitForURL("**/passenger**", { timeout: 15000 });
check("escritorio: Volver regresa a la home", (desktop.url()).endsWith("/passenger"));
// Ajustes también en escritorio
await desktop.waitForSelector('button[aria-label="Ajustes"]', { timeout: 15000 });
check("escritorio: botón de ajustes en la home", true);
await desktop.close();

// ── 3) CONDUCTOR: ajustes → perfil → cerrar sesión ─────────────────────
const driver = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
driver.on("pageerror", (err) => errors.push(`conductor: ${err.message}`));
await login(driver, "conductor");
await driver.waitForURL("**/driver**", { timeout: 15000 });
await driver.waitForSelector('button[aria-label="Ajustes"]', { timeout: 15000 });
check("conductor: botón de ajustes en la home", true);
await driver.click('button[aria-label="Ajustes"]');
await driver.waitForURL("**/driver/profile**", { timeout: 15000 });
await driver.waitForSelector("button:has-text(\"Cerrar sesión\")", { timeout: 15000 });
check("conductor: Cerrar sesión en el perfil", true);
// Volver desde el perfil
await driver.waitForSelector("button:has-text(\"Volver\")", { timeout: 10000 });
await driver.click('button:has-text("Volver")');
await driver.waitForURL("**/driver**", { timeout: 15000 });
check("conductor: Volver desde el perfil a la home", true);
// Cerrar sesión desde ajustes
await driver.goto(`${BASE}/driver/profile`, { waitUntil: "networkidle" });
await driver.click('button:has-text("Cerrar sesión")');
await driver.waitForURL("**/auth**", { timeout: 20000 });
check("conductor: cierre de sesión a /auth", true);
await driver.close();

// ── 4) ADMIN: barra superior con salida directa ────────────────────────
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
admin.on("pageerror", (err) => errors.push(`admin: ${err.message}`));
await login(admin, "admin-demo@taximun.app");
await admin.waitForURL("**/admin**", { timeout: 20000 });
await admin.waitForSelector('button[aria-label="Cerrar sesión"]', { timeout: 15000 });
check("admin: botón de cierre de sesión en la barra superior", true);
await admin.screenshot({ path: `${SHOTS}/${prefix}-admin-topbar.png`, fullPage: false });
await admin.click('button[aria-label="Cerrar sesión"]');
await admin.waitForURL("**/auth**", { timeout: 20000 });
check("admin: cierre de sesión a /auth", true);
await admin.close();

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));
await browser.close();
console.log("LISTO");
