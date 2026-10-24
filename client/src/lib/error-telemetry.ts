import { supabase } from "@/lib/supabase";

/**
 * Telemetría ligera de errores del navegador: captura window.onerror y
 * promesas rechazadas, agrupa en lotes y las envía a
 * `system.taxiSystemHealth.logClientError` solo si hay sesión iniciada.
 * Nunca rompe la app: cualquier fallo propio se ignora.
 */

type ErrorRecord = {
  message: string;
  stack?: string;
  sourceUrl?: string;
  userAgent?: string;
};

const QUEUE: ErrorRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function flush() {
  flushTimer = null;
  if (QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, 10);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return; // anónimo: no se registra nada
    await fetch("/api/trpc/system.taxiSystemHealth.logClientError", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ json: batch }),
    });
  } catch {
    /* silencio total: la telemetría no puede generar errores */
  }
}

function enqueue(record: ErrorRecord) {
  if (QUEUE.length >= 50) return; // protección ante tormentas de errores
  // Deduplicación básica en la misma tanda.
  if (QUEUE.some((item) => item.message === record.message)) return;
  QUEUE.push(record);
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 4000);
}

export function startErrorTelemetry() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", (event) => {
    enqueue({
      message: String(event.message || "Error desconocido").slice(0, 2000),
      stack: event.error instanceof Error && event.error.stack ? String(event.error.stack).slice(0, 8000) : undefined,
      sourceUrl: `${window.location.pathname}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`.slice(0, 1000),
      userAgent: navigator.userAgent.slice(0, 500),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    enqueue({
      message: `Promesa rechazada: ${reason instanceof Error ? reason.message : String(reason ?? "sin detalle")}`.slice(0, 2000),
      stack: reason instanceof Error && reason.stack ? String(reason.stack).slice(0, 8000) : undefined,
      sourceUrl: window.location.pathname.slice(0, 1000),
      userAgent: navigator.userAgent.slice(0, 500),
    });
  });
  // Vaciado al cerrar la pestaña, si es posible.
  window.addEventListener("pagehide", () => {
    if (flushTimer) clearTimeout(flushTimer);
    void flush();
  });
}
