import type { ReactNode } from "react";
import { ArrowLeft, Home } from "lucide-react";
import { useLocation } from "wouter";

type PremiumInternalHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  homePath: string;
  icon?: ReactNode;
  tone?: "light" | "dark";
};

export function PremiumInternalHeader({ eyebrow, title, description, homePath, icon, tone = "light" }: PremiumInternalHeaderProps) {
  const [, setLocation] = useLocation();
  const dark = tone === "dark";

  return (
    <section className={dark ? "bg-black px-4 pt-5 text-white" : "bg-[#f3f3f3] px-4 pt-5 text-black"}>
      <div className={`mx-auto max-w-7xl rounded-[2rem] border p-5 shadow-lg sm:p-6 ${dark ? "border-white/10 bg-[#111]" : "border-black/5 bg-white"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-black uppercase tracking-[0.24em] ${dark ? "text-white/55" : "text-black/45"}`}>{eyebrow}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
            <p className={`mt-2 max-w-2xl text-sm font-semibold leading-6 ${dark ? "text-white/60" : "text-black/55"}`}>{description}</p>
          </div>
          {icon && <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${dark ? "bg-white text-black" : "bg-black text-white"}`}>{icon}</div>}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
          <button type="button" onClick={() => window.history.back()} className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl border px-4 font-black transition active:scale-[0.97] ${dark ? "border-white/15 bg-[#1c1c1c] text-white" : "border-black/10 bg-[#eeeeee] text-black"}`}>
            <ArrowLeft className="h-5 w-5" /> Volver
          </button>
          <button type="button" onClick={() => setLocation(homePath)} className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl px-4 font-black transition active:scale-[0.97] ${dark ? "bg-white text-black" : "bg-black text-white"}`}>
            <Home className="h-5 w-5" /> Inicio
          </button>
        </div>
      </div>
    </section>
  );
}
