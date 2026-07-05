import { z } from "zod";
import { adminControlRouter } from "../admin-control-router";
import { taxiOpsRouter } from "../taxi-ops-router";
import { taxiProfilesRouter } from "../taxi-profiles-router";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  adminControl: adminControlRouter,
  taxiOps: taxiOpsRouter,
  taxiProfiles: taxiProfilesRouter,

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
