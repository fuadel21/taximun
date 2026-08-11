# Taximun

Taximun es una plataforma profesional de taxi con enfoque **Barcelona-first** y arquitectura preparada para crecer por ciudades. La meta es competir en experiencia con apps tipo Uber/Cabify, pero orientada a taxis y operadores locales: pasajero, conductor y administración en un mismo sistema.

## Estado actual

La aplicación ya tiene tres superficies principales:

- **Pasajero**: pedir taxi, ver viaje activo, cancelar, historial, PIN de recogida, seguridad y perfil.
- **Conductor**: abrir/cerrar turno, actualizar zona, aceptar/rechazar solicitudes, iniciar/finalizar viaje, métricas e historial.
- **Admin**: panel de control, seguridad, alertas e incidencias.

El flujo operativo moderno vive en `system.taxiOps` y usa Supabase para datos reales de servicios, estados de conductor y actividad.

## Stack

- Frontend: React, Vite, Tailwind, shadcn/ui, Wouter.
- Backend: Express + tRPC.
- Datos: Supabase para operaciones en tiempo real y Drizzle/MySQL para la capa legacy/base.
- Mapas: Leaflet + OpenStreetMap.
- Autenticación: Supabase Auth con sincronización de usuario en backend.

## Variables de entorno

Frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Backend:

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
JWT_SECRET=
ADMIN_EMAILS=
OWNER_OPEN_ID=
OAUTH_SERVER_URL=
VITE_APP_ID=
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
```

`STRIPE_SECRET_KEY` permanece solo en el servidor. `STRIPE_PUBLISHABLE_KEY` se entrega al navegador únicamente cuando un pasajero necesita autorizar una tarjeta con Stripe.js.

## Comandos

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

Para migraciones legacy con Drizzle:

```bash
pnpm db:push
```

## Base Supabase del taxi

La migración principal está en:

```bash
supabase/migrations/20260708090000_taximun_taxi_core.sql
```

Incluye:

- `taxi_rides`: solicitudes, asignación de conductor, estado del viaje, estimación, origen/destino y tiempos.
- `driver_live_status`: turno del conductor, zona, taxi, matrícula, ubicación, rating y ganancias.
- `taxi_activity_logs`: trazabilidad de acciones de pasajero, conductor, admin y sistema.
- `taxi_driver_documents`: documentación para validar conductor/taxi antes de operar.
- Índices para viajes pendientes, búsquedas por pasajero/conductor, zonas y ubicación.
- RLS para separar pasajero, conductor y administración.

Para ejecutarla manualmente en Supabase SQL Editor, copia todo el contenido del archivo y ejecútalo con un usuario owner/service role. Después revisa que las tablas tengan RLS activo y que el backend tenga `SUPABASE_SERVICE_ROLE_KEY` configurada.

## Piloto Barcelona

El primer mercado está definido en `shared/constants.ts` dentro de `TAXIMUN_MARKETS.barcelona`:

- Ciudad, país, moneda y zona horaria.
- Zonas calientes: Eixample, Sants, Aeropuerto T1/T2, Port/Cruise y Gràcia.
- Lugares rápidos: Casa, Sants, Aeropuerto y Fira.
- Servicios: Taxi, Eco y Grupo.
- Aviso de cumplimiento: el precio mostrado es estimado y la operación real debe respetar taxímetro, normativa local y verificación de licencia.

## Roadmap de producción

### Fase 1 — Base profesional Barcelona

- [x] Configuración de mercado Barcelona.
- [x] Experiencia pasajero con zonas, presets y servicios.
- [x] Consola conductor con zona operativa y estado de turno.
- [x] Crear tablas Supabase base para `taxi_rides`, `driver_live_status`, `taxi_activity_logs` y documentación de conductor.
- [x] Añadir RLS base e índices operativos.
- [ ] Tests de permisos y flujos completos pasajero-conductor-admin.

### Fase 2 — Operativa real

- [ ] Matching por distancia, zona y disponibilidad.
- [ ] Cola por zonas críticas: aeropuerto, Sants, puerto y centro.
- [ ] Chat pasajero-conductor.
- [ ] Llamada enmascarada o contacto seguro.
- [ ] Sistema de incidencias con trazabilidad admin.

### Fase 3 — Negocio y cumplimiento

- [ ] Verificación de conductores y documentación.
- [ ] Facturas/recibos.
- [ ] Pagos con tarjeta, efectivo y wallet.
- [ ] Liquidaciones a conductores.
- [ ] Panel de métricas por ciudad, zona, demanda y cancelaciones.

### Fase 4 — Expansión mundial

- [ ] Extraer configuración multi-ciudad/multi-país.
- [ ] Tarifas por mercado.
- [ ] Idiomas y moneda por mercado.
- [ ] Integraciones locales de mapas, pagos y soporte.
- [ ] Panel multi-operador para flotas/licencias.

## Próximo bloque recomendado

El siguiente PR debería conectar esta base con matching real: función RPC para buscar conductores disponibles por distancia/zona, cola por aeropuerto/Sants/puerto y validaciones para que un conductor no pueda aceptar dos viajes al mismo tiempo.
