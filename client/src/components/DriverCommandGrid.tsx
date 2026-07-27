import type { ReactNode } from "react";
import { BarChart3, Car, Gauge, Navigation, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";

type DriverTileProps = {
  title: string;
  note: string;
  icon: ReactNode;
  featured?: boolean;
  onClick: () => void;
};

function DriverTile({ title, note, icon, featured = false, onClick }: DriverTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[10rem] flex-col items-start justify-between rounded-3xl border p-5 text-left transition-all duration-200 active:scale-[0.98] ${featured ? "border-white bg-white text-black shadow-xl" : "border-zinc-800 bg-zinc-900 text-white hover:border-zinc-600"}`}
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${featured ? "bg-black text-white" : "bg-zinc-800 text-white"}`}>{icon}</span>
      <span>
        <span className="block text-xl font-black tracking-tight">{title}</span>
        <span className={`mt-1 block text-sm font-semibold ${featured ? "text-zinc-500" : "text-zinc-400"}`}>{note}</span>
      </span>
    </button>
  );
}

export function DriverCommandGrid() {
  const [, setLocation] = useLocation();

  return (
    <section className="bg-black px-4 pb-4 pt-5">
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-black p-1 sm:p-3">
        <div className="mb-5 text-white">
          <p className="text-sm font-black text-zinc-500">Taximun Driver</p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">Panel de trabajo</h2>
          <p className="mt-2 text-sm font-semibold text-zinc-400">Controles grandes para trabajar con menos pulsaciones.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DriverTile featured title="Mi turno" note="Disponibilidad y estado" icon={<Gauge className="h-8 w-8" />} onClick={() => setLocation("/driver")} />
          <DriverTile title="Servicios" note="Ofertas y viaje activo" icon={<Car className="h-8 w-8" />} onClick={() => setLocation("/driver/queue")} />
          <DriverTile title="Navegar" note="Ruta y llegada con PIN" icon={<Navigation className="h-8 w-8" />} onClick={() => setLocation("/driver/navigation")} />
          <DriverTile title="Ingresos" note="Cobros e historial" icon={<BarChart3 className="h-8 w-8" />} onClick={() => setLocation("/driver/earnings")} />
          <DriverTile title="Seguridad" note="Ayuda e incidencias" icon={<ShieldCheck className="h-8 w-8" />} onClick={() => setLocation("/driver/security")} />
          <DriverTile title="Mi perfil" note="Documentos y vehículo" icon={<UserRound className="h-8 w-8" />} onClick={() => setLocation("/driver/profile")} />
        </div>
      </div>
    </section>
  );
}
