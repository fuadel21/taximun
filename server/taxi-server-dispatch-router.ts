import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { runServerDispatchCycle } from "./taxi-server-dispatch";

export const taxiServerDispatchRouter = router({
  ensure: protectedProcedure
    .input(
      z
        .object({
          maxDrivers: z.number().int().min(1).max(30).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return runServerDispatchCycle({ maxDrivers: input?.maxDrivers ?? 12 });
    }),

  adminRun: adminProcedure
    .input(
      z
        .object({
          maxDrivers: z.number().int().min(1).max(100).optional(),
          staleAfterSeconds: z.number().int().min(30).max(900).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return runServerDispatchCycle({
        maxDrivers: input?.maxDrivers ?? 30,
        staleAfterSeconds: input?.staleAfterSeconds ?? 120,
      });
    }),
});
