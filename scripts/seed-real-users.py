#!/usr/bin/env python3
"""Crea los usuarios de prueba de Taximun en el proyecto Supabase real
   - pasajero@taximun.app  (pasajera)
   - conductor@taximun.app (conductor verificado con documentos, en Aeroport T1)
   y RESTAURA el perfil del usuario real fuadel21@gmail.com (driver «Pasajero1»),
   alterado por una ejecución previa con el filtro de email roto.

NOTA: el endpoint /auth/v1/admin/users?email=… NO filtra en esta versión de
GoTrue: devuelve todos los usuarios. Siempre hay que emparejar en el cliente.

Idempotente: puede ejecutarse varias veces.
"""
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

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
    base = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL")
    srv = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not srv:
        sys.exit("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: ponlas en taximun/.env (gitignored).")
    return base.rstrip("/"), srv

BASE, SRV = _cargar_claves()
H = {"apikey": SRV, "Authorization": f"Bearer {SRV}", "content-type": "application/json"}
ADMIN = "supabase:16e61028-3234-4f3f-b721-f9121d65d069"
PASSWORD = "Taximun-Demo-2026"

def req(method, path, body=None, prefer=None, ok=(200, 201)):
    headers = dict(H)
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            out = json.loads(raw) if raw else None
            if resp.status not in ok:
                print(f"  ✗ {method} {path} → {resp.status}: {str(out)[:200]}")
                return resp.status, out
            return resp.status, out
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            out = json.loads(raw)
        except Exception:
            out = raw.decode()[:200]
        print(f"  ✗ {method} {path} → {e.code}: {str(out)[:200]}")
        return e.code, out

def users_by_email():
    code, data = req("GET", "/auth/v1/admin/users?per_page=200")
    return {u["email"]: u["id"] for u in (data or {}).get("users", [])}

usuarios = users_by_email()
print("── usuarios reales ──")
for email, uid in usuarios.items():
    print(f"  {email} · {uid}")

# ─────────────────────────────────────────────────────────────────────────────
# 1) RESTAURAR el perfil del usuario real (gmail): driver «Pasajero1»
# ─────────────────────────────────────────────────────────────────────────────
gmail_id = usuarios.get("fuadel21@gmail.com")
if gmail_id:
    print("\n── restaurar perfil de fuadel21@gmail.com ──")
    code, _ = req("PATCH", f"/rest/v1/taxi_user_profiles?user_id=eq.supabase:{gmail_id}", {
        "role": "driver", "full_name": "Pasajero1",
        "verification_status": "approved", "is_verified": True,
    }, prefer="return=representation")
    if code == 200:
        print("  ✓ perfil restaurado a driver «Pasajero1»")
    # su estado operativo (heredado de la ejecución errónea): nombre correcto
    code, _ = req("PATCH", f"/rest/v1/driver_live_status?driver_id=eq.supabase:{gmail_id}", {
        "driver_name": "Pasajero1", "status": "available",
        "current_zone": "Aeroport T1", "current_lat": 41.2974, "current_lng": 2.0833,
        "taxi_code": "TX-101", "plate": "1234-JKL",
    })
    print(f"  ✓ driver_live_status renombrado: HTTP {code}")

# ─────────────────────────────────────────────────────────────────────────────
# 2) Usuarios demo (creación real con emparejamiento cliente)
# ─────────────────────────────────────────────────────────────────────────────
print("\n── usuarios demo ──")
for email, nombre in [("pasajero@taximun.app", "Laura Demo"), ("conductor@taximun.app", "Pau Demo")]:
    if email in usuarios:
        print(f"  ✓ {email} ya existe")
        continue
    code, data = req("POST", "/auth/v1/admin/users", {
        "email": email, "password": PASSWORD, "email_confirm": True,
        "user_metadata": {"full_name": nombre},
    })
    if code in (200, 201):
        print(f"  ✓ {email} creado")
        usuarios[email] = data["id"]
    else:
        sys.exit(1)

pas_id = usuarios["pasajero@taximun.app"]
drv_id = usuarios["conductor@taximun.app"]

print("\n── perfiles demo ──")
code, _ = req("POST", "/rest/v1/taxi_user_profiles", {
    "user_id": f"supabase:{pas_id}", "role": "passenger", "full_name": "Laura Demo",
    "preferred_payment_method": "cash",
}, prefer="resolution=merge-duplicates")
print(f"  pasajera: HTTP {code}")

code, _ = req("POST", "/rest/v1/taxi_user_profiles", {
    "user_id": f"supabase:{drv_id}", "role": "driver", "full_name": "Pau Demo",
    "taxi_code": "TX-901", "plate": "1122-AABB", "work_zone": "Aeroport T1",
}, prefer="resolution=merge-duplicates")
print(f"  conductor: HTTP {code}")

print("\n── documentos del conductor demo (5 obligatorios) ──")
futuro = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
for doc_type in ["identity", "driver_license", "taxi_license", "insurance", "vehicle_inspection"]:
    code, _ = req("POST", "/rest/v1/taxi_driver_documents", {
        "driver_id": f"supabase:{drv_id}", "document_type": doc_type,
        "status": "approved", "expires_at": futuro,
        "reviewed_by": ADMIN, "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }, prefer="resolution=merge-duplicates")
    print(f"  {doc_type}: HTTP {code}")

print("\n── aprobar conductor demo ──")
code, data = req("PATCH", f"/rest/v1/taxi_user_profiles?user_id=eq.supabase:{drv_id}", {
    "verification_status": "approved", "is_verified": True,
    "verified_by": ADMIN, "verified_at": datetime.now(timezone.utc).isoformat(),
}, prefer="return=representation")
if code == 200 and data:
    print(f"  → {data[0]['verification_status']} / is_verified={data[0]['is_verified']}")

print("\n── estado operativo del conductor demo ──")
code, _ = req("POST", "/rest/v1/driver_live_status", {
    "driver_id": f"supabase:{drv_id}", "driver_name": "Pau Demo",
    "taxi_code": "TX-901", "plate": "1122-AABB", "status": "available",
    "current_lat": 41.2974, "current_lng": 2.0833, "current_zone": "Aeroport T1",
}, prefer="resolution=merge-duplicates")
print(f"  driver_live_status: HTTP {code}")

print("\n── verificación final ──")
code, data = req("GET", "/rest/v1/taxi_user_profiles?select=user_id,role,full_name,verification_status&order=role")
for p in data or []:
    print(f"  {p['role']:10} {p['full_name']:12} ver={p['verification_status']}")
code, data = req("GET", "/rest/v1/driver_live_status?select=driver_id,driver_name,status,current_zone")
for d in data or []:
    print(f"  live: {d['driver_name']} ({d['driver_id'][10:18]}…) {d['status']} en {d['current_zone']}")
print("\nContraseña de los usuarios demo:", PASSWORD)
