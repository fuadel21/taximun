import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

const adminControlProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

const driverStatusSchema = z.enum(["available", "busy", "pause", "offline"]);
const taxiStatusSchema = z.enum(["available", "busy", "maintenance", "offline"]);
const incidentLevelSchema = z.enum(["low", "medium", "high"]);

async function writeAdminLog(message: string) {
  await supabase.from("admin_activity_logs").insert({ message });
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

export const adminControlRouter = router({
  getSnapshot: adminControlProcedure.query(async () => {
    const [driversResult, taxisResult, incidentsResult, logsResult] = await Promise.all([
      supabase.from("admin_drivers").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_taxis").select("*").order("created_at", { ascending: false }),
      supabase
        .from("admin_incidents")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("admin_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    throwIfSupabaseError(driversResult.error);
    throwIfSupabaseError(taxisResult.error);
    throwIfSupabaseError(incidentsResult.error);
    throwIfSupabaseError(logsResult.error);

    return {
      drivers: driversResult.data || [],
      taxis: taxisResult.data || [],
      incidents: incidentsResult.data || [],
      logs: logsResult.data || [],
    };
  }),

  createDriver: adminControlProcedure
    .input(
      z.object({
        name: z.string().min(2),
        taxiCode: z.string().min(2),
        zone: z.string().min(2).default("Centro"),
      })
    )
    .mutation(async ({ input }) => {
      const { data, error } = await supabase
        .from("admin_drivers")
        .insert({
          name: input.name,
          taxi_code: input.taxiCode,
          zone: input.zone,
          status: "available",
          rating: 5,
          rides_today: 0,
          wait_label: "Nuevo",
        })
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog(`Alta de conductor: ${input.name}`);
      return data;
    }),

  updateDriverStatus: adminControlProcedure
    .input(z.object({ id: z.string().uuid(), status: driverStatusSchema }))
    .mutation(async ({ input }) => {
      const waitLabel =
        input.status === "available"
          ? "2 min"
          : input.status === "busy"
            ? "En viaje"
            : input.status === "pause"
              ? "Pausa"
              : "Offline";

      const { data, error } = await supabase
        .from("admin_drivers")
        .update({ status: input.status, wait_label: waitLabel })
        .eq("id", input.id)
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog("Estado de conductor actualizado");
      return data;
    }),

  createTaxi: adminControlProcedure
    .input(
      z.object({
        taxiCode: z.string().min(2),
        plate: z.string().min(2),
        driverName: z.string().min(2).default("Sin asignar"),
        model: z.string().min(2).default("Vehículo pendiente"),
      })
    )
    .mutation(async ({ input }) => {
      const { data, error } = await supabase
        .from("admin_taxis")
        .insert({
          taxi_code: input.taxiCode,
          plate: input.plate,
          driver_name: input.driverName,
          model: input.model,
          status: "available",
        })
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog(`Taxi añadido: ${input.taxiCode}`);
      return data;
    }),

  updateTaxiStatus: adminControlProcedure
    .input(z.object({ id: z.string().uuid(), status: taxiStatusSchema }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabase
        .from("admin_taxis")
        .update({ status: input.status })
        .eq("id", input.id)
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog("Estado de taxi actualizado");
      return data;
    }),

  createIncident: adminControlProcedure
    .input(
      z.object({
        type: z.string().min(2),
        body: z.string().min(2),
        level: incidentLevelSchema.default("medium"),
      })
    )
    .mutation(async ({ input }) => {
      const code = `I-${Date.now().toString().slice(-6)}`;
      const { data, error } = await supabase
        .from("admin_incidents")
        .insert({ code, type: input.type, body: input.body, level: input.level })
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog(`Incidencia creada: ${code}`);
      return data;
    }),

  resolveIncident: adminControlProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabase
        .from("admin_incidents")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();

      throwIfSupabaseError(error);
      await writeAdminLog("Incidencia resuelta");
      return data;
    }),

  createLog: adminControlProcedure
    .input(z.object({ message: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const { data, error } = await supabase
        .from("admin_activity_logs")
        .insert({ message: input.message })
        .select()
        .single();

      throwIfSupabaseError(error);
      return data;
    }),
});
