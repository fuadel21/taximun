import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { invalidateTariffCache, invalidateTariffZoneCache } from "./barcelona-tariff";
import { supabase } from "./supabase-client";

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administración puede gestionar las tarifas." });
  }
}

const money = z.number().min(0).max(500);
const factor = z.number().min(0.5).max(3);

const tariffUpdateSchema = z.object({
  closedPriceMode: z.enum(["T3", "T1T2"]),
  t1FlagDrop: money,
  t1PerKm: z.number().min(0).max(10),
  t2FlagDrop: money,
  t2PerKm: z.number().min(0).max(10),
  t3DayFlagDrop: money,
  t3DayPerKm: z.number().min(0).max(10),
  t3DayPerMinute: z.number().min(0).max(10),
  t3NightFlagDrop: money,
  t3NightPerKm: z.number().min(0).max(10),
  t3NightPerMinute: z.number().min(0).max(10),
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
  closedPriceMode: "closed_price_mode",
  t3DayFlagDrop: "t3_day_flag_drop",
  t3DayPerKm: "t3_day_per_km",
  t3DayPerMinute: "t3_day_per_minute",
  t3NightFlagDrop: "t3_night_flag_drop",
  t3NightPerKm: "t3_night_per_km",
  t3NightPerMinute: "t3_night_per_minute",
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

  /** Zonas geográficas que activan suplementos (editables en el mapa). */
  listZones: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const { data, error } = await supabase.from("taxi_tariff_zones").select("*").order("supplement_code").order("id");
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? [];
  }),

  upsertZone: protectedProcedure
    .input(
      z.object({
        id: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "Usa minúsculas, números y guiones"),
        label: z.string().trim().min(2).max(80),
        supplementCode: z.enum(["airport", "moll_adossat", "fira", "sants"]),
        appliesTo: z.enum(["origin", "destination", "both"]),
        centerLat: z.number().min(-90).max(90),
        centerLng: z.number().min(-180).max(180),
        radiusMeters: z.number().int().min(50).max(10000),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const row = {
        id: input.id,
        label: input.label,
        supplement_code: input.supplementCode,
        applies_to: input.appliesTo,
        center_lat: input.centerLat,
        center_lng: input.centerLng,
        radius_meters: input.radiusMeters,
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("taxi_tariff_zones").upsert(row, { onConflict: "id" }).select().single();
      if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message || "No se pudo guardar la zona." });
      invalidateTariffZoneCache();
      return data;
    }),

  deleteZone: protectedProcedure
    .input(z.object({ id: z.string().trim().min(2).max(60) }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const { error } = await supabase.from("taxi_tariff_zones").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      invalidateTariffZoneCache();
      return { ok: true };
    }),
});
