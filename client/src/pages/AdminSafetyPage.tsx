import { useAuth } from "@/_core/hooks/useAuth";
import { AdminSafetyReports } from "@/components/AdminSafetyReports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminSafetyPage() {
  const { user, logout, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const isRealAdmin = !isGuest && user?.role === "admin";

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-red-50 text-red-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black">Acceso admin requerido</h1>
            <p className="text-sm font-semibold text-slate-500">Esta sección solo muestra incidencias reales a administradores autenticados.</p>
            <Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 to-blue-950 text-white shadow-lg">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun Admin</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Incidencias reales</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="hidden bg-emerald-100 text-emerald-800 hover:bg-emerald-100 sm:inline-flex">Supabase activo</Badge>
            <Button variant="outline" onClick={() => setLocation("/admin")} className="rounded-2xl bg-white/80 font-black">Dashboard</Button>
            <Button variant="outline" onClick={logout} className="rounded-2xl bg-white/80">
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-200">Centro de seguridad</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Soporte e incidencias</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Aquí aparecen las incidencias creadas desde pasajero y conductor en las pantallas de seguridad.
              </p>
            </div>
            <Badge className="w-fit bg-white/15 text-white hover:bg-white/15">Admin: {user?.name ?? user?.email ?? "activo"}</Badge>
          </div>
        </section>

        <AdminSafetyReports />
      </main>
    </div>
  );
}
