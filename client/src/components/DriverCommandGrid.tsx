import type { ReactNode } from "react";
import { BarChart3, Car, Gauge, Navigation, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";

type DriverTileProps = {
  title: string;
  note: string;
  icon: ReactNode;
  className: string;
  onClick: () => void;
};

function DriverTile({ title, note, icon, className, onClick }: DriverTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[9.25rem] flex-col items-center justify-center rounded-[2rem] p-4 text-center text-white shadow-xl transition-all duration-200 active:scale-[0.97] ${className}`}
    >
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-white/15 shadow-inner transition-transform group-hover:scale-105">
        {icon}
      </span>
      <span className="text-lg font-black leading-tight">{title}</span>
      <span className="mt-1 text-xs font-bold leading-snug text-white/75">{note}</span>
    </button>
  );
}

export function DriverCommandGrid() {
  const [, setLocation] = useLocation();

  return (
    <section className="bg-slate-950 px-4 pb-3 pt-4">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 text-white">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Centro de conductor</p>
          <h2 className="mt-1 text-2xl font-black">Acciones rápidas</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">Controles grandes para trabajar con menos pulsaciones.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DriverTile title="Mi turno" note="Disponibilidad y estado" icon={<Gauge className="h-8 w-8" />} className="bg-gradient-to-br from-cyan-600 to-blue-700" onClick={() => setLocation("/driver")} />
          <DriverTile title="Servicios" note="Ofertas y viaje activo" icon={<Car className="h-8 w-8" />} className="bg-gradient-to-br from-indigo-600 to-violet-700" onClick={() => setLocation("/driver/queue")} />
          <DriverTile title="Navegar" note="Ruta y llegada con PIN" icon={<Navigation className="h-8 w-8" />} className="bg-gradient-to-br from-emerald-600 to-green-700" onClick={() => setLocation("/driver/navigation")} />
          <DriverTile title="Ingresos" note="Cobros e historial" icon={<BarChart3 className="h-8 w-8" />} className="bg-gradient-to-br from-amber-500 to-orange-600" onClick={() => setLocation("/driver/earnings")} />
          <DriverTile title="Seguridad" note="Ayuda e incidencias" icon={<ShieldCheck className="h-8 w-8" />} className="bg-gradient-to-br from-rose-600 to-red-700" onClick={() => setLocation("/driver/security")} />
          <DriverTile title="Mi perfil" note="Documentos y vehículo" icon={<UserRound className="h-8 w-8" />} className="bg-gradient-to-br from-slate-600 to-slate-900" onClick={() => setLocation("/driver/profile")} />
        </div>
      </div>
    </section>
  );
}
