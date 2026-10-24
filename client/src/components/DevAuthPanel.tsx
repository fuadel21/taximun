import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Car, CheckCircle2, Fuel, Loader2, ShieldCheck, UserRound } from "lucide-react";

type DemoRole = "passenger" | "driver" | "admin";

const ROLE_OPTIONS: {
  value: DemoRole;
  label: string;
  description: string;
  account: string;
  home: string;
  icon: typeof UserRound;
}[] = [
  {
    value: "passenger",
    label: "Pasajero",
    description: "Pide taxis, consulta historial y valora tus viajes.",
    account: "Laura Gil · laura@taximun.local",
    home: "/passenger",
    icon: UserRound,
  },
  {
    value: "driver",
    label: "Conductor",
    description: "Abre turno, recibe ofertas y gestiona tus servicios.",
    account: "Marc Vidal · TX-101 · Eixample",
    home: "/driver",
    icon: Fuel,
  },
  {
    value: "admin",
    label: "Administración",
    description: "Operaciones, verificación, seguridad y métricas.",
    account: "Equipo Taximun · admin@taximun.local",
    home: "/admin",
    icon: ShieldCheck,
  },
];

const DRIVER_ACCOUNTS = [
  { index: 1, name: "Marc Vidal", taxi: "TX-101", zone: "Eixample" },
  { index: 2, name: "Youssef Amrani", taxi: "TX-204", zone: "Sants" },
  { index: 3, name: "Carmen Ruiz", taxi: "TX-317", zone: "Gràcia" },
  { index: 4, name: "Pau Serra", taxi: "TX-402", zone: "Aeropuerto" },
];

/**
 * Login de desarrollo para el modo demo local (sin Supabase).
 * El backend emite una cookie de sesión por rol (auth.devLogin).
 */
export function DevAuthPanel() {
  const [role, setRole] = useState<DemoRole>("passenger");
  const [driverIndex, setDriverIndex] = useState<number>(1);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const login = trpc.auth.devLogin.useMutation({
    onSuccess: (user: any) => {
      setSuccess(`Sesión iniciada como ${user?.name ?? role}. Cargando…`);
      const option = ROLE_OPTIONS.find((o) => o.value === role);
      window.location.href = option?.home ?? "/";
    },
    onError: (err: any) => {
      setError(err?.message ?? "No se pudo iniciar la sesión demo.");
    },
  });

  const handleSubmit = () => {
    setError("");
    setSuccess("");
    login.mutate({
      role,
      name: name.trim() || undefined,
      driverIndex: role === "driver" ? driverIndex : undefined,
    });
  };

  return (
    <main className="min-h-screen bg-white text-black lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden min-h-screen flex-col justify-between bg-black p-10 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3 text-2xl font-black tracking-tight">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black">
            <Car className="h-7 w-7" />
          </span>
          Taximun
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.28em] text-zinc-400">Modo demo local</p>
          <h1 className="text-6xl font-black leading-[0.98] tracking-[-0.05em] xl:text-7xl">
            Prueba Taximun al instante.
          </h1>
          <p className="mt-6 max-w-lg text-lg font-medium leading-8 text-zinc-300">
            Sin credenciales de Supabase: los datos viven en memoria del servidor con contenido de
            demostración de Barcelona. Conecta tu Supabase real cuando quieras producción.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm font-bold text-zinc-400">
          <ShieldCheck className="h-5 w-5" /> Sesiones de desarrollo por rol
        </div>
      </section>

      <section className="flex min-h-screen flex-col justify-center bg-white px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white">
              <Car className="h-6 w-6" />
            </span>
            <span className="text-xl font-black tracking-tight">Taximun</span>
          </div>

          <h2 className="text-3xl font-black tracking-[-0.02em]">Acceso rápido</h2>
          <p className="mt-2 text-sm font-medium text-zinc-500">
            Elige un rol para entrar con la cuenta de demostración.
          </p>

          <div className="mt-8 space-y-3">
            {ROLE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                    selected
                      ? "border-black bg-black text-white shadow-lg"
                      : "border-zinc-200 bg-white text-black hover:border-zinc-400"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        selected ? "bg-white text-black" : "bg-zinc-100 text-black"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-black">{option.label}</span>
                        {selected && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                      </div>
                      <p
                        className={`mt-1 text-sm font-medium leading-5 ${
                          selected ? "text-zinc-300" : "text-zinc-500"
                        }`}
                      >
                        {option.description}
                      </p>
                      <p
                        className={`mt-2 truncate text-xs font-bold uppercase tracking-wider ${
                          selected ? "text-zinc-400" : "text-zinc-400"
                        }`}
                      >
                        {option.account}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {role === "driver" && (
            <div className="mt-4 rounded-2xl border-2 border-zinc-200 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                ¿Qué conductor eres? (recibe las ofertas de su zona)
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DRIVER_ACCOUNTS.map((driver) => {
                  const selected = driverIndex === driver.index;
                  return (
                    <button
                      key={driver.index}
                      type="button"
                      onClick={() => setDriverIndex(driver.index)}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        selected ? "border-black bg-zinc-100" : "border-zinc-100 hover:border-zinc-300"
                      }`}
                    >
                      <div className="text-sm font-black">{driver.name}</div>
                      <div className="text-xs font-bold text-zinc-500">
                        {driver.taxi} · {driver.zone}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <Label htmlFor="demo-name" className="text-sm font-bold">
              Tu nombre <span className="font-medium text-zinc-400">(opcional — crea una cuenta nueva)</span>
            </Label>
            <Input
              id="demo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Déjalo vacío para usar la cuenta demo"
              className="mt-2 h-12 rounded-xl border-2 border-zinc-200 text-base font-medium focus-visible:ring-black"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mt-4 border-black bg-zinc-50">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSubmit}
            disabled={login.isPending}
            className="mt-6 h-14 w-full rounded-xl bg-black text-base font-black tracking-wide text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {login.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>

          <p className="mt-6 text-center text-xs font-medium leading-5 text-zinc-400">
            Modo demo: los datos se reinician al reiniciar el servidor. Para producción configura
            VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
          </p>
        </div>
      </section>
    </main>
  );
}
