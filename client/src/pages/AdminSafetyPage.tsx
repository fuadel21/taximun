import { useAuth } from "@/_core/hooks/useAuth";
import { AdminSafetyReports } from "@/components/AdminSafetyReports";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminSafetyPage() {
  const { user, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const isRealAdmin = !isGuest && user?.role === "admin";

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f3f3] p-4">
        <Card className="w-full max-w-md rounded-[2rem] border-black/5 bg-white shadow-sm">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black text-white">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-black">Acceso admin requerido</h1>
            <p className="text-sm font-semibold text-zinc-500">Esta sección solo muestra incidencias reales a administradores autenticados.</p>
            <Button onClick={() => setLocation("/auth")} className="h-14 w-full rounded-2xl bg-black font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 pb-12 pt-4 text-black">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[2rem] bg-black p-6 text-white shadow-xl sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Centro de seguridad en vivo</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">SOS y respuesta prioritaria</h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-zinc-300">
            Incidencias creadas por pasajeros y conductores, con temporizador, ubicación, contacto y protocolo de atención.
          </p>
          <p className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-black">Operador: {user?.name ?? user?.email ?? "Administración"}</p>
        </section>

        <AdminSafetyReports />
      </div>
    </main>
  );
}
