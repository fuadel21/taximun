import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

type CancellationReason =
  | "changed_mind"
  | "wait_too_long"
  | "wrong_pickup"
  | "driver_delay"
  | "duplicate_request"
  | "other";

const reasons: Array<{ id: CancellationReason; label: string }> = [
  { id: "changed_mind", label: "He cambiado de opinión" },
  { id: "wait_too_long", label: "La espera es demasiado larga" },
  { id: "wrong_pickup", label: "El punto de recogida es incorrecto" },
  { id: "driver_delay", label: "El conductor lleva retraso" },
  { id: "duplicate_request", label: "He pedido el viaje dos veces" },
  { id: "other", label: "Otro motivo" },
];

export function PassengerSafeCancellationCard() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason>("changed_mind");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const rideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 4000,
  });

  const cancelMutation = trpc.system.taxiPassengerCancellation.cancel.useMutation({
    onSuccess: async (result) => {
      const release = (result as any)?.payment_release;
      if (release?.released === false) {
        setMessage(`Viaje cancelado. La retención de tarjeta sigue pendiente de liberar: ${release.message || "vuelve a comprobarlo más tarde."}`);
        setOpen(true);
      } else if (release?.status === "cancelled") {
        setMessage("Viaje cancelado y retención de tarjeta liberada correctamente.");
        setOpen(true);
      } else {
        setMessage("Viaje cancelado correctamente.");
        setOpen(true);
      }
      setNote("");
      await Promise.all([
        utils.system.taxiOps.passenger.getCurrentRide.invalidate(),
        utils.system.taxiOps.passenger.getRideHistory.invalidate(),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });

  const ride = rideQuery.data;
  const canCancel = ride?.status === "pending" || ride?.status === "assigned";

  if (!canCancel && !message) return null;

  return (
    <section className="bg-[#f7f8fb] px-4 pt-4">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-red-100 bg-white shadow-xl">
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setOpen((value) => !value);
            }}
            className="flex min-h-[7rem] w-full items-center justify-between gap-4 bg-gradient-to-br from-red-600 to-rose-700 p-5 text-left text-white transition active:scale-[0.99]"
          >
            <span className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] bg-white/15 shadow-inner">
                <XCircle className="h-8 w-8" />
              </span>
              <span>
                <span className="block text-xl font-black">Cancelar viaje</span>
                <span className="mt-1 block text-sm font-bold text-white/80">Indica el motivo para dejar constancia.</span>
              </span>
            </span>
            <ChevronDown className={`h-6 w-6 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}

        {(open || message) && (
          <div className="space-y-4 p-5">
            {canCancel && (
              <>
                <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                  <AlertTriangle className="mr-2 inline h-5 w-5" />
                  Solo puedes cancelar antes de que el viaje haya comenzado.
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {reasons.map((item) => {
                    const active = reason === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setReason(item.id)}
                        className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-left text-sm font-black transition active:scale-[0.98] ${
                          active
                            ? "border-red-600 bg-red-50 text-red-800"
                            : "border-slate-100 bg-white text-slate-700 hover:border-slate-200"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">Nota opcional</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    rows={3}
                    className="w-full resize-none rounded-2xl border-2 border-slate-100 bg-slate-50 p-4 text-base font-semibold outline-none transition focus:border-red-300 focus:bg-white"
                    placeholder="Añade algún detalle para administración o soporte."
                  />
                </label>
              </>
            )}

            {message && <p className="rounded-2xl bg-slate-100 p-3 text-sm font-bold text-slate-700">{message}</p>}

            {canCancel && (
              <Button
                type="button"
                variant="destructive"
                size="lg"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  if (!ride?.id) return;
                  setMessage("");
                  cancelMutation.mutate({ rideId: ride.id, reason, note: note.trim() || undefined });
                }}
                className="w-full"
              >
                {cancelMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
                Confirmar cancelación
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
