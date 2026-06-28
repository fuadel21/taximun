# Taximun - Tu Taxi Global - TODO

## Arquitectura y Base de Datos
- [x] Crear schema de base de datos (usuarios, conductores, pasajeros, taxis, servicios, colas, valoraciones)
- [x] Implementar migraciones de Drizzle ORM
- [x] Crear helpers de base de datos para consultas comunes

## Autenticación y Roles
- [x] Sistema de autenticación con tres roles: pasajero, conductor, administrador
- [x] Extender schema de usuarios con campos específicos por rol
- [x] Crear procedimientos protegidos por rol (pasajero, conductor, admin)
- [ ] Implementar lógica de asignación de rol en registro

## Componentes Base y Estructura
- [x] Crear sistema de internacionalización (i18n) con soporte ES/CA/EN
- [x] Implementar tema visual elegante y sofisticado
- [ ] Crear layouts base: pasajero, conductor, administrador
- [x] Configurar Tailwind CSS con paleta de colores refinada

## Mapa Interactivo y GPS
- [x] Integrar Leaflet con OpenStreetMap
- [x] Implementar geolocalización del pasajero
- [ ] Mostrar posición de taxis disponibles en tiempo real
- [ ] Crear sistema de geofencing para zonas de cola
- [ ] Implementar seguimiento en tiempo real de taxi asignado

## Sistema de Cola FIFO
- [ ] Crear tabla de colas con zona, conductor, posición y timestamp
- [ ] Implementar registro automático de conductor al entrar en zona
- [ ] Crear lógica de cálculo de posición en fila
- [ ] Implementar tiempo estimado de espera
- [ ] Crear procedimiento para asignar siguiente servicio de la cola

## Sistema de Reserva (2 Clics)
- [x] Crear interfaz de reserva con selección de origen y destino
- [ ] Implementar búsqueda automática del taxi más cercano
- [ ] Crear lógica de asignación automática
- [ ] Implementar confirmación de reserva
- [ ] Crear notificación al conductor

## Panel del Conductor
- [x] Mostrar servicios asignados pendientes
- [x] Implementar botones de aceptar/rechazar servicio
- [x] Crear selector de estado (disponible, ocupado, fuera de servicio)
- [x] Mostrar posición actual en la cola
- [ ] Implementar actualización de posición GPS en tiempo real
- [ ] Crear historial de servicios del día

## Panel del Pasajero
- [x] Crear interfaz de reserva en 2 clics
- [ ] Mostrar seguimiento en tiempo real del taxi
- [ ] Implementar historial de viajes
- [ ] Crear sistema de valoración de servicios (1-5 estrellas)
- [ ] Mostrar información del conductor (nombre, foto, calificación)

## Panel de Administración
- [x] Crear dashboard con estadísticas globales
- [x] Implementar mapa con todos los taxis activos
- [x] Crear tabla de gestión de usuarios (pasajeros y conductores)
- [x] Implementar gestión de flota (taxis, matrículas, estado)
- [x] Crear gráficos de servicios completados, ingresos, etc.
- [ ] Implementar filtros por fecha, zona y estado

## Soporte Multilingüe
- [ ] Configurar librería i18n (react-i18next o similar)
- [ ] Traducir todas las cadenas de texto a ES, CA, EN
- [ ] Implementar selector de idioma en interfaz
- [ ] Guardar preferencia de idioma en base de datos

## Diseño Responsive
- [ ] Validar breakpoints: móvil (<640px), tablet (640-1024px), escritorio (>1024px)
- [ ] Adaptar mapa para móvil
- [ ] Adaptar formularios para todos los tamaños
- [ ] Validar navegación en móvil
- [ ] Optimizar performance en dispositivos móviles

## Animaciones y Pulido
- [ ] Añadir transiciones elegantes entre pantallas
- [ ] Implementar animaciones de carga
- [ ] Crear feedback visual para interacciones
- [ ] Pulir detalles de interfaz
- [ ] Validar accesibilidad (WCAG 2.1)

## Testing
- [ ] Crear tests unitarios para procedimientos tRPC
- [ ] Crear tests para lógica de colas
- [ ] Crear tests para asignación de taxis
- [ ] Validar flujos de usuario principales

## Deployment
- [ ] Crear checkpoint final
- [ ] Validar en producción
- [ ] Documentar instrucciones de uso
