import { LogOut, Settings, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { logoutAndRedirect } from "@/lib/logout";

type HomeTopBarProps = {
  brand: string;
  subtitle: string;
  /** Ruta de ajustes/perfil; si no se pasa, se muestra salida directa (admin). */
  settingsPath?: string;
  settingsLabel?: string;
};

/**
 * Barra superior fija de las pantallas de inicio: marca, ajustes rápidos y,
 * cuando no hay página de perfil (admin), cierre de sesión directo.
 */
export function HomeTopBar({ brand, subtitle, settingsPath, settingsLabel = "Ajustes" }: HomeTopBarProps) {
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black text-sm font-black text-white">Tx</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight text-black">{brand}</p>
            <p className="truncate text-[11px] font-bold leading-tight text-zinc-500">{subtitle}</p>
          </div>
        </div>
        {settingsPath ? (
          <button
            type="button"
            onClick={() => setLocation(settingsPath)}
            aria-label={settingsLabel}
            title={settingsLabel}
            className="flex h-11 items-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-black text-black shadow-sm transition active:scale-[0.97] hover:border-black/30"
          >
            <Settings className="h-5 w-5" />
            <span className="hidden sm:inline">{settingsLabel}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void logoutAndRedirect()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex h-11 items-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-black text-black shadow-sm transition active:scale-[0.97] hover:border-black/30"
          >
            <UserRound className="h-5 w-5" />
            <span className="hidden sm:inline">Sesión</span>
            <LogOut className="h-5 w-5 text-red-600" />
          </button>
        )}
      </div>
    </header>
  );
}
