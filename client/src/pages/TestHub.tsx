import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Car, Shield, Sparkles, UserRound } from "lucide-react";

const panels = [
  {
    title: "Pasajero",
    description: "Inicia sesión como pasajero real para pedir taxi y ver seguimiento.",
    icon: UserRound,
  },
  {
    title: "Conductor",
    description: "Inicia sesión como conductor real para aceptar solicitudes.",
    icon: Car,
  },
  {
    title: "Admin",
    description: "Inicia sesión con una cuenta admin autorizada.",
    icon: Shield,
  },
];

function goToRealLogin() {
  try {
    localStorage.removeItem("taximun_guest_role");
    localStorage.removeItem("manus-runtime-user-info");
  } catch {
    // Ignore localStorage errors.
  }
  window.location.href = "/auth";
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
              <p className="text-xs font-medium text-slate-500">Acceso real</p>
            </div>
          </div>

          <Badge className="mb-4 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <Sparkles className="mr-2 h-4 w-4" />
            Modo real Supabase
          </Badge>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Entrar con cuenta real</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
            El modo invitado está desactivado porque los paneles ya guardan datos reales en Supabase.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <Card key={panel.title} className="border-white/70 bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                <CardHeader>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
                    <Icon className="h-7 w-7" />
                  </div>
                  <CardTitle className="text-2xl font-black">{panel.title}</CardTitle>
                  <CardDescription className="leading-6">{panel.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={goToRealLogin} className="h-13 w-full rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800">
                    Ir al login real
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4 text-center text-sm font-semibold text-cyan-900">
          Usa /auth para iniciar sesión como pasajero, conductor o admin.
        </div>
      </section>
    </main>
  );
}
