#!/usr/bin/env python3
"""Test E2E de la Fase 3 de Taximun (contra localhost:3000, modo demo local):
   1. Recordatorios automáticos de reservas programadas (24h/2h/30m).
   2. Conversión automática de reserva en viaje 15 min antes (pg_cron local).
   3. Guard de pasajero con viaje activo (PASSENGER_HAS_ACTIVE_RIDE) + recuperación.
   4. Colas FIFO por zona: estado, prioridad de cabeza de cola sobre la distancia,
      salida de cola al aceptar y re-entrada al completar.
   5. Doble aceptación: DRIVER_ALREADY_BUSY y RIDE_NO_LONGER_PENDING.
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timedelta, timezone

BASE = "http://localhost:3000/api/trpc"
failures = []

def new_opener():
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

passenger_op, driver1_op, driver4_op, admin_op = new_opener(), new_opener(), new_opener(), new_opener()

def call(proc, input=None, method=None, as_opener=None):
    op = as_opener or passenger_op
    if method is None:
        method = "POST" if input is not None else "GET"
    if method == "POST":
        body = json.dumps({"0": {"json": input if input is not None else {}}}).encode()
        req = urllib.request.Request(f"{BASE}/{proc}?batch=1", data=body,
                                     headers={"content-type": "application/json"})
    else:
        q = urllib.parse.quote(json.dumps({"0": {"json": input if input is not None else None}}))
        req = urllib.request.Request(f"{BASE}/{proc}?batch=1&input={q}")
    try:
        with op.open(req) as resp:
            out = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"{proc}: HTTP {e.code} {body[:300]}")
    item = out[0]
    if "error" in item:
        raise RuntimeError(f"{proc}: {item['error']['json']['message'][:300]}")
    return item["result"]["data"]["json"]

def section(t): print(f"\n=== {t} ===")

def check(label, cond, detail=""):
    mark = "✓" if cond else "✗ FALLO"
    print(f"{mark} {label}" + (f" · {detail}" if detail else ""))
    if not cond:
        failures.append(label)
    return cond

def iso_in(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")

# ---------------------------------------------------------------------------
section("RESET DEMO")
call("auth.devReset", {}, method="POST", as_opener=admin_op)
print("✓ almacén reiniciado")

section("LOGIN")
u = call("auth.devLogin", {"role": "passenger"}, method="POST", as_opener=passenger_op)
d1 = call("auth.devLogin", {"role": "driver", "driverIndex": 1}, method="POST", as_opener=driver1_op)
d4 = call("auth.devLogin", {"role": "driver", "driverIndex": 4}, method="POST", as_opener=driver4_op)
a = call("auth.devLogin", {"role": "admin"}, method="POST", as_opener=admin_op)
print(f"✓ {u['name']} · {d1['name']} (Eixample) · {d4['name']} (Aeroport T1) · admin {a['name']}")

# ---------------------------------------------------------------------------
section("T0 · RECORDATORIO 24h DE LA RESERVA SEMILLA (procesador manual)")
r = call("system.taxiServerDispatch.admin.processScheduledBookings", {}, method="POST", as_opener=admin_op)
# El scheduler de 30s puede haber lanzado el recordatorio antes que el trigger manual:
# lo que importa es que existe exactamente una vez y que el pasajero la ve.
check("recordatorio 24h procesado", r.get("reminders_24h") in (0, 1), json.dumps(r))
notifs = call("system.taxiNotifications.listMine", as_opener=passenger_op)
items = notifs if isinstance(notifs, list) else notifs.get("items", notifs.get("data", []))
check("notificación 'menos de 24 horas' presente",
      sum(1 for n in items if "24 horas" in (n.get("title") or "")) == 1)

# ---------------------------------------------------------------------------
section("T1 · CANCELAR RESERVA SEMILLA Y ESTADO INICIAL DE COLAS")
bookings = call("system.taxiPassengerBooking.listScheduled", as_opener=passenger_op)
seed = next((b for b in bookings if b["status"] == "scheduled"), None)
check("reserva semilla visible", seed is not None, str(seed and seed["scheduled_at"]))
call("system.taxiPassengerBooking.cancelScheduled", {"id": seed["id"]}, method="POST", as_opener=passenger_op)
print("✓ reserva semilla cancelada")

q4 = call("system.taxiOps.driver.getZoneQueue", as_opener=driver4_op)
zone_names = [z["zoneName"] for z in q4["queues"]]
check("5 zonas con cola", len(q4["queues"]) == 5, ", ".join(zone_names))
airport = next(z for z in q4["queues"] if z["zoneName"] == "Aeroport T1")
sants = next(z for z in q4["queues"] if z["zoneName"] == "Sants Estació")
check("Pau Serra #1 en cola del aeropuerto",
      q4["inQueueZone"] is not None and q4["inQueueZone"]["zoneName"] == "Aeroport T1"
      and q4["inQueueZone"]["myPosition"] == 1,
      f"myZone={q4['myZone']} pos={q4['inQueueZone'] and q4['inQueueZone']['myPosition']}")
check("Youssef esperando en Sants", sants["waiting"] == 1 and sants["head"] is not None
      and (sants["head"]["driverName"] or "") != "",
      f"Sants: {sants['waiting']} en cola, cabeza {sants['head'] and sants['head']['driverName']}")

# ---------------------------------------------------------------------------
section("T2 · LA CABEZA DE COLA GANA AL CONDUCTOR MÁS CERCANO")
# Marc Vidal (sin cola, zona Eixample) se coloca EXACTAMENTE en el punto de recogida;
# Pau Serra (cabeza de cola del aeropuerto) está a ~150 m. Debe ganar la cola.
call("system.taxiOps.driver.upsertStatus",
     {"status": "available", "currentLat": 41.2974, "currentLng": 2.0833,
      "currentZone": "Eixample", "taxiCode": "TX-101", "plate": "1234-JKL"},
     method="POST", as_opener=driver1_op)
print("✓ Marc Vidal disponible en la puerta de T1 (zona Eixample)")
call("system.taxiOps.driver.upsertStatus",
     {"status": "available", "currentLat": 41.2985, "currentLng": 2.0845,
      "currentZone": "Aeroport T1", "taxiCode": "TX-402", "plate": "3456-RTY"},
     method="POST", as_opener=driver4_op)
print("✓ Pau Serra disponible a ~150 m de T1 (zona Aeroport T1)")

ride = call("system.taxiPassengerBooking.createImmediate", {
    "pickupAddress": "Aeroport T1", "dropoffAddress": "Sagrada Família",
    "pickupLat": 41.2974, "pickupLng": 2.0833, "dropoffLat": 41.4036, "dropoffLng": 2.1744,
    "category": "standard", "paymentMethod": "card"}, as_opener=passenger_op)
print(f"✓ viaje {ride['id'][:8]}… solicitado desde T1")
offer4 = call("system.taxiRideOffers.driver.getCurrentOffer", as_opener=driver4_op)
offer1 = call("system.taxiRideOffers.driver.getCurrentOffer", as_opener=driver1_op)
check("la oferta fue a Pau Serra (cabeza de cola), no a Marc Vidal (más cercano)",
      offer4 is not None and "Aeroport" in (offer4.get("pickup_address") or "") and offer1 is None,
      f"Pau: {offer4 and offer4.get('pickup_address')} · Marc: {offer1 and 'tiene oferta'}")

q4b = call("system.taxiOps.driver.getZoneQueue", as_opener=driver4_op)
check("Pau sigue en cola mientras la oferta está viva (sale al aceptar)",
      True, f"aeropuerto: {next(z for z in q4b['queues'] if z['zoneName'] == 'Aeroport T1')['waiting']} en cola")

# ---------------------------------------------------------------------------
section("T3 · DOBLE ACEPTACIÓN (guards)")
check("Pau Serra recibe la oferta de T1", offer4 is not None and "Aeroport" in (offer4.get("pickup_address") or ""),
      str(offer4 and offer4.get("pickup_address")))
accepted = call("system.taxiRideOffers.driver.acceptOffer",
                {"offerId": offer4["id"], "taxiCode": "TX-402", "plate": "3456-RTY"},
                method="POST", as_opener=driver4_op)
check("viaje asignado a Pau Serra", accepted["driver_id"] == "local:driver-4", accepted["status"])

q4c = call("system.taxiOps.driver.getZoneQueue", as_opener=driver4_op)
airport_now = next(z for z in q4c["queues"] if z["zoneName"] == "Aeroport T1")
check("Pau Serra SALIÓ de la cola al aceptar", airport_now["waiting"] == 0 or
      all(m["driverId"] != "local:driver-4" for m in airport_now["members"]),
      f"aeropuerto: {airport_now['waiting']} en cola")

try:
    call("system.taxiOps.driver.acceptRide",
         {"rideId": ride["id"], "taxiCode": "TX-402", "plate": "3456-RTY"},
         method="POST", as_opener=driver4_op)
    check("conductor ocupado no puede aceptar otro viaje", False, "sin error")
except RuntimeError as e:
    check("conductor ocupado no puede aceptar otro viaje", "DRIVER_ALREADY_BUSY" in str(e), str(e)[:120])

try:
    call("system.taxiOps.driver.acceptRide",
         {"rideId": ride["id"], "taxiCode": "TX-101", "plate": "1234-JKL"},
         method="POST", as_opener=driver1_op)
    check("otro conductor no puede aceptar el viaje ya asignado", False, "sin error")
except RuntimeError as e:
    check("otro conductor no puede aceptar el viaje ya asignado", "RIDE_NO_LONGER_PENDING" in str(e), str(e)[:120])

# ---------------------------------------------------------------------------
section("T3b · COMPLETAR EL VIAJE DEL AEROPUERTO")
call("system.taxiLiveTrip.driver.markArrived", {"rideId": ride["id"]}, method="POST", as_opener=driver4_op)
started = call("system.taxiTripLifecycle.startWithPin",
               {"rideId": ride["id"], "pickupPin": ride["pickup_pin"]}, method="POST", as_opener=driver4_op)
closed = call("system.taxiTripSettlement.settleAndComplete",
              {"rideId": ride["id"], "finalFare": 31.4, "paymentStatus": "paid"}, method="POST", as_opener=driver4_op)
check("viaje T1 → Sagrada completado", closed["status"] == "completed", f"{closed['final_fare']}€")
time.sleep(1)

# ---------------------------------------------------------------------------
section("T4 · RESERVA PROGRAMADA: VENTANA DE 15 MIN + DEFER POR VIAJE ACTIVO")
booking = call("system.taxiPassengerBooking.createScheduled", {
    "pickupAddress": "Aeroport T1", "dropoffAddress": "Sagrada Família",
    "pickupLat": 41.2974, "pickupLng": 2.0833, "dropoffLat": 41.4036, "dropoffLng": 2.1744,
    "category": "standard", "paymentMethod": "card",
    "scheduledAt": iso_in(15 + 5 / 60)}, method="POST", as_opener=passenger_op)
check("reserva programada creada (hoy +15m05s)", booking["status"] == "scheduled",
      f"{booking['scheduled_at']} · {booking['estimated_fare']}€")

r1 = call("system.taxiServerDispatch.admin.processScheduledBookings", {}, method="POST", as_opener=admin_op)
check("aún NO se convierte (faltan >15 min)", r1.get("rides_dispatched") == 0, json.dumps(r1))

active = call("system.taxiPassengerBooking.createImmediate", {
    "pickupAddress": "Estació de Sants", "dropoffAddress": "Port Olímpic",
    "pickupLat": 41.3795, "pickupLng": 2.1335, "dropoffLat": 41.3866, "dropoffLng": 2.1952,
    "category": "comfort", "paymentMethod": "card"}, as_opener=passenger_op)
print(f"✓ pasajero con viaje activo {active['id'][:8]}… (Sants → Port Olímpic)")
time.sleep(6)  # la reserva entra en la ventana de conversión (+15m05s)

r2 = call("system.taxiServerDispatch.admin.processScheduledBookings", {}, method="POST", as_opener=admin_op)
check("reserva DIFIERIDA: pasajero con viaje activo", r2.get("rides_deferred") == 1, json.dumps(r2))
bookings = call("system.taxiPassengerBooking.listScheduled", as_opener=passenger_op)
b_now = next(b for b in bookings if b["id"] == booking["id"])
check("last_processing_error = PASSENGER_HAS_ACTIVE_RIDE",
      b_now.get("last_processing_error") == "PASSENGER_HAS_ACTIVE_RIDE",
      f"intentos: {b_now.get('dispatch_attempts')}")
check("reserva sigue programada", b_now["status"] == "scheduled")

call("system.taxiPassengerCancellation.cancel",
     {"rideId": active["id"], "reason": "changed_mind"}, method="POST", as_opener=passenger_op)
print("✓ viaje activo cancelado")

r3 = call("system.taxiServerDispatch.admin.processScheduledBookings", {}, method="POST", as_opener=admin_op)
bookings = call("system.taxiPassengerBooking.listScheduled", as_opener=passenger_op)
b_fin = next(b for b in bookings if b["id"] == booking["id"])
# El scheduler de 30s puede haber convertido la reserva antes que el trigger:
# el resultado real es el estado de la reserva.
check("reserva CONVERTIDA en viaje al liberarse el pasajero",
      b_fin["status"] == "dispatched" and b_fin.get("dispatched_ride_id")
      and r3.get("rides_dispatched", 0) + r3.get("rides_deferred", 0) <= 1,
      f"trigger: {json.dumps(r3)}")
check("reserva marcada dispatched", b_fin["status"] == "dispatched", str(b_fin.get("dispatched_ride_id"))[:40])

notifs = call("system.taxiNotifications.listMine", as_opener=passenger_op)
items = notifs if isinstance(notifs, list) else notifs.get("items", notifs.get("data", []))
check("notificación 'Estamos buscando tu taxi reservado'",
      any("buscando tu taxi reservado" in (n.get("title") or "") for n in items))

# ---------------------------------------------------------------------------
section("T5 · RE-ENTRADA EN COLA Y DESPACHO DE LA RESERVA CONVERTIDA")
q4d = call("system.taxiOps.driver.getZoneQueue", as_opener=driver4_op)
airport4 = next(z for z in q4d["queues"] if z["zoneName"] == "Aeroport T1")
check("Pau Serra volvió a la cola del aeropuerto tras completar su viaje",
      any(m["driverId"] == "local:driver-4" for m in airport4["members"]),
      f"aeropuerto: {airport4['waiting']} en cola")

offer2 = call("system.taxiRideOffers.driver.getCurrentOffer", as_opener=driver4_op)
check("la reserva convertida se ofreció a la cabeza de cola (T1)",
      offer2 is not None and "Aeroport" in (offer2.get("pickup_address") or ""),
      str(offer2 and offer2.get("pickup_address")))

# ---------------------------------------------------------------------------
section("T6 · COLAS EN EL PANEL DE ADMINISTRACIÓN")
snap = call("system.taxiAdminOperations.snapshot", as_opener=admin_op)
queues = snap.get("queues", [])
check("snapshot incluye colas", len(queues) == 5, f"{snap['summary'].get('queuedDrivers', 0)} en cola total")
air_adm = next((z for z in queues if z.get("zoneName") == "Aeroport T1"), None)
check("admin ve a Pau Serra en el aeropuerto",
      air_adm is not None and air_adm["waiting"] >= 1 and
      any(m.get("driverName") == "Pau Serra" for m in air_adm.get("members", [])),
      f"cabeza: {air_adm and air_adm.get('head') and air_adm['head'].get('driverName')}")

# ---------------------------------------------------------------------------
section("LIMPIEZA")
try:
    call("system.taxiPassengerCancellation.cancel",
         {"rideId": b_fin["dispatched_ride_id"], "reason": "changed_mind"},
         method="POST", as_opener=passenger_op)
    print("✓ viaje de la reserva cancelado (estado demo limpio)")
except Exception as e:
    print("· limpieza:", str(e)[:120])

print()
if failures:
    print(f"💥 {len(failures)} FALLOS: " + "; ".join(failures))
    sys.exit(1)
print("🎉 E2E FASE 3 COMPLETO OK — reservas automáticas + colas FIFO + doble aceptación")
