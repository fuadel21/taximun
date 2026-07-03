import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Car, Shield, Sparkles, UserRound } from "lucide-react";

type GuestRole = "passenger" | "driver" | "admin";

const GUEST_ROLE_KEY = "taximun_guest_role";

const panels = [
  {
    role: "passenger" as const,
    title: "Pasajero",
    description: "Pedir taxi, seguimiento, pago, historial y soporte.",
    path: "/passenger",
    icon: UserRound,
  },
  {
    role: "driver" as const,
    title: "Conductor",
    description: "Estado, cola, servicios, ganancias e historial.",
    path: "/driver",
    icon: Car,
  },
  {
    role: "admin" as const,
    title: "Admin",
    description: "Operación, flota, conductores, incidencias y configuración.",
    path: "/admin",
    icon: Shield,
  },
];

function enterPanel(role: GuestRole, path: string) {
  try {
    localStorage.setItem(GUEST_ROLE_KEY, role);
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify({
        id: role === "admin" ? -3 : role === "driver" ? -2 : -1,
        openId: `guest:${role}`,
        name: `Invitado ${role}`,
        email: `guest-${role}@taximun.local`,
        role,
        loginMethod: "guest",
        isGuest: true,
      })
    );
  } catch {
    // Ignore localStorage errors.
  }
  window.location.href = path;
}

export default function TestHub() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.20),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_50%,_#ffffff_100%)] px-4 py-8 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-6">
        <div className="text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="text-left">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-700">Taximun</p>
              <p className="text-xs font-medium text-slate-500">Centro de pruebas</p>
            </div>
          </div>

          <Badge className="mb-4 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Sparkles className="mr-2 h-4 w-4" />
            Modo demo sin registro
          </Badge>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Probar todos los paneles</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Usa esta pantalla para revisar rápido pasajero, conductor y admin sin volver al login.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <Card key={panel.role} className="border-white/70 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                <CardHeader>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
                    <Icon className="h-7 w-7" />
                  </div>
                  <CardTitle className="text-2xl font-black">{panel.title}</CardTitle>
                  <CardDescription className="leading-6">{panel.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => enterPanel(panel.role, panel.path)} className="h-13 w-full rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">
                    Entrar como {panel.title}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4 text-center text-sm font-semibold text-cyan-900">
          Ruta directa: /test · Después del repaso la podemos dejar oculta o quitarla.
        </div>
      </section>
    </main>
  );
}
