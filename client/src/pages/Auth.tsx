import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { hasSupabaseBrowserConfig, supabase } from "@/lib/supabase";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Car,
  CheckCircle2,
  Clock3,
  Languages,
  Lock,
  Mail,
  Phone,
  Shield,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from "lucide-react";

type AuthRole = "passenger" | "driver" | "admin";
type AuthMode = "login" | "signup";

const roleCards: Array<{
  value: AuthRole;
  icon: typeof Users;
  title: string;
  description: string;
  gradient: string;
}> = [
  {
    value: "passenger",
    icon: Users,
    title: "Pasajero",
    description: "Pide tu taxi en segundos",
    gradient: "from-sky-500 to-cyan-400",
  },
  {
    value: "driver",
    icon: Car,
    title: "Conductor",
    description: "Gestiona servicios y estado",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    value: "admin",
    icon: Shield,
    title: "Admin",
    description: "Solo cuentas autorizadas",
    gradient: "from-indigo-500 to-violet-500",
  },
];

const trustItems = [
  { icon: BadgeCheck, label: "Seguro" },
  { icon: Zap, label: "Rápido" },
  { icon: Clock3, label: "En tiempo real" },
];

const routeForRole = (role: AuthRole) => {
  if (role === "driver") return "/driver";
  if (role === "admin") return "/admin";
  return "/passenger";
};

const publicSignupRole = (role: AuthRole) => (role === "admin" ? "passenger" : role);

export default function Auth() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const setRoleMutation = trpc.auth.setRole.useMutation();
  const [selectedRole, setSelectedRole] = useState<AuthRole>("passenger");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"es" | "ca" | "en">("es");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRoleCard = useMemo(
    () => roleCards.find((role) => role.value === selectedRole) ?? roleCards[0],
    [selectedRole]
  );
  const SelectedRoleIcon = selectedRoleCard.icon;

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = "/";
    }
  }, [isAuthenticated]);

  const syncRoleAndRedirect = async (role: AuthRole) => {
    const roleToSync = publicSignupRole(role);

    if (role === "admin") {
      setSuccess("Sesión iniciada. El acceso admin requiere que la cuenta esté autorizada en el backend.");
      await utils.auth.me.invalidate();
      window.location.href = routeForRole(role);
      return;
    }

    await setRoleMutation.mutateAsync({
      role: roleToSync,
      language,
      phoneNumber: phone || undefined,
    });
    await utils.auth.me.invalidate();
    window.location.href = routeForRole(roleToSync);
  };

  const ensureSupabaseConfig = () => {
    if (!hasSupabaseBrowserConfig()) {
      setError("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.");
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    setError("");
    setSuccess("");

    if (!ensureSupabaseConfig()) return;
    if (!email || !password) {
      setError(t.errors.requiredField);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      await syncRoleAndRedirect(selectedRole);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    setError("");
    setSuccess("");

    if (!ensureSupabaseConfig()) return;
    if (!name || !email || !password || !confirmPassword) {
      setError(t.errors.requiredField);
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errors.passwordMismatch);
      return;
    }

    setIsSubmitting(true);
    try {
      const signupRole = publicSignupRole(selectedRole);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
            role: signupRole,
            language,
          },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session) {
        setSuccess("Cuenta creada. Revisa tu correo para confirmar el acceso antes de iniciar sesión.");
        setMode("login");
        return;
      }

      await syncRoleAndRedirect(signupRole);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.20),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.18),_transparent_36%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_48%,_#f8fbff_100%)] px-4 py-6 text-slate-950 sm:px-6">
      <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-28 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-white/60 blur-2xl" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col items-center justify-center gap-6 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
        <div className="w-full max-w-md text-center lg:text-left">
          <div className="mx-auto mb-5 inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:mx-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
              <Car className="h-6 w-6" />
            </span>
            <div className="text-left">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-700">Taximun</p>
              <p className="text-xs font-medium text-slate-500">Movilidad municipal inteligente</p>
            </div>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Tu taxi,
            <span className="block bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
              más cerca.
            </span>
          </h1>

          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            Una experiencia más clara, rápida y moderna para pasajeros, conductores y administración.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-3xl border border-white/70 bg-white/65 p-3 text-center shadow-[0_14px_34px_rgba(15,23,42,0.07)] backdrop-blur-xl"
                >
                  <Icon className="mx-auto mb-2 h-5 w-5 text-cyan-600" />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full max-w-xl">
          <div className="relative rounded-[2rem] border border-white/70 bg-white/80 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-2xl sm:p-6">
            <div className="absolute -top-4 right-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-xl shadow-slate-950/20">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              App 2026
            </div>

            <div className="mb-6 rounded-[1.5rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-2xl shadow-blue-950/25">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-200">Bienvenido a Taximun</p>
                  <h2 className="mt-1 text-3xl font-black tracking-tight">
                    {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {mode === "login"
                      ? "Accede a tu panel con Supabase Auth."
                      : "Crea tu perfil y activa el acceso seguro."}
                  </p>
                </div>
                <div className={`rounded-3xl bg-gradient-to-br ${selectedRoleCard.gradient} p-3 shadow-lg shadow-cyan-500/20`}>
                  <SelectedRoleIcon className="h-7 w-7" />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label className="text-base font-black text-slate-900">Elige tu perfil</Label>
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 ring-1 ring-cyan-100">
                    {selectedRoleCard.title}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {roleCards.map((role) => {
                    const Icon = role.icon;
                    const active = selectedRole === role.value;

                    return (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => setSelectedRole(role.value)}
                        className={`group relative overflow-hidden rounded-3xl border p-3 text-left transition-all duration-300 sm:p-4 ${
                          active
                            ? "border-cyan-400 bg-gradient-to-br from-cyan-50 to-blue-50 shadow-[0_18px_45px_rgba(6,182,212,0.18)]"
                            : "border-slate-200 bg-white/70 shadow-sm hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-lg"
                        }`}
                      >
                        <div
                          className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg transition-transform group-hover:scale-105 bg-gradient-to-br ${role.gradient}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-black text-slate-950">{role.title}</p>
                        <p className="mt-1 hidden text-xs leading-4 text-slate-500 sm:block">{role.description}</p>
                        {active && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-cyan-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 rounded-2xl bg-slate-100/90 p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setSuccess("");
                  }}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${
                    mode === "login"
                      ? "bg-white text-slate-950 shadow-[0_10px_25px_rgba(15,23,42,0.10)]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setSuccess("");
                  }}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${
                    mode === "signup"
                      ? "bg-white text-slate-950 shadow-[0_10px_25px_rgba(15,23,42,0.10)]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Registrarse
                </button>
              </div>

              <div className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="font-bold text-slate-800">
                      {t.auth.name}
                    </Label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Nombre completo"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-14 rounded-2xl border-slate-200 bg-white/90 pl-12 text-base shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-cyan-400"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="auth-email" className="font-bold text-slate-800">
                    {t.auth.email}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="auth-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-14 rounded-2xl border-slate-200 bg-white/90 pl-12 text-base shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-cyan-400"
                    />
                  </div>
                </div>

                {mode === "signup" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone" className="font-bold text-slate-800">
                        {t.auth.phone}
                      </Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="signup-phone"
                          type="tel"
                          placeholder="+34 600 000 000"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="h-14 rounded-2xl border-slate-200 bg-white/90 pl-12 text-base shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-cyan-400"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-language" className="font-bold text-slate-800">
                        {t.auth.language}
                      </Label>
                      <Select value={language} onValueChange={(value: "es" | "ca" | "en") => setLanguage(value)}>
                        <SelectTrigger
                          id="signup-language"
                          className="h-14 rounded-2xl border-slate-200 bg-white/90 px-4 text-base shadow-sm focus:ring-2 focus:ring-cyan-400"
                        >
                          <div className="flex items-center gap-3">
                            <Languages className="h-5 w-5 text-slate-400" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="ca">Català</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="auth-password" className="font-bold text-slate-800">
                    {t.auth.password}
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="auth-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-14 rounded-2xl border-slate-200 bg-white/90 pl-12 text-base shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-cyan-400"
                    />
                  </div>
                </div>

                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm" className="font-bold text-slate-800">
                      {t.auth.confirmPassword}
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-confirm"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-14 rounded-2xl border-slate-200 bg-white/90 pl-12 text-base shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-cyan-400"
                      />
                    </div>
                  </div>
                )}
              </div>

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

              <Button
                onClick={mode === "login" ? handleLogin : handleSignup}
                disabled={isSubmitting || setRoleMutation.isPending}
                className="group h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-base font-black text-white shadow-[0_18px_45px_rgba(37,99,235,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(37,99,235,0.34)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting || setRoleMutation.isPending
                  ? "Procesando..."
                  : mode === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>

              <div className="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-cyan-500 p-2 text-white shadow-lg shadow-cyan-500/20">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900">Acceso con Supabase Auth</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Ya no necesitas Manus OAuth. Solo configura las variables públicas de Supabase en Vercel.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs font-semibold text-slate-500">
            © 2026 Taximun · Plataforma municipal de movilidad inteligente
          </p>
        </div>
      </section>
    </main>
  );
}
