import { ArrowLeft, Home, SearchX } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-white">
      <section className="w-full max-w-2xl rounded-[2.25rem] border border-white/10 bg-[#111] p-6 shadow-2xl sm:p-10">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-black">
          <SearchX className="h-10 w-10" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.28em] text-white/45">Error 404</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Esta página no existe</h1>
        <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-white/60">
          El enlace puede estar incompleto, haber caducado o apuntar a una sección que ya no está disponible.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex min-h-20 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#1c1c1c] px-4 font-black transition active:scale-[0.97]"
          >
            <ArrowLeft className="h-5 w-5" /> Volver
          </button>
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="flex min-h-20 items-center justify-center gap-2 rounded-2xl bg-white px-4 font-black text-black transition active:scale-[0.97]"
          >
            <Home className="h-5 w-5" /> Inicio
          </button>
        </div>
      </section>
    </main>
  );
}
