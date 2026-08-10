import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const RECOVERY_CALLBACK_KEY = "taximun_verified_recovery_callback";

export type RecoveryCallbackProof =
  | { kind: "pkce"; code: string }
  | { kind: "implicit"; accessToken: string; refreshToken: string };

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

  let proof: RecoveryCallbackProof | null = null;
  if (code) {
    proof = { kind: "pkce", code };
  } else if (accessToken && refreshToken) {
    proof = { kind: "implicit", accessToken, refreshToken };
  }

  if (!proof) return null;

  try {
    sessionStorage.setItem(RECOVERY_CALLBACK_KEY, JSON.stringify(proof));
  } catch {
    return null;
  }

  if (window.location.pathname !== "/auth") {
    window.history.replaceState(
      {},
      document.title,
      `/auth${window.location.search}${window.location.hash}`
    );
  }

  return proof;
}

const capturedRecoveryProof = captureRecoveryCallback();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase browser configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !capturedRecoveryProof,
  },
});

export function takeRecoveryCallbackProof(): RecoveryCallbackProof | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(RECOVERY_CALLBACK_KEY);
    sessionStorage.removeItem(RECOVERY_CALLBACK_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RecoveryCallbackProof;
    if (parsed?.kind === "pkce" && typeof parsed.code === "string" && parsed.code.length > 0) {
      return parsed;
    }
    if (
      parsed?.kind === "implicit" &&
      typeof parsed.accessToken === "string" && parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === "string" && parsed.refreshToken.length > 0
    ) {
      return parsed;
    }
  } catch {
    // Invalid or inaccessible session storage is treated as no recovery proof.
  }

  return null;
}

export const hasSupabaseBrowserConfig = () => Boolean(supabaseUrl && supabaseAnonKey);