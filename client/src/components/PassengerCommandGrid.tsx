import type { ReactNode } from "react";
import { BellRing, Car, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";

type CommandTileProps = {
  title: string;
  note: string;
  icon: ReactNode;
  featured?: boolean;
  onClick: () => void;
};

function CommandTile({ title, note, icon, featured = false, onClick }: CommandTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[10rem] flex-col items-start justify-between rounded-3xl border p-5 text-left transition-all duration-200 active:scale-[0.98] ${featured ? "border-black bg-black text-white shadow-xl" : "border-zinc-200 bg-white text-black shadow-sm hover:border-zinc-400"}`}
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${featured ? "bg-white text-black" : "bg-zinc-100 text-black"}`}>{icon}</span>
      <span>
        <span className="block text-xl font-black tracking-tight">{title}</span>
        <span className={`mt-1 block text-sm font-semibold ${featured ? "text-zinc-300" : "text-zinc-500"}`}>{note}</span>
      </span>
    </button>
  );
}

export function PassengerCommandGrid() {
  const [, setLocation] = useLocation();

  return (
    <section className="bg-white px-4 pt-5">
      <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-1 sm:p-3">
        <div className="mb-5">
          <p className="text-sm font-black text-zinc-500">Taximun Pasajero</p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.04em] text-black">¿A dónde vamos?</h2>
          <p className="mt-2 text-sm font-semibold text-zinc-500">Accesos grandes y directos para gestionar tu viaje.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CommandTile featured title="Mi viaje" note="Estado, conductor y recorrido" icon={<Car className="h-8 w-8" />} onClick={() => setLocation("/passenger/rides")} />
          <CommandTile title="Avisos" note="Mensajes y novedades" icon={<BellRing className="h-8 w-8" />} onClick={() => setLocation("/notifications")} />
          <CommandTile title="Seguridad" note="Ayuda e incidencias" icon={<ShieldCheck className="h-8 w-8" />} onClick={() => setLocation("/passenger/security")} />
          <CommandTile title="Mi perfil" note="Datos y preferencias" icon={<UserRound className="h-8 w-8" />} onClick={() => setLocation("/passenger/profile")} />
        </div>
      </div>
    </section>
  );
}
