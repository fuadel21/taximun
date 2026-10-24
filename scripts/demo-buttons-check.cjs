/**
 * Verifica la HIGIENE de /auth tras VITE_DEMO_LOGIN=false:
 * los botones de acceso rápido demo NO deben existir y el login por
 * formulario debe funcionar con credenciales reales.
 * Uso: BASE_URL=https://taximun.vercel.app node scripts/demo-buttons-check.cjs
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));

  await page.goto(BASE + "/auth", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const body = await page.evaluate(() => document.body.innerText);
  const checks = [
    { name: "sin botón «Entrar como pasajero»", ok: !/Entrar como pasajero/.test(body) },
    { name: "sin botón «Entrar como conductor»", ok: !/Entrar como conductor/.test(body) },
    { name: "sin bloque «Solo para pruebas»", ok: !/Solo para pruebas/.test(body) },
    { name: "login por formulario presente", ok: Boolean(await page.locator('input[type="email"]').count()) },
  ];

  // el login real sigue funcionando
  await page.fill('input[type="email"]', "pasajero@taximun.app");
  await page.fill('input[type="password"]', "Taximun-Demo-2026");
  await page.click('button:has-text("Continuar")');
  let loginOk = false;
  try {
    await page.waitForURL(/\/passenger/, { timeout: 25000 });
    loginOk = true;
  } catch {
    loginOk = false;
  }
  checks.push({ name: "login por formulario lleva a /passenger", ok: loginOk });
  if (errores.length) checks.push({ name: "sin errores de página", ok: false });

  await browser.close();

  let fallo = false;
  for (const c of checks) {
    console.log(`${c.ok ? "✅" : "❌"} ${c.name}`);
    if (!c.ok) fallo = true;
  }
  errores.forEach((e) => console.log("  ⚠ " + e));
  console.log(fallo ? "\n=== HIGIENE FALLA ===" : "\n=== Higiene OK: producción sin botones demo ===");
  process.exit(fallo ? 1 : 0);
})();
