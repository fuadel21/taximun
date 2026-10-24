import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type RecoveryCallbackProof =
  | { kind: "pkce"; code: string }
  | { kind: "implicit"; accessToken: string; refreshToken: string };

type RecoveryVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

function captureRecoveryCallback(): RecoveryCallbackProof | null {
  if (typeof window === "undefined") return null;

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const recoveryMarker =
    search.get("recovery") === "1" ||
    search.get("type") === "recovery" ||
    hash.get("type") === "recovery";

  if (!recoveryMarker) return null;

  const code = search.get("code") || hash.get("code");
  const accessToken = search.get("access_token") || hash.get("access_token");
  const refreshToken = search.get("refresh_token") || hash.get("refresh_token");

  if (code) return { kind: "pkce", code };
  if (accessToken && refreshToken) return { kind: "implicit", accessToken, refreshToken };
  return null;
}

let capturedRecoveryProof = captureRecoveryCallback();
let recoveryVerificationPromise: Promise<RecoveryVerificationResult> | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase browser configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel."
  );
}

/**
 * Sin configuración de Supabase la app arranca en MODO DEMO LOCAL:
 * el login se resuelve con auth.devLogin (cookie de desarrollo) y este
 * cliente sustituto responde de forma inofensiva a las llamadas directas
 * de auth/storage que hacen algunos componentes.
 */
function createDemoStubClient(): any {
  const notAvailable = async () => ({
    data: null,
    error: { message: "Modo demo local: función no disponible sin Supabase." },
  });
  const noSession = async () => ({ data: { session: null }, error: null });
  return {
    auth: {
      getSession: noSession,
      getUser: notAvailable,
      refreshSession: noSession,
      signInWithPassword: notAvailable,
      signUp: notAvailable,
      signOut: async () => ({ error: null }),
      updateUser: notAvailable,
      resetPasswordForEmail: notAvailable,
      onAuthStateChange: (_cb: any) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    storage: {
      from: (_bucket: string) => ({
        upload: notAvailable,
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `local://${path}` } }),
      }),
    },
    channel: (_name: string) => ({
      on: () => ({ subscribe: (cb?: (s: string) => void) => { cb?.("SUBSCRIBED"); return {}; } }),
      subscribe: (cb?: (s: string) => void) => { cb?.("SUBSCRIBED"); return {}; },
    }),
    removeChannel: () => {},
  };
}

export const supabase: any =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: !capturedRecoveryProof,
        },
      })
    : createDemoStubClient();

export function verifyRecoveryCallback(): Promise<RecoveryVerificationResult> {
  if (recoveryVerificationPromise) return recoveryVerificationPromise;

  const proof = capturedRecoveryProof;
  if (!proof) {
    return Promise.resolve({
      ok: false,
      message: "No se encontró una prueba válida de recuperación.",
    });
  }

  recoveryVerificationPromise = (async () => {
    try {
      const result = proof.kind === "pkce"
        ? await supabase.auth.exchangeCodeForSession(proof.code)
        : await supabase.auth.setSession({
            access_token: proof.accessToken,
            refresh_token: proof.refreshToken,
          });

      if (result.error || !result.data.session) {
        return {
          ok: false,
          message: result.error?.message || "No se pudo validar la sesión de recuperación.",
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "No se pudo validar la sesión de recuperación.",
      };
    }
  })();

  return recoveryVerificationPromise;
}

export function clearRecoveryCallbackVerification() {
  capturedRecoveryProof = null;
  recoveryVerificationPromise = null;
}

export const hasSupabaseBrowserConfig = () => Boolean(supabaseUrl && supabaseAnonKey);
