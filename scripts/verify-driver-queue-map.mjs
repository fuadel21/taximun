import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "docs/validacion-navegador";
fs.mkdirSync(SHOTS, { recursive: true });
const prefix = process.env.SHOT_PREFIX || "queue";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`console: ${msg.text()}`); });
const check = (name, ok, note = "") => console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);

await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "conductor@taximun.app");
await page.fill('input[type="password"]', "Taximun-Demo-2026");
await page.click('button:has-text("Continuar")');
await page.waitForURL("**/driver**", { timeout: 20000 });
await page.waitForSelector(".leaflet-container", { timeout: 20000 });
check("mapa de cola presente en /driver", true);

await page.waitForTimeout(4000);
const info = await page.evaluate(() => ({
  tiles: document.querySelectorAll(".leaflet-tile-loaded").length,
  circles: document.querySelectorAll(".leaflet-overlay-pane svg path").length,
  markers: document.querySelectorAll(".leaflet-marker-icon").length,
  legend: document.body.innerText.includes("Colas FIFO por zona"),
  yourPosition: document.body.innerText.includes("tu posición"),
}));
check("tiles OSM cargadas", info.tiles > 4, `${info.tiles} tiles`);
check("círculos de zona dibujados", info.circles >= 5, `${info.circles} paths SVG`);
check("taxis en cola como marcadores", info.markers >= 2, `${info.markers} marcadores`);
check("leyenda del mapa", info.legend);
check("tarjeta de posición FIFO", await page.locator("text=tu posición").first().isVisible().catch(() => false));

const bodyText = await page.locator("body").innerText();
check("zona actual detectada (Aeroport T1)", bodyText.includes("Aeroport T1"));
check("turno FIFO visible", /#\d/.test(bodyText));
await page.screenshot({ path: `${SHOTS}/${prefix}-driver-queue-map.png`, fullPage: true });

console.log(`\nERRORES DE CONSOLA/PAGE: ${errors.length}`);
errors.slice(0, 8).forEach((item) => console.log(`  ${item}`));
await browser.close();
console.log("LISTO");
