import { Activity, BellRing, CarFront, ClipboardCheck, Gift, LayoutDashboard, ShieldCheck, Stethoscope, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";

type AdminTileProps = { title: string; note: string; icon: ReactNode; featured?: boolean; onClick: () => void };
function AdminTile({ title, note, icon, featured = false, onClick }: AdminTileProps) {
  return <button type="button" onClick={onClick} className={`group flex min-h-[10rem] flex-col items-start justify-between rounded-3xl border p-5 text-left transition-all active:scale-[0.98] ${featured ? "border-black bg-black text-white shadow-xl" : "border-zinc-200 bg-white text-black shadow-sm hover:border-zinc-400"}`}><span className={`flex h-14 w-14 items-center justify-center rounded-full ${featured ? "bg-white text-black" : "bg-zinc-100 text-black"}`}>{icon}</span><span><span className="block text-xl font-black tracking-tight">{title}</span><span className={`mt-1 block text-sm font-semibold ${featured ? "text-zinc-300" : "text-zinc-500"}`}>{note}</span></span></button>;
}
export function AdminCommandGrid() {
  const [, setLocation] = useLocation();
  return <section className="bg-white px-4 pb-3 pt-6"><div className="mx-auto max-w-7xl rounded-[2rem] bg-white p-1 sm:p-3"><div className="mb-5"><p className="text-sm font-black text-zinc-500">Taximun Admin</p><h2 className="mt-1 text-3xl font-black tracking-[-0.04em] text-black">Centro de mando</h2><p className="mt-2 text-sm font-semibold text-zinc-500">Accesos grandes a las áreas operativas y datos conectados en tiempo real.</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
    <AdminTile featured title="Resumen" note="Indicadores y actividad real" icon={<LayoutDashboard className="h-8 w-8" />} onClick={() => setLocation("/admin/dashboard")} />
    <AdminTile title="Operaciones" note="Viajes y control en vivo" icon={<Activity className="h-8 w-8" />} onClick={() => setLocation("/admin/operations")} />
    <AdminTile title="Promociones" note="Códigos y campañas reales" icon={<Gift className="h-8 w-8" />} onClick={() => setLocation("/admin/promotions")} />
    <AdminTile title="Conductores y flota" note="Altas y estados reales" icon={<CarFront className="h-8 w-8" />} onClick={() => setLocation("/admin/resources")} />
    <AdminTile title="Auditar viaje" note="Validación integral en lectura" icon={<ClipboardCheck className="h-8 w-8" />} onClick={() => setLocation("/admin/journey-test")} />
    <AdminTile title="Verificación" note="Conductores y documentación" icon={<UserCheck className="h-8 w-8" />} onClick={() => setLocation("/admin/verification")} />
    <AdminTile title="Seguridad" note="Auditoría e incidencias" icon={<ShieldCheck className="h-8 w-8" />} onClick={() => setLocation("/admin/safety")} />
    <AdminTile title="Salud sistema" note="Servicios y conexiones" icon={<Stethoscope className="h-8 w-8" />} onClick={() => setLocation("/admin/health")} />
    <AdminTile title="Alertas" note="Avisos que requieren atención" icon={<BellRing className="h-8 w-8" />} onClick={() => setLocation("/admin/alerts")} />
  </div><p className="mt-4 rounded-2xl bg-zinc-100 p-3 text-xs font-bold text-zinc-600">Este centro de mando muestra únicamente información operativa conectada.</p></div></section>;
}
