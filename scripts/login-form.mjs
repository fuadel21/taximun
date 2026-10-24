/**
 * Login por formulario reutilizable para los arneses Playwright.
 * (Los botones demo desaparecen en producción con VITE_DEMO_LOGIN=false.)
 */
export const DEMO_PASSWORD = "Taximun-Demo-2026";

export async function loginForm(page, base, email, password = DEMO_PASSWORD) {
  await page.goto(`${base}/auth`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Continuar")');
  await page.waitForURL(/passenger|driver|admin/, { timeout: 20000 });
  await page.waitForTimeout(800);
}
