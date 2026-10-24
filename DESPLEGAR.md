# 🚀 Desplegar Taximun con Supabase real

Esta guía lleva la app del **modo demo local** (datos en memoria) a **producción real**:
base de datos Supabase, usuarios reales y (opcionalmente) Stripe y hosting.

> Tiempo total estimado: **15–20 minutos**. Todo el plan es gratis (Supabase free tier,
> Railway/Render free tier, Stripe test mode).

---

## Paso 1 — Crear el proyecto Supabase (gratis)

1. Entra en **https://supabase.com** → *Start your project* → regístrate (GitHub o email).
2. **New project**:
   - Nombre: `taximun`
   - Database Password: **guárdala** (no la necesitarás para nada más, pero no la pierdas).
   - Region: **West EU (Frankfurt)** — la más cercana a España.
3. Espera 1–2 min a que provisione.

## Paso 2 — Habilitar la extensión pg_cron

Las migraciones programan dos jobs automáticos (procesar reservas cada 5 min y
sincronizar colas de zona cada 1 min). Necesitan la extensión **pg_cron**:

- Dashboard → **Database → Extensions** → busca `pg_cron` → **Enable**.

## Paso 3 — Aplicar todas las migraciones (un solo pegado)

Ya está generado el paquete completo: **`supabase/migration-bundle.sql`** (las 64
migraciones concatenadas y verificadas contra PostgreSQL 17 real).

1. Abre el archivo `supabase/migration-bundle.sql`, copia **todo** su contenido
   (son ~6.800 líneas).
2. En Supabase: **SQL Editor → New query** → pega → **Run**.
3. Espera el mensaje **«Success. No rows returned»** (unos segundos).
4. Verifica:

```sql
select count(*) from information_schema.tables where table_schema = 'public';
-- debe devolver 40
select * from public.queue_zones;   -- 5 zonas de Barcelona con cola FIFO
```

> Para regenerar el paquete tras añadir migraciones: `bash scripts/build-migration-bundle.sh`
> Para validar migraciones localmente sin tocar Supabase: `bash scripts/verify-migrations.sh`

## Paso 4 — Crear tu usuario administrador

1. En Supabase: **Authentication → Users → Add user** → email + contraseña
   (marca *Auto Confirm User*).
2. Conviértelo en admin (SQL Editor, cambia el email):

```sql
-- Rol admin en el JWT (lo que comprueban las políticas RLS)
update auth.users
   set app_metadata = coalesce(app_metadata, '{}'::jsonb) || '{"role": "admin"}'::jsonb
 where email = 'TU-EMAIL@EJEMPLO.com';

-- Perfil operativo de administración
insert into public.taxi_user_profiles (user_id, role, full_name)
values ((select id::text from auth.users where email = 'TU-EMAIL@EJEMPLO.com'),
        'admin', 'Equipo Taximun')
on conflict (user_id) do update set role = 'admin';
```

3. Cierra sesión y vuelve a entrar si ya te habías logueado (el JWT necesita
   refrescarse para llevar el rol).

## Paso 5 — Conectar la app

Crea `.env` en la raíz (plantilla en `.env.example`) con las claves de
**Settings → API** en Supabase:

```bash
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJ...        # «anon public»
SUPABASE_SERVICE_ROLE_KEY=eyJ... # «service_role» — SECRETA, solo servidor
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...    # la misma anon
```

Reinicia (`pnpm dev`) — el modo demo desaparece automáticamente y el login pasa
a ser el real de Supabase (email/contraseña). Los datos viven en tu proyecto.

Verifica que todo está conectado:

```bash
bash scripts/verify-supabase.sh   # API, tablas, zonas y RPC del proyecto real
```

### Alta de conductores en producción

1. El conductor se registra en la app → completa su perfil de conductor.
2. Sube los **5 documentos obligatorios**: identidad, permiso de conducir,
   licencia taxi, seguro e ITV.
3. Un admin los aprueba en el panel (`/admin`) — el sistema bloquea la
   aprobación si falta alguno.
4. El conductor abre turno y aparece en el mapa; si está en aeropuerto/Sants/
   puerto/centro, entra en la cola FIFO automáticamente (pg_cron, cada minuto).

## Paso 6 — Desplegar en internet (Railway o Render)

La app es un servidor Express que sirve el cliente compilado — cualquier
plataforma de Node vale. En **Railway** (recomendado, botón de GitHub):

| Ajuste | Valor |
|---|---|
| Build Command | `pnpm install && pnpm build` |
| Start Command | `pnpm start` |
| Variables | las 5 del Paso 5 + `NODE_ENV=production` |

En **Render** (Web Service, runtime Node): igual, con `npm i -g pnpm && pnpm install && pnpm build` como build si no detecta pnpm.

No hay migraciones que correr en el hosting: la base de datos ya vive en Supabase.

## Paso 7 — Stripe real (opcional)

Sin claves, los pagos con tarjeta funcionan en modo automático de demo
(autoriza/cobra sin cobrar de verdad). Para cobrar de verdad:

1. Cuenta en **https://dashboard.stripe.com** (empieza en *test mode*).
2. Añade a `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. Pagos de prueba con tarjeta `4242 4242 4242 4242`.

Los pagos en efectivo no requieren Stripe. El ciclo Connect (ingresos del
conductor) se activa al configurar una cuenta Connect en el dashboard de Stripe.

---

## Checklist final

- [ ] Proyecto Supabase creado (región Frankfurt)
- [ ] pg_cron habilitado
- [ ] `migration-bundle.sql` ejecutado sin errores
- [ ] Usuario admin creado + SQL de rol admin aplicado
- [ ] `.env` con las 5 variables y app conectada (login real)
- [ ] (Opcional) Hosting en Railway/Render
- [ ] (Opcional) Stripe en test mode

## Publicar en Vercel

El repo ya está listo (`vercel.json` + funciones en `api/`). Al hacer push a
`main` Vercel reconstruye solo.

**Variables de entorno del proyecto en Vercel** (Settings → Environment
Variables, para Production y Preview):

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | clave «anon» pública |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` (secreta) |
| `VITE_SUPABASE_URL` | la misma `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | la misma clave «anon» |
| `ADMIN_EMAILS` | correos admin separados por comas |
| `JWT_SECRET` | un UUID cualquiera |

**Cómo funciona `/api/trpc` en Vercel**: el handler se empaqueta a un único
CJS autocontenido (`dist/api-trpc.cjs`) durante `pnpm build`
(`scripts/build-serverless.mjs`). No lo toques: con `"type": "module"` en
package.json, compilar los fuentes TS directamente como ESM rompe los imports
sin extensión (ERR_MODULE_NOT_FOUND).

**Botones de acceso demo**: en `/auth` hay botones para entrar con
`pasajero@taximun.app` y `conductor@taximun.app`. Se quitan definiendo
`VITE_DEMO_LOGIN=false` y redesplegando (hazlo antes de un lanzamiento real).

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| «relation does not exist» | El bundle no se ejecutó entero — repite el Paso 3 |
| El admin ve «Centro reservado a administración» | Falta el `update auth.users ... app_metadata` o no reiniciaste sesión |
| Las colas están vacías | El conductor no está «available» en la zona exacta («Aeroport T1», «Sants Estació»…) o pg_cron está deshabilitado |
| Las reservas no se activan | pg_cron deshabilitado — el job corre cada 5 min, espera o fuerza con el botón «Procesar reservas» del panel |
| Login no funciona en el hosting | Faltan las variables `VITE_SUPABASE_*` en el build |
| `/api/trpc/*` devuelve el HTML de la SPA o 405 | El rewrite SPA está tragándose `/api` — el `vercel.json` debe excluir `/api` del fallback (`/((?!api/).*)`) |
| `FUNCTION_INVOCATION_FAILED` en Vercel | La función no se empaquetó: ejecuta `pnpm build` y comprueba que existe `dist/api-trpc.cjs` |

## Fase 5 · Tarifas oficiales AMB y mapa OSM (2026-10-24)

- **Motor de tarifas** (`server/barcelona-tariff.ts`): tarifa metropolitana oficial con T1/T2 por tramo horario (Europa/Madrid, sábados y festivos → T2), suplementos geolocalizados (aeropuerto, Moll Adossat, Fira y Sants por origen, vehículo 5-8 plazas, noches especiales), mínimos (aeropuerto 21 €, app 8 €), tope de suplementos 17,10 € y T4 fijo 45 € aeropuerto↔puerto. Todos los importes editables en `/admin/tariffs` (tabla `taxi_tariff_config`, migración `20261024020000`); si la tabla falta, se usan los valores oficiales por defecto.
- **Precio cerrado por adelantado**: el quote usa la ruta real del cliente (OSRM) acotada por el servidor; sin ruta estima recta×1,28. Promociones intactas.
- **Mapa en la reserva** (`/passenger/book`): Leaflet + tiles OSM, origen por geolocalización (respaldo Plaça Catalunya), búsqueda Nominatim, destino con toque/arrastre, ruta dibujada y precio por categoría antes de confirmar. Sin claves de API (Nominatim/OSRM/OSM públicos).
- Servicios geo: `client/src/lib/osm-services.ts`; selector: `client/src/components/RideMapPicker.tsx`.
- Verificación local: `node scripts/verify-phase5-local.mjs` (con dev server arriba; ajustar ruta de playwright según instalación).

### Mapa de cola FIFO del conductor (2026-10-24)

- `/driver` incluye `DriverQueueMap`: mapa Leaflet/OSM con los círculos oficiales de las 5 zonas de cola (Aeroport T1/T2, Sants, Port/Cruise, Centre), los taxis en cola como marcadores 🚕 con su número de turno y tu posición GPS resaltada en cian. Se actualiza en vivo cada 6 s (`getZoneQueue` ahora devuelve geometría de zona, GPS de los miembros y `myPositionCoords`).

### Editor visual de zonas con suplemento (2026-10-24)

- Las zonas que activan los suplementos oficiales viven en `taxi_tariff_zones` (migración `20261024030000`) y se editan en `/admin/tariffs` sobre mapa OSM: círculo por suplemento (color), centro arrastrable o al toque, radio, aplica en origen/destino/ambos, alta y baja de zonas. El motor las lee con caché de 60 s (invalidada al guardar); si la tabla falta, usa las oficiales por defecto (`DEFAULT_TARIFF_ZONES`).

### Mini-mapa en la oferta del conductor (2026-10-24)

- Cada tarjeta de solicitud en `/driver/queue` incluye `RideOfferMiniMap`: mapa OSM con tu posición 🚕, punto de recogida, destino, ruta de aproximación (OSRM) con ETA ("Llegada al punto: X min · Y km") y ruta del viaje en trazo suave. `getPendingRides` ya traía coordenadas (select completo de `taxi_rides`); `getStatus` aporta el GPS del conductor.

### Tarifa T3 oficial de precio cerrado por app (2026-10-24)

- El motor usa ahora la **T3 del anexo IMET 2026**: bandera 4,1117 € + 1,1148 €/km + 0,2832 €/min (tráfico real) en diurna; 4,4321 € + 1,4710 €/km + 0,2226 €/min en nocturna/sábado/festivo. Solo los suplementos contemplados en T3 (aeropuerto, vehículo 5-8 plazas, noches especiales 4,60 €), redondeo a múltiplos de 0,05 €, mínimo 8 €, aeropuerto 21 € y T4 aeropuerto↔Moll Adossat 46,00 € fijos.
- `/admin/tariffs` permite conmutar entre **T3 (oficial para apps)** y T1/T2 (taxímetro) y editar todos los importes T3 (migración `20261024040000`).
- La reserva muestra el desglose con la línea «Tiempo con tráfico · X min × Y €» y la etiqueta del tramo T3 aplicado.

### Ajustes, flecha atrás y cierre de sesión (2026-10-24)

- Nueva `HomeTopBar` fija en las homes de pasajero, conductor y admin: marca + botón ⚙ Ajustes (→ perfil) o salida directa en admin.
- «Cerrar sesión» al final del perfil (`TaxiProfileSettings`, pasajero y conductor) con `logoutAndRedirect()` (`client/src/lib/logout.ts`): signOut + limpieza de storage + /auth.
- El dock de notificaciones baja a `top-[4.5rem]` para no tapar el botón de ajustes en móvil (bug real detectado por el arnés).

## Fase 6 · Endurecimiento para producción (2026-10-24)

### Higiene y entorno

- `VITE_DEMO_LOGIN=false` en Vercel (production/preview/development): tras el deploy, los botones de acceso rápido demo desaparecen de `/auth` y solo queda el login por formulario. En local sigue funcionando con `.env` propio (`VITE_DEMO_LOGIN=true`) para los arneses Playwright.
- Los tokens de servicio usados durante el desarrollo (Vercel PAT, GitHub PAT, Supabase) deben **revocarse al cerrar la fase**.

### CI (GitHub Actions)

- `.github/workflows/ci.yml`: en cada push/PR a `main`, pnpm 10 + Node 20, `tsc --noEmit`, `pnpm build` y artefacto `dist/`. **Pendiente de subir**: el PAT usado no tiene scope `workflow` (GitHub lo exige para crear archivos en `.github/workflows`). El archivo está listo en el workspace; cuando haya un token con ese scope (o se suba a mano desde la web de GitHub), el CI arrancará en el siguiente push.

### Telemetría de errores del navegador

- Migración `20261024050000`: tabla `client_error_logs` (message, stack, source_url, user_agent, open_id, resolved) con RLS.
- `client/src/lib/error-telemetry.ts` se monta en `main.tsx`: captura `window.onerror` + `unhandledrejection`, deduplica, agrupa en lotes de 10 (flush 4 s) y envía con `system.taxiSystemHealth.logClientError` **solo si hay sesión iniciada** (Bearer). No hay bucle: los fallos del propio envío se descartan.
- Panel: `/admin/health` incluye `AdminClientErrorsCard` (últimos 30 errores, marcar resuelto, ver stack).

### Recibo del servicio (regla 22 IMET)

- `system.taxiPassengerTracking.getRideReceipt` (pasajero propietario o admin): ride completo + perfil del conductor (nombre, nº de licencia, código de taxi, matrícula).
- En `/passenger/rides`, los viajes **completados** muestran el botón «Recibo»: modal imprimible con nº de servicio, fecha/hora, origen/destino, tarifa aplicada, desglose completo (bandera, km, tiempo con tráfico, suplementos, cargo de servicio, descuentos), total, forma de pago, conductor, taxi y licencia. «Imprimir / PDF» usa `window.print()` con CSS `@media print` que aísla el recibo.

### Legales

- Páginas públicas `/legal/terminos` y `/legal/privacidad` (versión preliminar, español), enlazadas desde el pie de `/auth`. Marcar «versión preliminar» hasta revisión legal profesional.

### Abstracción de infraestructura geográfica

- `client/src/lib/map-config.ts` centraliza tiles, geocodificación y rutas. Variables: `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION`, `VITE_GEOCODING_BASE_URL`, `VITE_ROUTING_BASE_URL` (todas opcionales; por defecto los servicios públicos de OSM). Cambiar de proveedor comercial = definir las variables, sin tocar componentes.
- Consumidores migrados: `RideMapPicker`, `PassengerTripTrackingMap`, `DriverQueueMap`, `AdminTariffZonesCard`, `RideOfferMiniMap`, `TaxiMap`, `AdminOperationsCenterPage` y `osm-services.ts`.
