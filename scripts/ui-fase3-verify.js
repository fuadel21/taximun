// Verificación DOM precisa de la tarjeta de cola (conductor) y sección de colas (admin).
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
  await page.waitForTimeout(1200);
  const card = await page.locator('section:has-text("Cola de zona")').first().textContent();
  out.push('TARJETA CONDUCTOR:');
  out.push('  título: ' + (card.includes('Cola de zona') ? 'OK' : 'FALTA'));
  out.push('  zona propia: ' + (card.includes('Aeroport T1') ? 'OK' : 'FALTA'));
  out.push('  turno propio (#1): ' + (card.includes('#1') ? 'OK' : 'FALTA'));
  out.push('  delante: ' + (card.includes('delante') ? 'OK' : 'FALTA'));
  out.push('  espera estimada: ' + (card.includes('espera estimada') ? 'OK' : 'FALTA'));
  out.push('  turno de cabeza: ' + (card.includes('Turno de Pau Serra') ? 'OK (Turno de Pau Serra)' : card.slice(0, 60)));
  out.push('  chips zonas: ' + (card.includes('Sants Estació') && card.includes('Port / Cruise') && card.includes('Centre') ? 'OK (5 zonas)' : 'FALTA'));
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
  const ops = await page.locator('main').textContent();
  out.push('PANEL ADMIN:');
  out.push('  sección colas: ' + (ops.includes('Colas FIFO por zona') ? 'OK' : 'FALTA'));
  out.push('  contador total: ' + (ops.includes('conductores en cola') ? 'OK' : 'FALTA'));
  out.push('  tarjeta aeropuerto: ' + (ops.includes('Aeroport T1') ? 'OK' : 'FALTA'));
  out.push('  cabeza aeropuerto: ' + (ops.includes('Pau Serra') ? 'OK' : 'FALTA'));
  out.push('  botón procesar reservas: ' + (await page.locator('button:has-text("Procesar reservas")').count() > 0 ? 'OK' : 'FALTA'));
  await page.click('button:has-text("Procesar reservas")');
  await page.waitForTimeout(1800);
  const ops2 = await page.locator('main').textContent();
  out.push('  badge resultado tras click: ' + (ops2.includes('Recordatorios') ? 'OK' : 'FALTA'));
  await page.screenshot({ path: '/home/user/taximun-fase3-operaciones-admin.png', fullPage: false });
  return out;
}
