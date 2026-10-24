import { supabase } from "@/lib/supabase";

/**
 * Cierra la sesión real (Supabase), limpia los rastros locales de sesión y
 * envía a la pantalla de entrada. Compartido por pasajero, conductor y admin.
 */
export async function logoutAndRedirect() {
  try {
    await supabase.auth.signOut();
  } catch {
    /* la sesión local se limpia igualmente */
  }
  try {
    localStorage.removeItem("taximun_real_auth");
    localStorage.removeItem("taximun_guest_role");
    localStorage.removeItem("manus-runtime-user-info");
  } catch {}
  window.location.href = "/auth";
}
