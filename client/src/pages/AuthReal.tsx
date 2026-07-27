import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasSupabaseBrowserConfig, supabase } from "@/lib/supabase";
import { AlertCircle, ArrowRight, Car, CheckCircle2, Lock, Mail, ShieldCheck, UserRound, Users } from "lucide-react";

type PublicAuthRole = "passenger" | "driver";
type AuthMode = "login" | "signup";

const GUEST_ROLE_KEY = "taximun_guest_role";

const clearGuest = () => {
  try {
    localStorage.removeItem(GUEST_ROLE_KEY);
    localStorage.removeItem("manus-runtime-user-info");
  } catch {}
};

export default function AuthReal() {
  const [role, setRole] = useState<PublicAuthRole>("passenger");
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectByServerRole = async () => {
    clearGuest();
    await supabase.auth.refreshSession();
    window.location.href = "/";
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!hasSupabaseBrowserConfig()) {
      setError("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.");
      return;
    }
    if (!email || !password) {
      setError("Introduce correo y contraseña.");
      return;
    }
    if (mode === "signup" && !name) {
      setError("Introduce tu nombre.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      clearGuest();
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await redirectByServerRole();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role }, emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setSuccess("Cuenta creada. Revisa tu correo y después inicia sesión.");
        setMode("login");
        return;
      }
      await redirectByServerRole();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el acceso.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-black lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden min-h-screen flex-col justify-between bg-black p-10 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3 text-2xl font-black tracking-tight">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black"><Car className="h-7 w-7" /></span>
          Taximun
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.28em] text-zinc-400">Movilidad simple</p>
          <h1 className="text-6xl font-black leading-[0.98] tracking-[-0.05em] xl:text-7xl">Muévete con claridad.</h1>
          <p className="mt-6 max-w-lg text-lg font-medium leading-8 text-zinc-300">Accede a viajes, turnos y operaciones desde una experiencia directa, segura y fácil de usar.</p>
        </div>
        <div className="flex items-center gap-3 text-sm font-bold text-zinc-400"><ShieldCheck className="h-5 w-5" /> Acceso protegido con Supabase</div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white"><Car className="h-6 w-6" /></span>
            <span className="text-2xl font-black">Taximun</span>
          </div>

          <h2 className="text-4xl font-black tracking-[-0.04em]">{mode === "login" ? "Bienvenido" : "Crear cuenta"}</h2>
          <p className="mt-2 text-base font-medium text-zinc-500">{mode === "login" ? "Introduce tus datos para continuar." : "Elige tu tipo de cuenta y completa el registro."}</p>

          <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1.5">
            <button type="button" onClick={() => setMode("login")} className={`min-h-12 rounded-xl px-4 text-sm font-black transition ${mode === "login" ? "bg-white text-black shadow-sm" : "text-zinc-500"}`}>Iniciar sesión</button>
            <button type="button" onClick={() => setMode("signup")} className={`min-h-12 rounded-xl px-4 text-sm font-black transition ${mode === "signup" ? "bg-white text-black shadow-sm" : "text-zinc-500"}`}>Registrarse</button>
          </div>

          <div className="mt-6 space-y-5">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <RoleButton active={role === "passenger"} onClick={() => setRole("passenger")} icon={<Users className="h-7 w-7" />} label="Pasajero" />
                <RoleButton active={role === "driver"} onClick={() => setRole("driver")} icon={<Car className="h-7 w-7" />} label="Conductor" />
              </div>
            )}

            {mode === "signup" && <AuthField label="Nombre" icon={<UserRound className="h-5 w-5" />}><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}
            <AuthField label="Correo" icon={<Mail className="h-5 w-5" />}><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="correo@ejemplo.com" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>
            <AuthField label="Contraseña" icon={<Lock className="h-5 w-5" />}><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Contraseña" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>
            {mode === "signup" && <AuthField label="Confirmar contraseña" icon={<Lock className="h-5 w-5" />}><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Confirmar contraseña" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}

            {error && <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5" /><AlertDescription className="font-semibold">{error}</AlertDescription></Alert>}
            {success && <Alert className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 className="h-5 w-5" /><AlertDescription className="font-semibold">{success}</AlertDescription></Alert>}

            <Button onClick={handleSubmit} disabled={loading} className="min-h-14 w-full rounded-xl bg-black text-base font-black text-white hover:bg-zinc-800">
              {loading ? "Procesando..." : mode === "login" ? "Continuar" : "Crear cuenta"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return <div className="space-y-2"><Label className="text-sm font-black">{label}</Label><div className="relative"><span className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-zinc-500">{icon}</span>{children}</div></div>;
}

function RoleButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 p-4 text-base font-black transition active:scale-[0.98] ${active ? "border-black bg-black text-white" : "border-zinc-200 bg-white text-black hover:border-zinc-400"}`}><span className="mb-2">{icon}</span>{label}</button>;
}
