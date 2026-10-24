/**
 * Fase 6 — verificación local (recibo, telemetría de errores, legales).
 * Uso: BASE_URL=http://localhost:3000 node scripts/verify-phase6-local.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DEMO_PASSWORD = "Taximun-Demo-2026";
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

/** Login por formulario (los botones demo desaparecen en producción). */
async function login(page, email) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  const continuar = page.getByRole("button", { name: "Continuar" });
  if (await continuar.count()) {
    await continuar.click();
  } else {
    await page.getByRole("button", { name: "Crear cuenta" }).click();
  }
  await page.waitForURL(/passenger|driver|admin/, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch();
try {
  // ---------- 1. Legales (sin sesión) ----------
  const legal = await browser.newPage();
  await legal.goto(`${BASE}/legal/terminos`, { waitUntil: "networkidle" });
  check("Legal /legal/terminos carga", (await legal.textContent("h1"))?.includes("Términos y condiciones") === true);
  check("Legal términos: precio T3 mencionado", (await legal.content()).includes("tarifa T3"));
  await legal.click('button:has-text("Privacidad")');
  await legal.waitForURL(/privacidad/);
  check("Legal navegación a privacidad", (await legal.textContent("h1"))?.includes("Política de privacidad") === true);
  check("Legal privacidad: AEPD mencionada", (await legal.content()).includes("Agencia Española de Protección de Datos"));

  await legal.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  const footer = await legal.content();
  check("AuthReal: footer legal con enlaces", footer.includes("/legal/terminos") && footer.includes("/legal/privacidad"));
  await legal.close();

  // ---------- 2. Recibo del servicio (pasajero) ----------
  const pax = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(pax, "pasajero@taximun.app");
  await pax.goto(`${BASE}/passenger/rides`, { waitUntil: "networkidle" });
  await pax.waitForTimeout(2500);

  // seleccionar un viaje completado del historial (clic en la fila)
  const historyRow = pax.locator('button[aria-pressed]', { hasText: "Sagrada Família" }).first();
  check("Recibo: fila de historial seleccionable", (await historyRow.count()) > 0);
  await historyRow.dispatchEvent("click");
  await pax.waitForTimeout(1000);
  const receiptButton = pax.locator('button:text-is("Recibo")').first();
  check("Recibo: botón visible en viaje completado", (await receiptButton.count()) > 0);
  if (await receiptButton.count()) {
    await receiptButton.click();
    await pax.waitForTimeout(2500);
    const modal = await pax.textContent("body");
    check("Recibo: título Factura simplificada", modal.includes("Factura simplificada"));
    check("Recibo: licencia del conductor (1234-B)", modal.includes("1234-B"));
    check("Recibo: taxi TX-901 y matrícula", modal.includes("TX-901") && modal.includes("1122-AABB"));
    check("Recibo: origen y destino", modal.includes("Aeroport T1") && modal.includes("Sagrada Família"));
    check("Recibo: desglose (bajada de bandera + recorrido)", modal.includes("Bajada de bandera") && modal.includes("Recorrido"));
    check("Recibo: total 31,40 €", modal.includes("31,40"));
    check("Recibo: forma de pago (Efectivo)", modal.includes("Efectivo"));
    check("Recibo: botón Imprimir / PDF", modal.includes("Imprimir / PDF"));
    await pax.screenshot({ path: "../docs/validacion-navegador/fase6-recibo.png", fullPage: true });
    // cerrar modal
    await pax.locator('button[aria-label="Cerrar recibo"]').click();
    await pax.waitForTimeout(400);
    check("Recibo: modal se cierra", !(await pax.content()).includes("Factura simplificada"));
  }

  // ---------- 3. Telemetría de errores del navegador ----------
  await pax.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { message: "Error de prueba fase 6 — telemetría", error: new Error("Error de prueba fase 6 — telemetría") }));
  });
  // forzar flush (lote 10 o 4 s) + margen
  await pax.waitForTimeout(6500);
  check("Telemetría: error sintético disparado (sin romper la página)", (await pax.content()).length > 0);

  // admin ve el error en /admin/health
  const admin = await browser.newPage();
  await login(admin, "admin-demo@taximun.app");
  await admin.goto(`${BASE}/admin/health`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(3000);
  const healthBody = await admin.textContent("body");
  check("Telemetría: tarjeta de errores visible en /admin/health", healthBody.includes("Errores de navegador"));
  check("Telemetría: error de prueba aparece en el panel", healthBody.includes("Error de prueba fase 6"));
  // expandir stack y marcar resuelto
  const traza = admin.locator('summary:has-text("Traza")').first();
  if (await traza.count()) {
    await traza.click();
    await admin.waitForTimeout(400);
    check("Telemetría: traza del error visible", (await admin.content()).includes("Error: Error de prueba fase 6"));
  }
  const resolver = admin.locator('button:has-text("Marcar revisado")').first();
  if (await resolver.count()) {
    await resolver.click();
    await admin.waitForTimeout(1500);
    check("Telemetría: marcar como resuelto funciona", true);
  } else {
    check("Telemetría: marcar como resuelto funciona", false, "botón no encontrado");
  }
  await admin.screenshot({ path: "../docs/validacion-navegador/fase6-telemetria-admin.png", fullPage: true });
  await admin.close();
  await pax.close();
} catch (error) {
  console.error("💥 Error del arnés:", error.message);
  results.push({ name: "arnés completado sin excepción", ok: false, extra: error.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== Fase 6 local: ${results.length - failed.length}/${results.length} checks OK ===`);
process.exit(failed.length ? 1 : 0);
