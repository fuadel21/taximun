# Ride communication v3

Este bloque refuerza el chat de viaje ya existente sin crear un sistema paralelo.

## Incluye

- Notificaciones y push al otro participante.
- Mensajes rápidos separados por rol.
- Conteo de mensajes no leídos.
- Límite de 200 mensajes por conversación.
- Validación estricta de viaje activo y participantes.
- Rutas directas a pasajero y conductor desde la notificación.

No requiere SQL nuevo porque reutiliza `taxi_trip_messages` y `taxi_notifications`.
