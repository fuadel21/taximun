import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

export const taxiSystemHealthRouter = router({
  run: adminProcedure.query(async () => {
    const startedAt = Date.now();
    const { data, error } = await supabase.rpc("taximun_system_health");

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `No se pudo ejecutar el diagnóstico: ${error.message}`,
      });
    }

    return {
      ...(data as Record<string, unknown>),
      api: {
        ok: true,
        message: "API tRPC operativa",
        latencyMs: Date.now() - startedAt,
      },
    };
  }),
});
