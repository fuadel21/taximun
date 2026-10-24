/** Valida contenido textual real de las páginas clave (sin depender de visión). */
const { chromium } = require(process.env.HOME + "/.tools/node_modules/playwright");
const BASE = "http://localhost:3000";

async function login(page, email) {
  await page.goto(BASE + "/auth", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "Taximun-Demo-2026");
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

(async () => {
  const browser = await chromium.launch();

  // CONDUCTOR — cola FIFO
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(page, "conductor@taximun.app");
    await page.goto(BASE + "/driver/queue", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, "\n");
    console.log("══ CONDUCTOR /driver/queue ══");
    console.log(text.slice(0, 1500));
  }

  // PASAJERO — inicio
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(page, "pasajero@taximun.app");
    await page.waitForTimeout(1500);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, "\n");
    console.log("\n══ PASAJERO /passenger ══");
    console.log(text.slice(0, 900));
  }

  // ADMIN — operaciones
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(page, "admin-demo@taximun.app");
    await page.goto(BASE + "/admin/operations", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, "\n");
    console.log("\n══ ADMIN /admin/operations ══");
    console.log(text.slice(0, 1200));
  }

  await browser.close();
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
