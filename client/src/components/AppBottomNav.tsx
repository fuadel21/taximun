import type { ReactNode } from "react";
import { Car, Clock3, Home, ShieldCheck, UserRound } from "lucide-react";

type NavItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function AppBottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/80 bg-white/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2 shadow-[0_-18px_55px_rgba(15,23,42,0.14)] backdrop-blur-2xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.6rem] bg-slate-100/80 p-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`flex flex-col items-center justify-center rounded-[1.25rem] px-2 py-2 text-[11px] font-black transition active:scale-95 ${
              item.active
                ? "bg-slate-950 text-white shadow-lg shadow-slate-950/20"
                : "text-slate-500 hover:bg-white hover:text-slate-950"
            }`}
          >
            <span className="mb-1 flex h-5 w-5 items-center justify-center">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export const passengerNavItems = (active: "home" | "ride" | "security" | "history") => [
  { label: "Inicio", active: active === "home", icon: <Home className="h-5 w-5" /> },
  { label: "Viaje", active: active === "ride", icon: <Car className="h-5 w-5" /> },
  { label: "Seguro", active: active === "security", icon: <ShieldCheck className="h-5 w-5" /> },
  { label: "Historial", active: active === "history", icon: <Clock3 className="h-5 w-5" /> },
];

export const driverNavItems = (active: "home" | "requests" | "security" | "profile") => [
  { label: "Turno", active: active === "home", icon: <Home className="h-5 w-5" /> },
  { label: "Servicios", active: active === "requests", icon: <Car className="h-5 w-5" /> },
  { label: "Seguro", active: active === "security", icon: <ShieldCheck className="h-5 w-5" /> },
  { label: "Perfil", active: active === "profile", icon: <UserRound className="h-5 w-5" /> },
];
