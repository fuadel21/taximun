// Validación UI Fase 3: tarjeta de cola del conductor + sección de colas del admin.
// Ejecutar con: playwright-cli run-code --filename scripts/ui-fase3-check.js
async page => {
  const out = [];
  await page.goto('http://localhost:3000/');
  await page.evaluate(async () => {
    await fetch('/api/trpc/auth.devLogin?batch=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ '0': { json: { role: 'driver', driverIndex: 4 } } }),
    });
  });
  await page.goto('http://localhost:3000/driver');
  await page.waitForSelector('text=Cola de zona', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent('body');
  out.push('POSICIÓN EN COLA: ' + ((bodyText.match(/#(\d)/) || [])[0] ?? 'sin posición'));
  out.push('ZONA AEROPUERTO VISIBLE: ' + (bodyText.includes('Aeroport T1') ? 'sí' : 'no'));
  out.push('ESPERA ESTIMADA VISIBLE: ' + (bodyText.includes('espera estimada') ? 'sí' : 'no'));
  await page.screenshot({ path: '/home/user/taximun-fase3-cola-conductor.png', fullPage: false });

  await page.evaluate(async () => {
    await fetch('/api/trpc/auth.devLogin?batch=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ '0': { json: { role: 'admin' } } }),
    });
  });
  await page.goto('http://localhost:3000/admin/operations');
  await page.waitForSelector('text=Colas FIFO por zona', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const hasBtn = await page.locator('button:has-text("Procesar reservas")').count();
  out.push('BOTÓN PROCESAR RESERVAS: ' + (hasBtn > 0 ? 'presente' : 'AUSENTE'));
  if (hasBtn > 0) {
    await page.click('button:has-text("Procesar reservas")');
    await page.waitForTimeout(1500);
    const badge = await page.locator('text=/Recordatorios/').count();
    out.push('RESULTADO DEL PROCESADO VISIBLE: ' + (badge > 0 ? 'sí' : 'no'));
  }
  await page.screenshot({ path: '/home/user/taximun-fase3-operaciones-admin.png', fullPage: false });
  return out;
}
