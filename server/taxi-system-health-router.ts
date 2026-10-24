import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
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

  /** Telemetría del navegador: registra errores no capturados de usuarios autenticados. */
  logClientError: protectedProcedure
    .input(
      z
        .array(
          z.object({
            message: z.string().min(1).max(2000),
            stack: z.string().max(8000).optional(),
            sourceUrl: z.string().max(1000).optional(),
            userAgent: z.string().max(500).optional(),
          }),
        )
        .min(1)
        .max(10),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await supabase.from("client_error_logs").insert(
          input.map((item) => ({
            user_id: ctx.user.openId,
            user_role: ctx.user.role ?? null,
            message: item.message,
            stack: item.stack ?? null,
            source_url: item.sourceUrl ?? null,
            user_agent: item.userAgent ?? null,
          })),
        );
      } catch {
        /* la telemetría nunca debe romper la app */
      }
      return { ok: true };
    }),

  /** Últimos errores del navegador pendientes de revisión (admin). */
  listClientErrors: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).default({ limit: 30 }))
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from("client_error_logs")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(input.limit);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** Marca un error del navegador como revisado. */
  resolveClientError: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("client_error_logs")
        .update({ resolved: true })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { ok: true };
    }),
});
