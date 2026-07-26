import type { ReactNode } from "react";
import { Car, Clock3, Home, ShieldCheck, UserRound } from "lucide-react";

type NavItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function AppBottomNav({ items }: { items: NavItem[] }) {
  const columns = items.length > 4 ? "grid-cols-3" : "grid-cols-4";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/80 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 shadow-[0_-20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl md:hidden">
      <div className={`mx-auto grid max-w-lg ${columns} gap-2 rounded-[2rem] bg-slate-100/90 p-2`}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`flex min-h-[5.25rem] flex-col items-center justify-center rounded-[1.5rem] px-2 py-3 text-xs font-black transition-all duration-200 active:scale-[0.96] ${
              item.active
                ? "bg-slate-950 text-white shadow-xl shadow-slate-950/25"
                : "bg-white text-slate-600 shadow-sm hover:-translate-y-0.5 hover:text-slate-950 hover:shadow-md"
            }`}
          >
            <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-2xl ${item.active ? "bg-white/15" : "bg-slate-100"}`}>
              {item.icon}
            </span>
            <span className="leading-tight">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export const passengerNavItems = (active: "home" | "ride" | "security" | "history") => [
  { label: "Inicio", active: active === "home", icon: <Home className="h-6 w-6" /> },
  { label: "Viaje", active: active === "ride", icon: <Car className="h-6 w-6" /> },
  { label: "Seguro", active: active === "security", icon: <ShieldCheck className="h-6 w-6" /> },
  { label: "Historial", active: active === "history", icon: <Clock3 className="h-6 w-6" /> },
];

export const driverNavItems = (active: "home" | "requests" | "security" | "profile") => [
  { label: "Turno", active: active === "home", icon: <Home className="h-6 w-6" /> },
  { label: "Servicios", active: active === "requests", icon: <Car className="h-6 w-6" /> },
  { label: "Seguro", active: active === "security", icon: <ShieldCheck className="h-6 w-6" /> },
  { label: "Perfil", active: active === "profile", icon: <UserRound className="h-6 w-6" /> },
];
