/**
 * Ruta TEMPORAL de diagnóstico para ver en producción por qué revienta
 * /api/trpc (FUNCTION_INVOCATION_FAILED) cuando localmente funciona.
 * Devuelve: versión de Node, presencia de env vars, y el stack del error
 * al importar e invocar el handler tRPC.
 * QUITAR cuando se resuelva el incidente.
 */
export default async function handler(req: any, res: any) {
  const out: Record<string, unknown> = {
    node: process.version,
    nodeEnv: process.env.NODE_ENV,
    env: {} as Record<string, unknown>,
  };
  const envInfo = out.env as Record<string, unknown>;
  for (const k of [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_EMAILS",
    "JWT_SECRET",
  ]) {
    const v = process.env[k];
    envInfo[k] = v ? `presente (${v.length} chars, empieza ${v.slice(0, 12)}…)` : "AUSENTE";
  }
  if (typeof (process.env as any).SUPABASE_URL === "string" && (process.env as any).SUPABASE_URL.includes("://")) {
    envInfo.SUPABASE_URL_host = (process.env as any).SUPABASE_URL.replace(/^https?:\/\//, "").split("/")[0];
  }

  try {
    const mod = await import("./trpc/[...trpc]");
    out.import = "ok";
    try {
      await mod.default(req, res);
      return; // tRPC ya respondió
    } catch (e: any) {
      out.invoke = {
        error: String(e && e.message ? e.message : e),
        stack: String((e && e.stack) || "").split("\n").slice(0, 12),
      };
    }
  } catch (e: any) {
    out.import = {
      error: String(e && e.message ? e.message : e),
      stack: String((e && e.stack) || "").split("\n").slice(0, 12),
    };
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(out, null, 2));
}
