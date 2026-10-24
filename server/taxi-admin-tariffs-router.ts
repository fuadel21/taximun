import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { invalidateTariffCache } from "./barcelona-tariff";
import { supabase } from "./supabase-client";

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede gestionar las tarifas." });
  }
}

const money = z.number().min(0).max(500);
const factor = z.number().min(0.5).max(3);

const tariffUpdateSchema = z.object({
  t1FlagDrop: money,
  t1PerKm: z.number().min(0).max(10),
  t2FlagDrop: money,
  t2PerKm: z.number().min(0).max(10),
  waitingPerHour: money,
  supAirport: money,
  supMollAdossat: money,
  supFiraOrigen: money,
  supSantsOrigen: money,
  supLargeVehicle: money,
  supSpecialNight: money,
  minAirportTotal: money,
  minAppService: money,
  maxSupplements: money,
  t4FlatPortAirport: money,
  serviceFee: money,
  comfortMultiplier: factor,
  roadFactor: factor,
});

/** Columnas de la tabla taxi_tariff_config en snake_case. */
const COLUMN_MAP: Record<keyof z.infer<typeof tariffUpdateSchema>, string> = {
  t1FlagDrop: "t1_flag_drop",
  t1PerKm: "t1_per_km",
  t2FlagDrop: "t2_flag_drop",
  t2PerKm: "t2_per_km",
  waitingPerHour: "waiting_per_hour",
  supAirport: "sup_airport",
  supMollAdossat: "sup_moll_adossat",
  supFiraOrigen: "sup_fira_origen",
  supSantsOrigen: "sup_sants_origen",
  supLargeVehicle: "sup_large_vehicle",
  supSpecialNight: "sup_special_night",
  minAirportTotal: "min_airport_total",
  minAppService: "min_app_service",
  maxSupplements: "max_supplements",
  t4FlatPortAirport: "t4_flat_port_airport",
  serviceFee: "service_fee",
  comfortMultiplier: "comfort_multiplier",
  roadFactor: "road_factor",
};

export const taxiAdminTariffsRouter = router({
  /** Configuración vigente de la tarifa oficial AMB (editable). */
  get: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const { data, error } = await supabase.from("taxi_tariff_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "No existe la fila de configuración de tarifas (id=1)." });
    return { config: data as Record<string, unknown>, updatedAt: (data as any).updated_at ?? null };
  }),

  /** Actualiza los importes de la tarifa y refresca la caché del motor de precios. */
  update: protectedProcedure.input(tariffUpdateSchema).mutation(async ({ ctx, input }) => {
    assertAdmin(ctx);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.user?.name || "admin" };
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const column = (COLUMN_MAP as Record<string, string>)[key];
      if (!column) throw new TRPCError({ code: "BAD_REQUEST", message: `Campo de tarifa desconocido: ${key}` });
      patch[column] = value;
    }
    const { data, error } = await supabase.from("taxi_tariff_config").update(patch).eq("id", 1).select().single();
    if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message || "No se pudo guardar la tarifa." });
    invalidateTariffCache();
    return { config: data as Record<string, unknown>, updatedAt: (data as any).updated_at ?? null };
  }),
});
