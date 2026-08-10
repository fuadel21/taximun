import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  clearRecoveryCallbackVerification,
  hasSupabaseBrowserConfig,
  supabase,
  verifyRecoveryCallback,
} from "@/lib/supabase";
import { AlertCircle, ArrowLeft, ArrowRight, Car, CheckCircle2, KeyRound, Lock, Mail, ShieldCheck, UserRound, Users } from "lucide-react";

type PublicAuthRole = "passenger" | "driver";
type AuthMode = "login" | "signup" | "forgot" | "recovery";

const GUEST_ROLE_KEY = "taximun_guest_role";
const RECOVERY_RETRY_SECONDS = 60;

const clearGuest = () => {
  try {
    localStorage.removeItem(GUEST_ROLE_KEY);
    localStorage.removeItem("manus-runtime-user-info");
  } catch {}
};

function readRedirectValue(name: string) {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return search.get(name) || hash.get(name);
}

function cleanRecoveryUrl() {
  window.history.replaceState({}, document.title, "/auth");
}

function rawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return "";
}

function friendlyRecoverySendError(error: unknown) {
  const raw = rawErrorMessage(error);
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "Has solicitado demasiados correos de recuperación en poco tiempo. Espera antes de volver a intentarlo; el servicio de correo ha alcanzado temporalmente su límite.";
  }

  return raw || "No se pudo enviar el correo de recuperación.";
}

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
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);

  useEffect(() => {
    if (recoveryCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setRecoveryCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [recoveryCooldown]);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig()) return;

    let cancelled = false;
    const redirectError = readRedirectValue("error");
    const redirectDescription = readRedirectValue("error_description");
    const recoveryMarker = readRedirectValue("recovery") === "1" || readRedirectValue("type") === "recovery";

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session && !cancelled) {
        setRecoveryVerified(true);
        setMode("recovery");
        setError("");
        setSuccess("Enlace verificado. Escribe tu nueva contraseña.");
      }
    });

    if (redirectError) {
      clearRecoveryCallbackVerification();
      setRecoveryVerified(false);
      setMode("forgot");
      setError(
        redirectDescription
          ? decodeURIComponent(redirectDescription.replace(/\+/g, " "))
          : "El enlace de recuperación ha caducado, ya fue utilizado o no es válido. Solicita uno nuevo."
      );
      cleanRecoveryUrl();
    } else if (recoveryMarker) {
      setMode("recovery");
      setLoading(true);
      setSuccess("Verificando de forma segura el enlace de recuperación...");

      void verifyRecoveryCallback().then((result) => {
        if (cancelled) return;

        clearRecoveryCallbackVerification();
        if (!result.ok) {
          setRecoveryVerified(false);
          setMode("forgot");
          setSuccess("");
          setError("El enlace de recuperación ha caducado, ya fue utilizado o no es válido. Solicita uno nuevo.");
          cleanRecoveryUrl();
          setLoading(false);
          return;
        }

        setRecoveryVerified(true);
        setMode("recovery");
        setError("");
        setSuccess("Enlace verificado. Escribe tu nueva contraseña.");
        cleanRecoveryUrl();
        setLoading(false);
      });
    }

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const changeMode = (next: AuthMode) => {
    resetMessages();
    setPassword("");
    setConfirmPassword("");
    if (mode === "recovery" && next !== "recovery") {
      clearRecoveryCallbackVerification();
      setRecoveryVerified(false);
      void supabase.auth.signOut({ scope: "local" });
      cleanRecoveryUrl();
    }
    setMode(next);
  };

  const redirectByServerRole = async () => {
    clearGuest();
    await supabase.auth.refreshSession();
    window.location.href = "/";
  };

  const validateConfig = () => {
    if (!hasSupabaseBrowserConfig()) {
      setError("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.");
      return false;
    }
    return true;
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!validateConfig()) return;
    if (recoveryCooldown > 0) {
      setError(`Espera ${recoveryCooldown} segundos antes de solicitar otro enlace.`);
      return;
    }
    if (!email.trim()) {
      setError("Introduce el correo de tu cuenta.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth?recovery=1`,
      });
      if (resetError) throw resetError;
      setRecoveryCooldown(RECOVERY_RETRY_SECONDS);
      setSuccess("Te hemos enviado un enlace para cambiar la contraseña. Revisa también la carpeta de spam.");
    } catch (err) {
      const message = friendlyRecoverySendError(err);
      if (message.includes("demasiados correos")) {
        setRecoveryCooldown(RECOVERY_RETRY_SECONDS);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    resetMessages();
    if (!validateConfig()) return;
    if (!recoveryVerified) {
      setError("Este enlace de recuperación no está verificado. Solicita uno nuevo.");
      return;
    }
    if (!password || !confirmPassword) {
      setError("Escribe y confirma la nueva contraseña.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setRecoveryVerified(false);
        throw new Error("El enlace ha caducado o no es válido. Solicita uno nuevo.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error("La contraseña se actualizó, pero no se pudo cerrar la sesión de recuperación. Vuelve a intentarlo antes de salir de esta pantalla.");
      }

      const { data: remainingSession } = await supabase.auth.getSession();
      if (remainingSession.session) {
        throw new Error("La contraseña se actualizó, pero la sesión sigue abierta. Cierra la sesión manualmente antes de continuar.");
      }

      clearRecoveryCallbackVerification();
      setRecoveryVerified(false);
      cleanRecoveryUrl();
      setPassword("");
      setConfirmPassword("");
      setMode("login");
      setSuccess("Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    resetMessages();
    if (!validateConfig()) return;
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
      clearRecoveryCallbackVerification();
      setRecoveryVerified(false);
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

  const isStandardAuth = mode === "login" || mode === "signup";
  const title = mode === "login" ? "Bienvenido" : mode === "signup" ? "Crear cuenta" : mode === "forgot" ? "Recuperar contraseña" : "Nueva contraseña";
  const subtitle = mode === "login"
    ? "Introduce tus datos para continuar."
    : mode === "signup"
      ? "Elige tu tipo de cuenta y completa el registro."
      : mode === "forgot"
        ? "Te enviaremos un enlace seguro a tu correo."
        : "Crea una contraseña nueva para volver a entrar.";

  const forgotButtonLabel = recoveryCooldown > 0
    ? `Reintentar en ${recoveryCooldown}s`
    : "Enviar enlace";

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

          {!isStandardAuth && (
            <button type="button" onClick={() => changeMode("login")} className="mb-6 flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm font-black text-zinc-600">
              <ArrowLeft className="h-5 w-5" /> Volver a iniciar sesión
            </button>
          )}

          <h2 className="text-4xl font-black tracking-[-0.04em]">{title}</h2>
          <p className="mt-2 text-base font-medium text-zinc-500">{subtitle}</p>

          {isStandardAuth && (
            <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1.5">
              <button type="button" onClick={() => changeMode("login")} className={`min-h-12 rounded-xl px-4 text-sm font-black transition ${mode === "login" ? "bg-white text-black shadow-sm" : "text-zinc-500"}`}>Iniciar sesión</button>
              <button type="button" onClick={() => changeMode("signup")} className={`min-h-12 rounded-xl px-4 text-sm font-black transition ${mode === "signup" ? "bg-white text-black shadow-sm" : "text-zinc-500"}`}>Registrarse</button>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <RoleButton active={role === "passenger"} onClick={() => setRole("passenger")} icon={<Users className="h-7 w-7" />} label="Pasajero" />
                <RoleButton active={role === "driver"} onClick={() => setRole("driver")} icon={<Car className="h-7 w-7" />} label="Conductor" />
              </div>
            )}

            {mode === "signup" && <AuthField label="Nombre" icon={<UserRound className="h-5 w-5" />}><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}
            {mode !== "recovery" && <AuthField label="Correo" icon={<Mail className="h-5 w-5" />}><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="correo@ejemplo.com" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}
            {(mode === "login" || mode === "signup" || mode === "recovery") && <AuthField label={mode === "recovery" ? "Nueva contraseña" : "Contraseña"} icon={mode === "recovery" ? <KeyRound className="h-5 w-5" /> : <Lock className="h-5 w-5" />}><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "recovery" ? "new-password" : mode === "login" ? "current-password" : "new-password"} placeholder={mode === "recovery" ? "Nueva contraseña" : "Contraseña"} className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}
            {(mode === "signup" || mode === "recovery") && <AuthField label={mode === "recovery" ? "Confirmar nueva contraseña" : "Confirmar contraseña"} icon={<Lock className="h-5 w-5" />}><Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Confirmar contraseña" className="h-14 rounded-xl border-0 bg-zinc-100 pl-12 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-black" /></AuthField>}

            {mode === "login" && (
              <button type="button" onClick={() => changeMode("forgot")} className="flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-black text-black underline decoration-2 underline-offset-4">
                ¿Has olvidado tu contraseña?
              </button>
            )}

            {error && <Alert className="rounded-xl border-red-200 bg-red-50 text-red-700"><AlertCircle className="h-5 w-5" /><AlertDescription className="font-semibold">{error}</AlertDescription></Alert>}
            {success && <Alert className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 className="h-5 w-5" /><AlertDescription className="font-semibold">{success}</AlertDescription></Alert>}

            <Button
              onClick={mode === "forgot" ? handleForgotPassword : mode === "recovery" ? handleUpdatePassword : handleSubmit}
              disabled={loading || (mode === "recovery" && !recoveryVerified) || (mode === "forgot" && recoveryCooldown > 0)}
              className="min-h-14 w-full rounded-xl bg-black text-base font-black text-white hover:bg-zinc-800"
            >
              {loading ? "Procesando..." : mode === "login" ? "Continuar" : mode === "signup" ? "Crear cuenta" : mode === "forgot" ? forgotButtonLabel : recoveryVerified ? "Guardar nueva contraseña" : "Verificando enlace..."}
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
