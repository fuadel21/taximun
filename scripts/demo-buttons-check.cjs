/** Verifica los botones de acceso rápido demo en /auth (modo real Supabase). */
const { chromium } = require(process.env.HOME + "/.tools/node_modules/playwright");
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const out = [];

  for (const cuenta of [
    { boton: /Entrar como pasajero/, espera: /\/passenger/ },
    { boton: /Entrar como conductor/, espera: /\/driver/ },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/auth", { waitUntil: "networkidle" });
    // limpiar sesión previa del contexto nuevo (no hace falta, contexto limpio)
    await page.getByRole("button", { name: cuenta.boton }).click();
    await page.waitForURL((u) => cuenta.espera.test(u.pathname), { timeout: 25000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const texto = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, "\n");
    out.push({ url: page.url(), errores, texto: texto.slice(0, 350) });
    await ctx.close();
  }

  await browser.close();
  let fallo = false;
  for (const r of out) {
    console.log(`→ ${r.url} · errores: ${r.errores.length}`);
    if (r.errores.length) { fallo = true; r.errores.forEach((e) => console.log("  ⚠ " + e)); }
    console.log(r.texto.split("\n").slice(0, 6).join(" | "));
    console.log("");
  }
  process.exit(fallo ? 1 : 0);
})().catch((e) => { console.error("FALLO:", e.message); process.exit(2); });
