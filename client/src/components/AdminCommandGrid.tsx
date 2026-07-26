import { Activity, BellRing, LayoutDashboard, ShieldCheck, Stethoscope, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";

type AdminTileProps = {
  title: string;
  note: string;
  icon: ReactNode;
  className: string;
  onClick: () => void;
};

function AdminTile({ title, note, icon, className, onClick }: AdminTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[10rem] flex-col items-center justify-center rounded-[2rem] p-5 text-center text-white shadow-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.97] ${className}`}
    >
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white/15 shadow-inner transition-transform group-hover:scale-105">
        {icon}
      </span>
      <span className="text-lg font-black leading-tight">{title}</span>
      <span className="mt-1 text-xs font-bold text-white/75">{note}</span>
    </button>
  );
}

export function AdminCommandGrid() {
  const [, setLocation] = useLocation();

  return (
    <section className="bg-[linear-gradient(180deg,#eef6ff_0%,#f8fbff_100%)] px-4 pb-2 pt-6">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white bg-white/90 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">Centro de mando</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Accesos administrativos</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Botones grandes para llegar directamente a cada área operativa.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <AdminTile
            title="Resumen"
            note="Indicadores y actividad"
            icon={<LayoutDashboard className="h-9 w-9" />}
            className="bg-gradient-to-br from-slate-700 to-slate-950"
            onClick={() => setLocation("/admin/dashboard")}
          />
          <AdminTile
            title="Operaciones"
            note="Viajes y control en vivo"
            icon={<Activity className="h-9 w-9" />}
            className="bg-gradient-to-br from-blue-600 to-indigo-700"
            onClick={() => setLocation("/admin/operations")}
          />
          <AdminTile
            title="Verificación"
            note="Conductores y documentación"
            icon={<UserCheck className="h-9 w-9" />}
            className="bg-gradient-to-br from-violet-600 to-purple-800"
            onClick={() => setLocation("/admin/verification")}
          />
          <AdminTile
            title="Seguridad"
            note="Auditoría e incidencias"
            icon={<ShieldCheck className="h-9 w-9" />}
            className="bg-gradient-to-br from-emerald-600 to-green-800"
            onClick={() => setLocation("/admin/safety")}
          />
          <AdminTile
            title="Salud sistema"
            note="Servicios y conexiones"
            icon={<Stethoscope className="h-9 w-9" />}
            className="bg-gradient-to-br from-cyan-600 to-teal-700"
            onClick={() => setLocation("/admin/health")}
          />
          <AdminTile
            title="Alertas"
            note="Avisos que requieren atención"
            icon={<BellRing className="h-9 w-9" />}
            className="bg-gradient-to-br from-orange-500 to-red-600"
            onClick={() => setLocation("/admin/alerts")}
          />
        </div>

        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
          El panel general todavía contiene algunos gráficos y viajes de demostración; las áreas operativas enlazadas mantienen sus conexiones reales cuando están disponibles.
        </p>
      </div>
    </section>
  );
}
