/**
 * Taximun — validación de navegador contra Supabase REAL (Fase 4).
 * Recorre pasajero → conductor (cola FIFO) → admin con capturas de pantalla.
 * Uso: node scripts/browser-validate.cjs
 */
const { chromium } = require(process.env.HOME + "/.tools/node_modules/playwright");

const BASE = "http://localhost:3000";
const USERS = {
  pasajero: { email: "pasajero@taximun.app", password: "Taximun-Demo-2026" },
  conductor: { email: "conductor@taximun.app", password: "Taximun-Demo-2026" },
  admin: { email: "admin-demo@taximun.app", password: "Taximun-Demo-2026" },
};
const OUT = __dirname + "/../docs/validacion-navegador";

async function login(page, { email, password }) {
  await page.goto(BASE + "/auth", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function shot(page, name, errors) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const n = errors.length;
  console.log(`  📸 ${name}.png (${errors.length - n + n} err acumulados)`);
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const errors = [];

  // ────────── PASAJERO ──────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[pasajero] ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`[pasajero] ${m.text().slice(0, 140)}`));
    console.log("── PASAJERO (Laura Demo) ──");
    await login(page, USERS.pasajero);
    console.log(`  ✓ login real → ${page.url()}`);
    await shot(page, "01-pasajero-inicio", errors);
    // formulario de reserva
    await page.goto(BASE + "/passenger/book", { waitUntil: "networkidle" });
    await shot(page, "02-pasajero-reserva", errors);
    // historial
    await page.goto(BASE + "/passenger/rides", { waitUntil: "networkidle" });
    await shot(page, "03-pasajero-historial", errors);
    results.push(["pasajero", page.url()]);
    await ctx.close();
  }

  // ────────── CONDUCTOR ──────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[conductor] ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`[conductor] ${m.text().slice(0, 140)}`));
    console.log("── CONDUCTOR (Pau Demo) ──");
    await login(page, USERS.conductor);
    console.log(`  ✓ login real → ${page.url()}`);
    await shot(page, "04-conductor-inicio", errors);
    await page.goto(BASE + "/driver/queue", { waitUntil: "networkidle" });
    await shot(page, "05-conductor-cola-fifo", errors);
    results.push(["conductor", page.url()]);
    await ctx.close();
  }

  // ────────── ADMIN ──────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[admin] ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`[admin] ${m.text().slice(0, 140)}`));
    console.log("── ADMIN (Admin Demo) ──");
    await login(page, USERS.admin);
    console.log(`  ✓ login real → ${page.url()}`);
    await shot(page, "06-admin-dashboard", errors);
    await page.goto(BASE + "/admin/operations", { waitUntil: "networkidle" });
    await shot(page, "07-admin-operaciones", errors);
    results.push(["admin", page.url()]);
    await ctx.close();
  }

  await browser.close();
  console.log("\n── RESULTADO ──");
  for (const [rol, url] of results) console.log(`  ${rol}: ${url}`);
  const relevantes = errors.filter((e) => !/favicon|map tile|forge|leaflet|401|Failed to load resource.*(png|jpg)/i.test(e));
  console.log(`\nErrores de consola relevantes: ${relevantes.length}`);
  relevantes.slice(0, 10).forEach((e) => console.log("  ⚠ " + e));
  process.exit(relevantes.length ? 1 : 0);
})().catch((e) => {
  console.error("FALLO:", e.message);
  process.exit(2);
});
