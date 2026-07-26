import { BellRing, Car, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";

type CommandTileProps = {
  title: string;
  note: string;
  icon: React.ReactNode;
  className: string;
  onClick: () => void;
};

function CommandTile({ title, note, icon, className, onClick }: CommandTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[9.5rem] flex-col items-center justify-center rounded-[2rem] p-5 text-center text-white shadow-xl transition-all duration-200 active:scale-[0.97] ${className}`}
    >
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-white/15 shadow-inner transition-transform group-hover:scale-105">
        {icon}
      </span>
      <span className="text-lg font-black leading-tight">{title}</span>
      <span className="mt-1 text-xs font-bold text-white/75">{note}</span>
    </button>
  );
}

export function PassengerCommandGrid() {
  const [, setLocation] = useLocation();

  return (
    <section className="bg-[#f7f8fb] px-4 pt-4">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-white bg-white p-4 shadow-xl">
        <div className="mb-4">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Accesos rápidos</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">¿Qué necesitas hacer?</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Botones grandes y directos, pensados para usar la app en movimiento.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CommandTile
            title="Mi viaje"
            note="Estado, conductor y recorrido"
            icon={<Car className="h-8 w-8" />}
            className="bg-gradient-to-br from-blue-600 to-indigo-700"
            onClick={() => setLocation("/passenger/rides")}
          />
          <CommandTile
            title="Avisos"
            note="Mensajes y novedades"
            icon={<BellRing className="h-8 w-8" />}
            className="bg-gradient-to-br from-orange-500 to-amber-600"
            onClick={() => setLocation("/notifications")}
          />
          <CommandTile
            title="Seguridad"
            note="Ayuda e incidencias"
            icon={<ShieldCheck className="h-8 w-8" />}
            className="bg-gradient-to-br from-emerald-600 to-green-700"
            onClick={() => setLocation("/passenger/security")}
          />
          <CommandTile
            title="Mi perfil"
            note="Datos y preferencias"
            icon={<UserRound className="h-8 w-8" />}
            className="bg-gradient-to-br from-slate-700 to-slate-950"
            onClick={() => setLocation("/passenger/profile")}
          />
        </div>
      </div>
    </section>
  );
}
