#!/usr/bin/env python3
"""E2E contra el backend REAL (Supabase) de Taximun.
Flujo: pasajera pide taxi (efectivo, desde Aeroport T1) → despacho → conductor
acepta → llegada → PIN → cobro → valoración → re-entrada en cola FIFO.
Usuarios demo: pasajero@taximun.app / conductor@taximun.app (Taximun-Demo-2026).
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

def _cargar_claves():
    """Lee las claves del .env del proyecto (nunca incrustadas en el código)."""
    import os, pathlib
    env = {}
    p = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()

    def clave(nombre):
        return os.environ.get(nombre) or env.get(nombre)

    supa = clave("SUPABASE_URL")
    anon = clave("SUPABASE_ANON_KEY")
    srv = clave("SUPABASE_SERVICE_ROLE_KEY")
    if not (supa and anon and srv):
        sys.exit("Faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY: ponlas en taximun/.env (gitignored).")
    return supa.rstrip("/"), anon, srv

SUPA, ANON, SRV = _cargar_claves()
APP = "http://localhost:3000/api/trpc"
PASSWORD = "Taximun-Demo-2026"
failures = []

def check(label, cond, detail=""):
    print(("✓" if cond else "✗ FALLO") + f" {label}" + (f" · {detail}" if detail else ""))
    if not cond:
        failures.append(label)
    return cond

def supa_login(email):
    req = urllib.request.Request(
        f"{SUPA}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": PASSWORD}).encode(),
        headers={"apikey": ANON, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read())
        return d["access_token"], d["user"]["id"]

def trpc(token, proc, inp=None, method=None):
    if method is None:
        method = "POST" if inp is not None else "GET"
    headers = {"Authorization": f"Bearer {token}"}
    if method == "POST":
        headers["content-type"] = "application/json"
        req = urllib.request.Request(f"{APP}/{proc}?batch=1",
                                     data=json.dumps({"0": {"json": inp if inp is not None else {}}}).encode(),
                                     headers=headers)
    else:
        q = urllib.parse.quote(json.dumps({"0": {"json": inp}}))
        req = urllib.request.Request(f"{APP}/{proc}?batch=1&input={q}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        raise RuntimeError(f"{proc}: HTTP {e.code} {body}")
    item = out[0]
    if "error" in item:
        raise RuntimeError(f"{proc}: {item['error']['json']['message'][:300]}")
    return item["result"]["data"]["json"]

def rest(path, method="GET", body=None):
    headers = {"apikey": SRV, "Authorization": f"Bearer {SRV}", "content-type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPA}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

DRIVER_ID = None  # se rellena tras el login

print("── 1) LOGIN REAL (Supabase Auth) ──")
tok_pas, pas_uid = supa_login("pasajero@taximun.app")
tok_drv, drv_uid = supa_login("conductor@taximun.app")
me = trpc(tok_drv, "system.taxiProfiles.getMe")
DRIVER_ID = f"supabase:{drv_uid}"
check("pasajera y conductor logueados con cuenta real", True, f"conductor: {me.get('full_name')}")

print("── 1b) LIMPIEZA (viajes activos previos de la pasajera) ──")
_pas_open = f"supabase:{pas_uid}"
_activos = rest(f"taxi_rides?passenger_id=eq.{_pas_open}&status=in.(pending,assigned,in_progress)&select=id,status")
for _r in _activos or []:
    try:
        trpc(tok_pas, "system.taxiPassengerCancellation.cancel", {"rideId": _r["id"], "reason": "changed_mind"})
        print(f"  ✓ viaje previo {_r['id'][:8]}… ({_r['status']}) cancelado")
    except Exception as e:
        print(f"  · no se pudo cancelar {_r['id'][:8]}…: {str(e)[:80]}")
if not _activos:
    print("  ✓ sin viajes activos previos")

print("── 2) ESTADO INICIAL DE LA COLA ──")
q = trpc(tok_drv, "system.taxiOps.driver.getZoneQueue")
airport = next(z for z in q["queues"] if z["zoneName"] == "Aeroport T1")
check("el conductor ve la cola del aeropuerto", q["inQueueZone"] is not None,
      f"posición #{q['inQueueZone']['myPosition']}, {airport['waiting']} en cola")

print("── 2b) PASAJERO1 OFFLINE (despacho determinista hacia Pau Demo) ──")
import urllib.parse as _up
_gmail = rest("driver_live_status?driver_name=eq.Pasajero1&select=driver_id")
if _gmail:
    rest("driver_live_status?driver_id=eq." + _up.quote(_gmail[0]["driver_id"]), "PATCH", {"status": "offline"})
    rest("rpc/taximun_sync_zone_queues", "POST", {})
    print("  ✓ Pasajero1 offline y fuera de la cola")
q = trpc(tok_drv, "system.taxiOps.driver.getZoneQueue")
airport = next(z for z in q["queues"] if z["zoneName"] == "Aeroport T1")
check("solo Pau Demo en la cola", airport["waiting"] == 1, f"{airport['waiting']} en cola")

print("── 3) RESERVA INMEDIATA (efectivo, Aeroport T1 → Sagrada Família) ──")
ride = trpc(tok_pas, "system.taxiPassengerBooking.createImmediate", {
    "pickupAddress": "Aeroport T1", "pickupLat": 41.2974, "pickupLng": 2.0833,
    "dropoffAddress": "Sagrada Família", "dropoffLat": 41.4036, "dropoffLng": 2.1744,
    "category": "standard", "paymentMethod": "cash"})
check("viaje creado en Supabase real", ride.get("id") is not None,
      f"{str(ride['id'])[:8]}… estado {ride.get('status')} · {ride.get('estimated_fare')}€")
pin = ride.get("pickup_pin") or rest(f"taxi_rides?id=eq.{ride['id']}&select=pickup_pin")[0]["pickup_pin"]
check("PIN de recogida generado", bool(pin), f"PIN {pin}")

print("── 4) DESPACHO: LA OFERTA LLEGA AL CONDUCTOR ──")
# El despacho real exige GPS fresco (location_updated_at < 3 min) y el trigger solo
# refresca esa columna si lat/lng CAMBIAN: usamos coords con jitter determinista.
import urllib.parse as _up2, time as _t
_jitter = round((_t.time() % 97) * 1e-5, 6)
rest("driver_live_status?driver_id=eq." + _up2.quote(DRIVER_ID), "PATCH",
     {"status": "available",
      "current_lat": round(41.2974 + _jitter, 6), "current_lng": round(2.0833 + _jitter, 6),
      "current_zone": "Aeroport T1"})
rest("rpc/taximun_sync_zone_queues", "POST", {})  # entra en la cola FIFO antes del despacho
rows = rest("driver_queues?driver_id=eq." + urllib.parse.quote(DRIVER_ID) + "&is_active=eq.true")
print(f"  ✓ heartbeat con jitter ({_jitter}) + sync → en cola: {bool(rows)}")
disp = trpc(tok_pas, "system.taxiServerDispatch.passenger.dispatchMine", {"offerSeconds": 90})
check("despacho directo: oferta para este conductor",
      disp.get("driverId") == DRIVER_ID and disp.get("code") in ("OFFER_CREATED", "OFFER_ALREADY_ACTIVE", "ACTIVE_OFFER_EXISTS"),
      f"{disp.get('code')} → {disp.get('driverId','')[:20]}…")
time.sleep(2)
offer = trpc(tok_drv, "system.taxiRideOffers.driver.getCurrentOffer")
check("el conductor recibe la oferta", offer is not None and "Aeroport" in (offer.get("pickup_address") or ""),
      str(offer and offer.get("pickup_address")))

print("── 5) ACEPTAR → SALIDA DE COLA ──")
accepted = trpc(tok_drv, "system.taxiRideOffers.driver.acceptOffer",
                {"offerId": offer["id"], "taxiCode": "TX-901", "plate": "1122-AABB"})
check("viaje asignado", accepted.get("driver_id") is not None, f"estado {accepted.get('status')}")
time.sleep(1)
rows = rest("driver_queues?driver_id=eq." + urllib.parse.quote(DRIVER_ID) + "&is_active=eq.true")
check("el conductor SALIÓ de la cola al aceptar", not rows)

print("── 6) LLEGADA → PIN → EN RUTA ──")
trpc(tok_drv, "system.taxiLiveTrip.driver.markArrived", {"rideId": ride["id"]})
started = trpc(tok_drv, "system.taxiTripLifecycle.startWithPin",
               {"rideId": ride["id"], "pickupPin": pin})
check("viaje iniciado con PIN", started.get("status") == "in_progress", str(started.get("status")))

print("── 7) COBRO EN EFECTIVO Y CIERRE ──")
closed = trpc(tok_drv, "system.taxiTripSettlement.settleAndComplete",
              {"rideId": ride["id"], "finalFare": 31.4, "paymentStatus": "paid"})
check("viaje completado", closed.get("status") == "completed", f"{closed.get('final_fare')}€ efectivo")

print("── 8) VALORACIÓN ──")
rating = trpc(tok_pas, "system.taxiRatings.createRating",
              {"rideId": ride["id"], "score": 5, "comment": "E2E real Supabase", "tags": ["punctual"]})
check("valoración 5★ registrada", rating is not None)

print("── 9) RE-ENTRADA EN COLA (sync) ──")
rest("rpc/taximun_sync_zone_queues", "POST", {})
rows = rest("driver_queues?driver_id=eq." + urllib.parse.quote(DRIVER_ID) + "&is_active=eq.true")
check("el conductor volvió a la cola tras completar", bool(rows), f"posición #{rows[0]['position'] if rows else '—'}")

print("── 10) HISTORIAL DE LA PASAJERA ──")
rides = trpc(tok_pas, "system.taxiPassengerTracking.getActiveRide", method="GET") if False else None
hist = rest(f"taxi_rides?id=eq.{ride['id']}&select=status,final_fare,driver_name")
if hist:
    h = hist[0]
    check("historial consistente", h["status"] == "completed" and h["driver_name"],
          f"{h['driver_name']} · {h['final_fare']}€")

print("── 11) RESTAURAR PASAJERO1 ──")
if _gmail:
    rest("driver_live_status?driver_id=eq." + _up.quote(_gmail[0]["driver_id"]), "PATCH", {"status": "available"})
    rest("rpc/taximun_sync_zone_queues", "POST", {})
    print("  ✓ Pasajero1 disponible de nuevo")

print()
if failures:
    print(f"💥 {len(failures)} FALLOS: " + "; ".join(failures))
    sys.exit(1)
print("🎉 E2E REAL COMPLETO — Supabase + colas FIFO + ciclo de viaje de verdad")
