import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const taxiSafetyAuditRouter = router({
  listRecent: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional())
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from("taxi_safety_report_events")
        .select("id,report_id,ride_id,event_type,previous_status,new_status,actor_id,actor_role,note,created_at")
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 200);
      throwIfSupabaseError(error);
      return data ?? [];
    }),

  getReportTimeline: adminProcedure
    .input(z.object({ reportId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [{ data: report, error: reportError }, { data: events, error: eventsError }] = await Promise.all([
        supabase.from("taxi_safety_reports").select("*").eq("id", input.reportId).single(),
        supabase
          .from("taxi_safety_report_events")
          .select("*")
          .eq("report_id", input.reportId)
          .order("created_at", { ascending: true }),
      ]);
      throwIfSupabaseError(reportError);
      throwIfSupabaseError(eventsError);
      return { report, events: events ?? [] };
    }),

  summary: adminProcedure.query(async () => {
    const { data, error } = await supabase
      .from("taxi_safety_report_events")
      .select("event_type,new_status,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    throwIfSupabaseError(error);
    const rows = data ?? [];
    const criticalCreated = rows.filter((row) => row.event_type === "sos_created" || row.event_type === "sos_imported").length;
    const resolved = rows.filter((row) => row.event_type === "status_changed" && row.new_status === "resolved").length;
    return { totalEvents: rows.length, criticalCreated, resolved, latestAt: rows[0]?.created_at ?? null };
  }),
});
