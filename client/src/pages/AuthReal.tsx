import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasSupabaseBrowserConfig, supabase } from "@/lib/supabase";
import { AlertCircle, ArrowRight, Car, CheckCircle2, Lock, Mail, Shield, UserRound, Users } from "lucide-react";

type AuthRole = "passenger" | "driver" | "admin";
type AuthMode = "login" | "signup";

const GUEST_ROLE_KEY = "taximun_guest_role";

const routeForRole = (role: AuthRole) => {
  if (role === "driver") return "/driver";
  if (role === "admin") return "/admin";
  return "/passenger";
};

const safePublicRole = (role: AuthRole) => (role === "admin" ? "passenger" : role);

const clearGuest = () => {
  try {
    localStorage.removeItem(GUEST_ROLE_KEY);
    localStorage.removeItem("manus-runtime-user-info");
  } catch {}
};

export default function AuthReal() {
  const [role, setRole] = useState<AuthRole>("passenger");
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const finish = async (selectedRole: AuthRole) => {
    clearGuest();
    if (selectedRole !== "admin") {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          role: selectedRole,
          name: name || undefined,
        },
      });
      if (updateError) throw updateError;
    }
    await supabase.auth.refreshSession();
    window.location.href = routeForRole(selectedRole);
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
      const publicRole = safePublicRole(role);

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await finish(role === "admin" ? "admin" : publicRole);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role: publicRole,
          },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        setSuccess("Cuenta creada. Revisa tu correo y después inicia sesión.");
        setMode("login");
        return;
      }

      await finish(publicRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el acceso.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.20),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_52%,_#ffffff_100%)] px-4 py-8 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-6 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-lg backdrop-blur-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
              <Car className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-700">Taximun</p>
              <p className="text-xs font-medium text-slate-500">Acceso real Supabase</p>
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Entra a tu panel real</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            Pasajeros y conductores usan datos reales en Supabase. Ya no se usa el endpoint antiguo de roles.
          </p>
        </div>

        <Card className="border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-black">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</CardTitle>
            <CardDescription>Selecciona tu perfil y accede con correo y contraseña.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <RoleButton active={role === "passenger"} onClick={() => setRole("passenger")} icon={<Users className="h-5 w-5" />} label="Pasajero" />
              <RoleButton active={role === "driver"} onClick={() => setRole("driver")} icon={<Car className="h-5 w-5" />} label="Conductor" />
              <RoleButton active={role === "admin"} onClick={() => setRole("admin")} icon={<Shield className="h-5 w-5" />} label="Admin" />
            </div>

            <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button type="button" onClick={() => setMode("login")} className={`rounded-xl px-4 py-3 text-sm font-black ${mode === "login" ? "bg-white text-slate-950 shadow" : "text-slate-500"}`}>Iniciar sesión</button>
              <button type="button" onClick={() => setMode("signup")} className={`rounded-xl px-4 py-3 text-sm font-black ${mode === "signup" ? "bg-white text-slate-950 shadow" : "text-slate-500"}`}>Registrarse</button>
            </div>

            {mode === "signup" && (
              <div className="space-y-2">
                <Label className="font-bold">Nombre</Label>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" className="h-14 rounded-2xl pl-12" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-bold">Correo</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="correo@ejemplo.com" className="h-14 rounded-2xl pl-12" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Contraseña" className="h-14 rounded-2xl pl-12" />
              </div>
            </div>

            {mode === "signup" && (
              <div className="space-y-2">
                <Label className="font-bold">Confirmar contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Confirmar contraseña" className="h-14 rounded-2xl pl-12" />
                </div>
              </div>
            )}

            {error && (
              <Alert className="rounded-2xl border-red-200 bg-red-50 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <AlertDescription className="font-semibold">{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="rounded-2xl border-cyan-200 bg-cyan-50 text-cyan-800">
                <CheckCircle2 className="h-5 w-5" />
                <AlertDescription className="font-semibold">{success}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleSubmit} disabled={loading} className="h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-black text-white">
              {loading ? "Procesando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function RoleButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-3 text-sm font-black transition ${active ? "border-cyan-400 bg-cyan-50 text-cyan-800 shadow" : "border-slate-200 bg-white text-slate-700"}`}
    >
      <span className="mb-2 flex justify-center">{icon}</span>
      {label}
    </button>
  );
}
