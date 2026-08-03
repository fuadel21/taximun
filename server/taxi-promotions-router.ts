import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const categorySchema = z.enum(["standard", "comfort", "van", "accessible"]);
const promotionSchema = z.object({
  code: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive().max(10000),
  maxDiscount: z.number().positive().max(10000).nullable().optional(),
  minimumSubtotal: z.number().min(0).max(10000).default(0),
  eligibleCategories: z.array(categorySchema).min(1).default(["standard", "comfort", "van", "accessible"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  maxTotalUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().max(100).default(1),
  active: z.boolean().default(true),
});

function fail(error: { message: string; code?: string } | null) {
  if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Ya existe una promoción con ese código." });
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiPromotionsRouter = router({
  list: adminProcedure.query(async () => {
    const { data: promotions, error } = await supabase.from("taxi_promotions").select("*").order("created_at", { ascending: false }).limit(100);
    fail(error);
    const { data: usage, error: usageError } = await supabase.from("taxi_promotion_redemptions").select("promotion_id,discount_amount");
    fail(usageError);
    const totals = new Map<string, { uses: number; discount: number }>();
    for (const row of usage || []) {
      const current = totals.get(row.promotion_id) || { uses: 0, discount: 0 };
      current.uses += 1;
      current.discount += Number(row.discount_amount || 0);
      totals.set(row.promotion_id, current);
    }
    return (promotions || []).map((promotion) => ({ ...promotion, usage: totals.get(promotion.id) || { uses: 0, discount: 0 } }));
  }),

  create: adminProcedure.input(promotionSchema).mutation(async ({ ctx, input }) => {
    if (input.discountType === "percent" && input.discountValue > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "El porcentaje no puede superar el 100 %." });
    const { data, error } = await supabase.from("taxi_promotions").insert({
      code: input.code, name: input.name, description: input.description || null, discount_type: input.discountType,
      discount_value: input.discountValue, max_discount: input.maxDiscount ?? null, minimum_subtotal: input.minimumSubtotal,
      eligible_categories: input.eligibleCategories, starts_at: input.startsAt, ends_at: input.endsAt ?? null,
      max_total_uses: input.maxTotalUses ?? null, max_uses_per_user: input.maxUsesPerUser, active: input.active, created_by: ctx.user.openId,
    }).select().single();
    fail(error); return data;
  }),

  setActive: adminProcedure.input(z.object({ id: z.string().uuid(), active: z.boolean() })).mutation(async ({ input }) => {
    const { data, error } = await supabase.from("taxi_promotions").update({ active: input.active, updated_at: new Date().toISOString() }).eq("id", input.id).select().maybeSingle();
    fail(error); if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Promoción no encontrada." }); return data;
  }),
});
