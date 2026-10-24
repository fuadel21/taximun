import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
const prefix = process.env.SHOT_PREFIX || "zones";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });
const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "admin-demo@taximun.app");
await page.fill('input[type="password"]', "Taximun-Demo-2026");
await page.click('button:has-text("Continuar")');
await page.waitForURL("**/admin**", { timeout: 20000 });
await page.goto(`${BASE}/admin/tariffs`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Zonas con suplemento", { timeout: 20000 });
check("sección de zonas presente", true);

// Mapa del editor con círculos
await page.waitForSelector(".leaflet-container", { timeout: 15000 });
await page.waitForTimeout(3500);
const circles = await page.locator(".leaflet-overlay-pane svg path").count();
check("círculos de zonas dibujados", circles >= 5, `${circles} paths`);
const tiles = await page.locator(".leaflet-tile-loaded").count();
check("tiles OSM del editor", tiles > 4, `${tiles} tiles`);
const body = await page.locator("body").innerText();
check("leyenda de suplementos", body.includes("Moll Adossat") && body.includes("Fira Gran Via"));
check("zona Sants en la lista", body.includes("Estació de Sants"));

// Editar Sants: radio 320 → 500 y guardar
await page.click('button:has-text("Estació de Sants")');
await page.waitForSelector('label:has-text("Radio (metros)") input', { timeout: 8000 });
const radiusBefore = await page.locator('label:has-text("Radio (metros)") input').inputValue();
check("formulario de zona con radio", radiusBefore === "320", `radio inicial ${radiusBefore}`);
await page.fill('label:has-text("Radio (metros)") input', "500");
await page.click('button:has-text("Guardar zona")');
await page.waitForSelector("text=guardada. El motor de precios ya la aplica", { timeout: 15000 });
check("zona guardada (radio 500 m)", true);
await page.waitForTimeout(1500);
const bodyAfter = await page.locator("body").innerText();
check("lista refleja el nuevo radio", bodyAfter.includes("500 m"), "Estació de Sants · 500 m");
await page.screenshot({ path: `${SHOTS}/${prefix}-admin-zonas.png`, fullPage: true });

// Restaurar radio 320
await page.click('button:has-text("Estació de Sants")');
await page.fill('label:has-text("Radio (metros)") input', "320");
await page.click('button:has-text("Guardar zona")');
await page.waitForSelector("text=guardada. El motor de precios ya la aplica", { timeout: 15000 });
check("radio restaurado a 320 m", true);

// Alta de una zona nueva de prueba y baja inmediata
await page.click('button:has-text("Nueva zona")');
await page.click(".leaflet-container", { position: { x: 400, y: 300 } });
await page.waitForTimeout(500);
await page.fill('label:has-text("Nombre") input', "Zona de prueba E2E");
await page.click('button:has-text("Guardar zona")');
await page.waitForSelector("text=guardada. El motor de precios ya la aplica", { timeout: 15000 });
check("zona nueva creada con centro del mapa", true);
const bodyNew = await page.locator("body").innerText();
check("zona nueva visible en lista", bodyNew.includes("Zona de prueba E2E"));
// Eliminarla
await page.click('button:has-text("Zona de prueba E2E")');
await page.waitForTimeout(400);
const deleteBtn = page.locator("button").filter({ has: page.locator("svg.lucide-trash2") });
if (await deleteBtn.count() > 0) {
  await deleteBtn.first().click();
  await page.waitForSelector("text=eliminada", { timeout: 15000 });
  check("zona de prueba eliminada", true);
} else {
  check("zona de prueba eliminada", false, "botón de borrado no encontrado");
}

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));
await browser.close();
console.log("LISTO");
