#!/usr/bin/env python3
"""Test E2E del modo demo local de Taximun (contra localhost:3000)."""
import json
import urllib.request
import urllib.parse
import http.cookiejar

BASE = "http://localhost:3000/api/trpc"
def new_opener():
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
passenger_op, driver_op, admin_op = new_opener(), new_opener(), new_opener()
opener = passenger_op  # por defecto: pasajero

def call(proc, input=None, method=None, as_opener=None):
    """Llama un procedimiento tRPC. Mutations → POST, queries → GET."""
    op = as_opener or opener
    if method is None:
        method = "POST" if input is not None else "GET"
    if method == "POST":
        body = json.dumps({"0": {"json": input if input is not None else {}}}).encode()
        req = urllib.request.Request(f"{BASE}/{proc}?batch=1", data=body,
                                     headers={"content-type": "application/json"})
    else:
        q = urllib.parse.quote(json.dumps({"0": {"json": input if input is not None else None}}))
        req = urllib.request.Request(f"{BASE}/{proc}?batch=1&input={q}")
    with op.open(req) as resp:
        out = json.loads(resp.read())
    item = out[0]
    if "error" in item:
        raise RuntimeError(f"{proc}: {item['error']['json']['message']}")
    return item["result"]["data"]["json"]

def section(t): print(f"\n=== {t} ===")

section("LOGIN PASAJERO")
u = call("auth.devLogin", {"role": "passenger"}, method="POST", as_opener=passenger_op)
print("✓", u["name"], "·", u["role"])

section("PEDIR TAXI CON TARJETA (Sants → Port Olímpic, comfort)")
ride = call("system.taxiPassengerBooking.createImmediate", {
    "pickupAddress": "Estació de Sants", "dropoffAddress": "Port Olímpic",
    "pickupLat": 41.3795, "pickupLng": 2.1335, "dropoffLat": 41.3866, "dropoffLng": 2.1952,
    "category": "comfort", "paymentMethod": "card"})
print(f"✓ ride {ride['id'][:8]}… · {ride['status']} · {ride['estimated_fare']}€ · PIN {ride['pickup_pin']}")

section("DESPACHO IDEMPOTENTE")
d1 = call("system.taxiServerDispatch.passenger.dispatchMine", {"offerSeconds": 90}, method="POST", as_opener=passenger_op)
print("✓", d1["code"], "→ conductor", d1.get("driver_id"))

section("ESTADO DEL DESPACHO (lo que ve el pasajero)")
try:
    st = call("system.taxiRideOffers.passenger.getDispatchStatus")
    print("✓", json.dumps(st, ensure_ascii=False)[:200])
except Exception as e:
    print("·", e)

section("LOGIN CONDUCTOR 2 (Youssef, Sants)")
d = call("auth.devLogin", {"role": "driver", "driverIndex": 2}, method="POST", as_opener=driver_op)
print("✓", d["name"])

section("OFERTA → ACEPTAR")
offer = call("system.taxiRideOffers.driver.getCurrentOffer", as_opener=driver_op)
print(f"✓ oferta {offer['id'][:8]}… · {offer['pickup_address']} → {offer['dropoff_address']}")
ride2 = call("system.taxiRideOffers.driver.acceptOffer",
             {"offerId": offer["id"], "taxiCode": "TX-204", "plate": "5678-BCD"}, method="POST", as_opener=driver_op)
print("✓ asignado a", ride2["driver_name"], "· estado:", ride2["status"])

section("LLEGADA → INICIAR CON PIN → CERRAR")
call("system.taxiLiveTrip.driver.markArrived", {"rideId": ride["id"]}, method="POST", as_opener=driver_op)
print("✓ llegada marcada")
started = call("system.taxiTripLifecycle.startWithPin",
               {"rideId": ride["id"], "pickupPin": ride["pickup_pin"]}, method="POST", as_opener=driver_op)
print("✓ iniciado:", started["status"])
closed = call("system.taxiTripSettlement.settleAndComplete",
              {"rideId": ride["id"], "finalFare": 16.2, "paymentStatus": "paid"}, method="POST", as_opener=driver_op)
print(f"✓ cerrado: {closed['status']} · {closed['final_fare']}€")

section("PAGO (ledger)")
pay = call("system.taxiPayments.getForRide", {"rideId": ride["id"]}, method="GET")
print(f"✓ {pay['status']} · capturado {pay['amount_captured']}€ · fee {pay['platform_fee']}€ · neto {pay['driver_net']}€")

section("VALORACIÓN")
rate = call("system.taxiRatings.createRating",
            {"rideId": ride["id"], "score": 5, "comment": "Muy profesional", "tags": ["punctual", "professional"]},
            method="POST")
print("✓", rate if not isinstance(rate, dict) else f"{rate.get('score')} estrellas")

section("CANCELACIÓN (nuevo viaje en efectivo)")
ride3 = call("system.taxiPassengerBooking.createImmediate", {
    "pickupAddress": "Carrer de Mallorca 401, Eixample", "dropoffAddress": "Sagrada Família",
    "pickupLat": 41.3936, "pickupLng": 2.1632, "dropoffLat": 41.4036, "dropoffLng": 2.1744,
    "category": "standard", "paymentMethod": "cash"})
call("system.taxiServerDispatch.passenger.dispatchMine", {"offerSeconds": 90}, method="POST", as_opener=passenger_op)
canc = call("system.taxiPassengerCancellation.cancel",
            {"rideId": ride3["id"], "reason": "changed_mind"}, method="POST")
print(f"✓ {canc['status']} · motivo {canc['cancellation_reason']} · liberación pago: {canc.get('payment_release', {}).get('status', 'n/d')}")

section("LOGIN ADMIN + SNAPSHOT")
call("auth.devLogin", {"role": "admin"}, method="POST", as_opener=admin_op)
snap = call("system.taxiAdminOperations.snapshot", as_opener=admin_op)
print("✓ drivers:", snap["summary"]["totalDrivers"], "· disponibles:", snap["summary"]["availableDrivers"],
      "· viajes:", len(snap["rides"]), "· alertas:", snap["summary"]["activeAlerts"])
health = call("system.taxiSystemHealth.run", as_opener=admin_op)
print("✓ health:", health.get("status"), "·", json.dumps(health.get("stats", {}), ensure_ascii=False))

section("NOTIFICACIONES PASAJERO")
call("auth.devLogin", {"role": "passenger"}, method="POST", as_opener=passenger_op)
notifs = call("system.taxiNotifications.listMine")
items = notifs if isinstance(notifs, list) else notifs.get("items", notifs.get("data", []))
for n in items[:6]:
    print("  ·", n["title"])

print("\n🎉 E2E COMPLETO OK")
