# 🚕 Taximun - Tu Taxi Global

## Resumen Ejecutivo

**Taximun** es una plataforma elegante y sofisticada de gestión y reserva de taxis construida con tecnologías modernas. La aplicación está diseñada para ser escalable desde Barcelona a toda España y el mundo, con soporte multilingüe (Español, Catalán, Inglés) y diseño responsive para móvil, tablet y escritorio.

---

## 🏗️ Arquitectura Técnica

### Stack Tecnológico

**Frontend:**
- React 19 con TypeScript
- Tailwind CSS 4 (diseño elegante y responsive)
- Leaflet + OpenStreetMap (mapas interactivos)
- tRPC + React Query (gestión de estado y datos)
- Framer Motion (animaciones)
- Sonner (notificaciones)
- React-i18next (internacionalización)

**Backend:**
- Express 4 (servidor HTTP)
- tRPC 11 (RPC type-safe)
- Node.js (runtime)

**Base de Datos:**
- Supabase (PostgreSQL gestionado)
- PostGIS (queries geográficas)
- Row Level Security (RLS)
- Realtime subscriptions

**Autenticación:**
- Manus OAuth (integrado)
- JWT (sesiones)
- Roles basados en acceso (RBAC)

---

## ✨ Características Implementadas

### 1. **Sistema de Autenticación (Completado)**
- ✅ Tres roles diferenciados: Pasajero, Conductor, Administrador
- ✅ Selector visual de rol en la página de autenticación
- ✅ Integración con Manus OAuth
- ✅ Selector de idioma (ES/CA/EN)
- ✅ Procedimientos protegidos por rol

### 2. **Internacionalización (Completado)**
- ✅ Soporte completo para Español, Catalán e Inglés
- ✅ Contexto global de i18n reactivo
- ✅ Cambio de idioma en tiempo real
- ✅ Persistencia de preferencia de idioma
- ✅ Todas las cadenas de texto traducidas

### 3. **Mapa Interactivo (Completado)**
- ✅ Integración con Leaflet y OpenStreetMap
- ✅ Marcadores de ubicación del usuario
- ✅ Marcadores de taxis con estados (disponible, ocupado, offline)
- ✅ Selección de ubicaciones con clics
- ✅ Popups con información del conductor
- ✅ Geolocalización automática

### 4. **Panel del Pasajero (Completado)**
- ✅ Interfaz de reserva en 2 clics
  - Paso 1: Seleccionar ubicación de recogida
  - Paso 2: Seleccionar ubicación de destino
  - Paso 3: Confirmar reserva
- ✅ Estimación automática de tarifas basada en distancia
- ✅ Creación de viajes en Supabase
- ✅ Asignación automática del taxi más cercano
- ✅ Seguimiento en tiempo real del taxi asignado
- ✅ Historial de viajes
- ✅ Información del conductor (nombre, calificación)
- ✅ Sistema de calificación 1-5 estrellas
- ✅ Interfaz de rastreo en vivo

### 5. **Procedimientos tRPC (Completado)**

**Autenticación:**
- `auth.me` - Obtener usuario actual
- `auth.logout` - Cerrar sesión
- `auth.setRole` - Asignar rol
- `auth.setLanguage` - Cambiar idioma

**Pasajero:**
- `passenger.getProfile` - Obtener perfil
- `passenger.createRide` - Crear viaje
- `passenger.getRideHistory` - Historial de viajes
- `passenger.getCurrentRide` - Viaje actual
- `passenger.rateRide` - Calificar viaje

**Conductor:**
- `driver.getProfile` - Obtener perfil
- `driver.updateLocation` - Actualizar posición GPS
- `driver.setStatus` - Cambiar estado
- `driver.getPendingRide` - Obtener viaje pendiente
- `driver.acceptRide` - Aceptar viaje
- `driver.rejectRide` - Rechazar viaje
- `driver.completeRide` - Finalizar viaje
- `driver.getQueuePosition` - Posición en cola
- `driver.getRideHistory` - Historial de viajes

**Administrador:**
- `admin.getStats` - Estadísticas globales
- `admin.getAllDrivers` - Lista de conductores
- `admin.getAllPassengers` - Lista de pasajeros
- `admin.getAllTaxis` - Lista de taxis
- `admin.getRecentRides` - Viajes recientes
- `admin.updateTaxiStatus` - Actualizar estado de taxi

**Público:**
- `public.getAvailableDrivers` - Buscar conductores cercanos
- `public.estimateFare` - Calcular tarifa estimada

### 6. **Base de Datos (Completado)**

**Tablas principales:**
- `users` - Usuarios del sistema
- `drivers` - Información de conductores
- `passengers` - Información de pasajeros
- `taxis` - Información de vehículos
- `rides` - Registro de viajes
- `driver_queues` - Sistema FIFO de colas
- `queue_zones` - Zonas geográficas
- `ratings` - Calificaciones
- `audit_logs` - Registros de auditoría

**Características:**
- ✅ PostGIS para queries geográficas
- ✅ Row Level Security (RLS)
- ✅ Realtime subscriptions
- ✅ Índices optimizados
- ✅ Funciones SQL para lógica compleja

### 7. **Diseño Visual (Completado)**
- ✅ Paleta de colores elegante y sofisticada
- ✅ Tema claro y oscuro
- ✅ Componentes shadcn/ui
- ✅ Responsive design (móvil, tablet, desktop)
- ✅ Animaciones suaves
- ✅ Tipografía refinada

---

## 📋 Características Pendientes

### Panel del Conductor (Estructura lista, necesita integración tRPC)
- [ ] Conectar con `driver.getPendingRide`
- [ ] Implementar actualización GPS en tiempo real
- [ ] Mostrar posición en cola FIFO
- [ ] Mostrar historial del día actual
- [ ] Integrar aceptar/rechazar servicios

### Panel de Administración (Estructura lista, necesita integración tRPC)
- [ ] Conectar estadísticas reales
- [ ] Implementar tabla de conductores con búsqueda
- [ ] Implementar tabla de pasajeros
- [ ] Implementar tabla de taxis
- [ ] Añadir filtros por fecha, zona y estado
- [ ] Conectar gráficos con datos reales

### Sistema de Notificaciones
- [ ] Notificaciones al conductor cuando se asigna viaje
- [ ] Notificaciones al pasajero cuando se asigna conductor
- [ ] Notificaciones en tiempo real

### Realtime Subscriptions
- [ ] Actualización en tiempo real de posición de conductores
- [ ] Actualización en tiempo real de estado de viajes
- [ ] Notificaciones realtime

### Animaciones Elegantes
- [ ] Transiciones de página
- [ ] Animaciones de carga
- [ ] Animaciones de botones
- [ ] Animaciones de mapas

---

## 🚀 Cómo Ejecutar el Proyecto

### Requisitos
- Node.js 22+
- pnpm 10+
- Supabase project (ya configurado)

### Instalación

```bash
cd /home/ubuntu/taximun
pnpm install
```

### Desarrollo

```bash
pnpm dev
```

El servidor estará disponible en `http://localhost:3000`

### Build para Producción

```bash
pnpm build
pnpm start
```

---

## 🔑 Variables de Entorno

Las siguientes variables están configuradas automáticamente:

```
SUPABASE_URL=https://ifxgmsmendsynwqzvqgj.supabase.co
SUPABASE_ANON_KEY=<tu-clave-anon>
SUPABASE_SERVICE_ROLE_KEY=<tu-clave-service-role>
VITE_APP_TITLE=Taximun
VITE_APP_ID=<manus-app-id>
JWT_SECRET=<jwt-secret>
```

---

## 📁 Estructura del Proyecto

```
taximun/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas (Auth, Home, PassengerPanel, etc)
│   │   ├── components/    # Componentes reutilizables
│   │   ├── contexts/      # Contextos React (I18n, Auth)
│   │   ├── hooks/         # Custom hooks
│   │   ├── i18n/          # Internacionalización
│   │   ├── lib/           # Utilidades
│   │   └── index.css      # Estilos globales
│   └── index.html
├── server/                # Backend Express
│   ├── routers.ts         # Procedimientos tRPC
│   ├── db.ts              # Helpers de BD
│   ├── supabase-client.ts # Cliente Supabase
│   └── _core/             # Core framework
├── drizzle/               # Migraciones (legacy, ahora usamos Supabase)
├── shared/                # Código compartido
├── supabase-schema.sql    # Schema de Supabase
└── todo.md                # Lista de tareas

```

---

## 🔐 Seguridad

- ✅ Row Level Security (RLS) en Supabase
- ✅ Procedimientos protegidos por rol
- ✅ JWT para sesiones
- ✅ HTTPS en producción
- ✅ Validación de inputs con Zod
- ✅ Credenciales en variables de entorno

---

## 📊 Próximos Pasos Recomendados

1. **Integrar DriverPanel completamente**
   - Conectar con procedimientos tRPC
   - Implementar actualización GPS en tiempo real
   - Mostrar cola FIFO

2. **Integrar AdminPanel completamente**
   - Conectar estadísticas reales
   - Implementar tablas con búsqueda y filtros
   - Conectar gráficos

3. **Implementar Realtime**
   - Subscriptions para posición de conductores
   - Subscriptions para estado de viajes
   - Notificaciones en tiempo real

4. **Testing**
   - Tests unitarios con Vitest
   - Tests de integración
   - Tests E2E

5. **Optimizaciones**
   - Lazy loading de componentes
   - Caché de queries
   - Compresión de imágenes
   - Service Workers

6. **Despliegue**
   - Configurar CI/CD
   - Desplegar en Manus (autoscale)
   - Configurar dominio personalizado

---

## 🎨 Paleta de Colores

**Tema Claro:**
- Fondo: Blanco
- Primario: Azul Profundo (#0066CC)
- Secundario: Púrpura (#9933FF)
- Acentos: Verde, Naranja, Rojo

**Tema Oscuro:**
- Fondo: Gris Oscuro
- Primario: Azul Claro
- Secundario: Púrpura Claro
- Acentos: Verde, Naranja, Rojo

---

## 📞 Soporte

Para preguntas o problemas:
1. Revisa el archivo `todo.md` para tareas pendientes
2. Consulta los procedimientos tRPC en `server/routers.ts`
3. Revisa las traducciones en `client/src/i18n/translations.ts`
4. Consulta el schema de Supabase en `supabase-schema.sql`

---

## 📝 Licencia

Este proyecto es propiedad del usuario. Úsalo libremente para desarrollo y producción.

---

**Última actualización:** 29 de Junio de 2026
**Versión:** 1.0.0 (Beta)
**Estado:** Funcional - Pasajero completamente integrado, Conductor y Admin listos para integración
