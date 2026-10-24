import { Button } from "@/components/ui/button";
import { Car, Loader2, UserRound } from "lucide-react";

/**
 * Acceso rápido con las cuentas demo reales (Supabase).
 * Pensado para pruebas de la app publicada: un clic y entras sin teclear
 * credenciales. Se desactiva definiendo VITE_DEMO_LOGIN=false en el entorno
 * del frontend (Vercel) y vuelve a desplegar.
 *
 * Cuentas demo (seed scripts/seed-real-users.py):
 *   pasajero@taximun.app  · Laura Demo (pasajera)
 *   conductor@taximun.app · Pau Demo  (conductor, TX-901)
 */
export type DemoAccount = {
  id: "pasajero" | "conductor";
  email: string;
  password: string;
  label: string;
  hint: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "pasajero",
    email: "pasajero@taximun.app",
    password: "Taximun-Demo-2026",
    label: "Entrar como pasajero",
    hint: "Laura Demo · pedir taxis, historial y valoraciones",
  },
  {
    id: "conductor",
    email: "conductor@taximun.app",
    password: "Taximun-Demo-2026",
    label: "Entrar como conductor",
    hint: "Pau Demo · turno, ofertas, cola FIFO y cobros",
  },
];

export const demoLoginEnabled = import.meta.env.VITE_DEMO_LOGIN !== "false";

export function DemoQuickAccess({
  onLogin,
  busy,
  busyAccount,
}: {
  onLogin: (account: DemoAccount) => void;
  busy: boolean;
  busyAccount: string | null;
}) {
  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4">
      <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        Acceso rápido demo
      </p>
      <div className="grid gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.id}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onLogin(account)}
            className="min-h-12 w-full justify-start gap-3 rounded-xl border-zinc-300 bg-white text-sm font-black text-black hover:bg-zinc-100"
          >
            {busyAccount === account.email ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : account.id === "conductor" ? (
              <Car className="h-4 w-4" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            <span className="flex flex-col items-start leading-tight">
              {account.label}
              <span className="text-xs font-semibold text-zinc-500">{account.hint}</span>
            </span>
          </Button>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] font-medium text-zinc-400">
        Solo para pruebas · quítalo con VITE_DEMO_LOGIN=false antes de lanzar
      </p>
    </div>
  );
}
