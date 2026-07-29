import type { ReactNode } from "react";
import { Car, Clock3, Home, ShieldCheck, UserRound } from "lucide-react";

type NavItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function AppBottomNav({ items }: { items: NavItem[] }) {
  const compact = items.length > 4;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/80 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 shadow-[0_-20px_60px_rgba(15,23,42,0.18)] backdrop-blur-2xl md:hidden"
    >
      <div
        className={`mx-auto max-w-lg rounded-[2rem] bg-zinc-100/95 p-2 ${
          compact ? "flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-px-2" : "grid grid-cols-4 gap-2"
        }`}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            aria-label={item.label}
            className={`flex min-h-[4.75rem] flex-col items-center justify-center rounded-[1.5rem] px-2 py-2.5 text-xs font-black transition-all duration-200 active:scale-[0.96] ${
              compact ? "min-w-[5.25rem] flex-1 snap-start" : "w-full"
            } ${
              item.active
                ? "bg-black text-white shadow-lg"
                : "bg-white text-zinc-600 shadow-sm hover:text-black"
            }`}
          >
            <span className={`mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl ${item.active ? "bg-white/15" : "bg-zinc-100"}`}>
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
