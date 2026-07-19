import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { supabase } from "./supabase-client";

type StepStatus = "ok" | "warning" | "error" | "pending";

type JourneyStep = {
  key: string;
  title: string;
  status: StepStatus;
  message: string;
  details?: Record<string, unknown>;
};

function step(
  key: string,
  title: string,
  status: StepStatus,
  message: string,
  details?: Record<string, unknown>,
): JourneyStep {
  return { key, title, status, message, ...(details ? { details } : {}) };
}

async function countByRide(table: string, rideId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("ride_id", rideId);

  if (error) return { ok: false as const, count: 0, error: error.message };
  return { ok: true as const, count: count ?? 0, error: null };
}

export const taxiJourneyValidationRouter = router({
  run: adminProcedure
    .input(z.object({ rideId: z.string().uuid().optional() }).optional())
    .query(async ({ input }) => {
      const startedAt = Date.now();
      let rideQuery = supabase.from("taxi_rides").select("*");

      if (input?.rideId) {
        rideQuery = rideQuery.eq("id", input.rideId);
      } else {
        rideQuery = rideQuery.order("created_at", { ascending: false }).limit(1);
      }

      const { data: rides, error: rideError } = await rideQuery;
      const ride = rides?.[0] ?? null;

      if (rideError || !ride) {
        return {
          checkedAt: new Date().toISOString(),
          ride: null,
          summary: { ok: 0, warning: 0, error: 1, pending: 0, total: 1 },
          steps: [
            step(
              "ride",
              "Solicitud de viaje",
              "error",
              rideError?.message || "No hay ningún viaje disponible para validar.",
            ),
          ],
          latencyMs: Date.now() - startedAt,
        };
      }

      const rideId = String(ride.id);
      const status = String(ride.status ?? "unknown");
      const steps: JourneyStep[] = [];

      steps.push(
        step("ride", "Solicitud de viaje", "ok", "El viaje existe y puede auditarse.", {
          rideId,
          status,
          createdAt: ride.created_at,
        }),
      );

      const routeReady =
        Number.isFinite(Number(ride.pickup_lat)) &&
        Number.isFinite(Number(ride.pickup_lng)) &&
        Number.isFinite(Number(ride.dropoff_lat)) &&
        Number.isFinite(Number(ride.dropoff_lng));
      const fareReady = Number(ride.estimated_fare ?? 0) > 0 || Number(ride.final_fare ?? 0) > 0;
      steps.push(
        step(
          "route",
          "Ruta y tarifa",
          routeReady && fareReady ? "ok" : routeReady ? "warning" : "error",
          routeReady && fareReady
            ? "La ruta y la tarifa están registradas."
            : !routeReady
              ? "Faltan coordenadas de origen o destino."
              : "La ruta existe, pero no hay una tarifa válida.",
          { estimatedFare: ride.estimated_fare, finalFare: ride.final_fare },
        ),
      );

      const offers = await countByRide("taxi_ride_offers", rideId);
      const assigned = Boolean(ride.driver_id);
      steps.push(
        step(
          "dispatch",
          "Asignación del conductor",
          assigned ? "ok" : offers.ok && offers.count > 0 ? "warning" : status === "pending" ? "pending" : "error",
          assigned
            ? "El viaje tiene un conductor asignado."
            : offers.ok && offers.count > 0
              ? `Hay ${offers.count} oferta(s), pero todavía no se ha consolidado la asignación.`
              : offers.ok
                ? "El viaje sigue pendiente y no tiene ofertas activas."
                : `No se pudo revisar la asignación: ${offers.error}`,
          { driverId: ride.driver_id, offers: offers.count },
        ),
      );

      if (assigned) {
        const { data: driverStatus, error } = await supabase
          .from("driver_live_status")
          .select("driver_id,status,current_lat,current_lng,updated_at")
          .eq("driver_id", ride.driver_id)
          .maybeSingle();
        steps.push(
          step(
            "driver",
            "Conductor y GPS",
            error ? "error" : driverStatus ? "ok" : "warning",
            error
              ? `No se pudo leer el estado del conductor: ${error.message}`
              : driverStatus
                ? "El conductor tiene estado operativo y posición disponible."
                : "El conductor está asignado, pero no tiene estado en tiempo real.",
            driverStatus ?? undefined,
          ),
        );
      } else {
        steps.push(step("driver", "Conductor y GPS", "pending", "Pendiente hasta que exista una asignación."));
      }

      const arrived = Boolean(ride.driver_arrived_at);
      steps.push(
        step(
          "arrival",
          "Llegada a recogida",
          arrived ? "ok" : ["completed", "in_progress"].includes(status) ? "warning" : "pending",
          arrived
            ? "La llegada del conductor quedó registrada."
            : ["completed", "in_progress"].includes(status)
              ? "El viaje avanzó sin registrar explícitamente la llegada."
              : "Pendiente de llegada del conductor.",
        ),
      );

      const started = Boolean(ride.started_at) || status === "in_progress" || status === "completed";
      steps.push(
        step(
          "start",
          "Inicio del viaje",
          started ? "ok" : assigned ? "pending" : "pending",
          started ? "El inicio del viaje quedó registrado." : "Pendiente de inicio.",
        ),
      );

      const chat = await countByRide("taxi_trip_messages", rideId);
      steps.push(
        step(
          "chat",
          "Chat pasajero-conductor",
          !chat.ok ? "error" : chat.count > 0 ? "ok" : "warning",
          !chat.ok
            ? `No se pudo revisar el chat: ${chat.error}`
            : chat.count > 0
              ? `El viaje tiene ${chat.count} mensaje(s).`
              : "El canal existe, pero todavía no se ha usado en este viaje.",
        ),
      );

      const calls = await countByRide("taxi_trip_call_requests", rideId);
      steps.push(
        step(
          "call",
          "Llamada de voz",
          !calls.ok ? "error" : calls.count > 0 ? "ok" : "warning",
          !calls.ok
            ? `No se pudo revisar la llamada: ${calls.error}`
            : calls.count > 0
              ? `Hay ${calls.count} solicitud(es) de llamada registradas.`
              : "No se ha probado una llamada en este viaje.",
        ),
      );

      const safety = await countByRide("taxi_safety_reports", rideId);
      steps.push(
        step(
          "safety",
          "Seguridad y SOS",
          !safety.ok ? "error" : safety.count > 0 ? "ok" : "warning",
          !safety.ok
            ? `No se pudo revisar seguridad: ${safety.error}`
            : safety.count > 0
              ? `Hay ${safety.count} evento(s) de seguridad registrados.`
              : "No hay eventos SOS en este viaje; la infraestructura está disponible.",
        ),
      );

      const completed = status === "completed" && Boolean(ride.completed_at);
      const settled = completed && Number(ride.final_fare ?? 0) >= 0 && Boolean(ride.payment_status);
      steps.push(
        step(
          "settlement",
          "Finalización y cobro",
          settled ? "ok" : completed ? "warning" : "pending",
          settled
            ? `Viaje cerrado con pago ${ride.payment_status}.`
            : completed
              ? "El viaje está completado, pero faltan datos de liquidación."
              : "Pendiente de finalizar y liquidar.",
          {
            finalFare: ride.final_fare,
            paymentMethod: ride.payment_method,
            paymentStatus: ride.payment_status,
          },
        ),
      );

      const notifications = await countByRide("taxi_notifications", rideId);
      steps.push(
        step(
          "notifications",
          "Notificaciones",
          !notifications.ok ? "error" : notifications.count > 0 ? "ok" : "warning",
          !notifications.ok
            ? `No se pudieron revisar las notificaciones: ${notifications.error}`
            : notifications.count > 0
              ? `Se registraron ${notifications.count} notificación(es) vinculadas al viaje.`
              : "No hay notificaciones vinculadas directamente a este viaje.",
        ),
      );

      const ratings = await countByRide("taxi_ride_ratings", rideId);
      steps.push(
        step(
          "rating",
          "Valoración final",
          !ratings.ok ? "error" : ratings.count > 0 ? "ok" : completed ? "warning" : "pending",
          !ratings.ok
            ? `No se pudo revisar la valoración: ${ratings.error}`
            : ratings.count > 0
              ? `El viaje tiene ${ratings.count} valoración(es).`
              : completed
                ? "El viaje terminó, pero todavía no se ha valorado."
                : "Pendiente hasta finalizar el viaje.",
        ),
      );

      const logs = await countByRide("taxi_activity_logs", rideId);
      steps.push(
        step(
          "audit",
          "Registro de actividad",
          !logs.ok ? "error" : logs.count > 0 ? "ok" : "warning",
          !logs.ok
            ? `No se pudo revisar la auditoría: ${logs.error}`
            : logs.count > 0
              ? `Hay ${logs.count} evento(s) en el historial del viaje.`
              : "El viaje no tiene eventos en el registro de actividad.",
        ),
      );

      const summary = steps.reduce(
        (acc, current) => {
          acc[current.status] += 1;
          acc.total += 1;
          return acc;
        },
        { ok: 0, warning: 0, error: 0, pending: 0, total: 0 },
      );

      return {
        checkedAt: new Date().toISOString(),
        ride: {
          id: rideId,
          status,
          passengerId: ride.passenger_id,
          driverId: ride.driver_id,
          pickupAddress: ride.pickup_address,
          dropoffAddress: ride.dropoff_address,
          createdAt: ride.created_at,
        },
        summary,
        steps,
        latencyMs: Date.now() - startedAt,
      };
    }),
});
