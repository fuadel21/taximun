import { useAuth } from "@/_core/hooks/useAuth";
import { TaxiNotificationCenter } from "@/components/TaxiNotificationCenter";
import { PremiumInternalHeader } from "@/components/PremiumInternalHeader";
import { Bell, CheckCircle2, ShieldCheck } from "lucide-react";

export default function NotificationsPage() {
  const { user } = useAuth() as any;
  const homePath = user?.role === "driver" ? "/driver" : user?.role === "admin" ? "/admin/dashboard" : "/passenger";

  return (
    <main className="min-h-screen bg-[#f3f3f3] text-black">
      <PremiumInternalHeader
        eyebrow="Taximun"
        title="Notificaciones"
        description="Consulta avisos de viajes, seguridad, documentos y administración."
        homePath={homePath}
        icon={<Bell className="h-8 w-8" />}
      />

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-black/45">Bandeja interna</p>
              <h2 className="mt-1 text-2xl font-black">Tus avisos importantes</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-black/55">
                Abre la bandeja para revisar aprobaciones, rechazos, cambios del viaje y mensajes administrativos.
              </p>
            </div>
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-black text-white">
              <Bell className="h-9 w-9" />
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] bg-black p-4 text-white">
            <TaxiNotificationCenter />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-h-32 rounded-[1.75rem] bg-white p-4 shadow-sm">
            <CheckCircle2 className="h-8 w-8" />
            <p className="mt-4 font-black">Estado del viaje</p>
            <p className="mt-1 text-xs font-semibold text-black/50">Asignaciones, llegadas y finalizaciones.</p>
          </div>
          <div className="min-h-32 rounded-[1.75rem] bg-white p-4 shadow-sm">
            <ShieldCheck className="h-8 w-8" />
            <p className="mt-4 font-black">Seguridad</p>
            <p className="mt-1 text-xs font-semibold text-black/50">Incidencias y avisos que requieren atención.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
