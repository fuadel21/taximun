import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function PassengerCancelledCardRelease({
  rideId,
  rideStatus,
  paymentMethod,
}: {
  rideId: string;
  rideStatus: string;
  paymentMethod?: string | null;
}) {
  const eligible = paymentMethod === "card" && ["cancelled", "rejected"].includes(rideStatus);
  const paymentQuery = trpc.system.taxiPayments.getForRide.useQuery(
    { rideId },
    { enabled: eligible, retry: false }
  );
  const release = trpc.system.taxiCardPayments.releaseAuthorization.useMutation({
    onSuccess: async () => {
      await paymentQuery.refetch();
    },
  });

  if (!eligible || paymentQuery.isLoading) return null;
  if (paymentQuery.error) {
    return <div className="rounded-3xl bg-red-50 p-4 text-sm font-bold text-red-700">No se pudo comprobar el estado de la retención: {paymentQuery.error.message}</div>;
  }

  const payment = paymentQuery.data as any;
  if (!payment) return null;
  const status = String(payment.status || "");
  const needsRelease = ["pending", "authorized"].includes(status);

  if (!needsRelease) {
    if (["cancelled", "failed", "refunded"].includes(status) || payment.provider === "internal_zero_fare") {
      return (
        <div className="rounded-3xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="mr-2 inline h-5 w-5" />No queda ninguna retención de tarjeta pendiente para este viaje.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-black text-amber-900"><AlertTriangle className="mr-2 inline h-5 w-5" />Retención de tarjeta pendiente</p>
      <p className="mt-1 text-sm font-semibold text-amber-800">El viaje está cancelado, pero Stripe todavía conserva una autorización pendiente. Puedes intentar liberarla ahora.</p>
      {release.error && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-red-700">{release.error.message}</p>}
      <Button
        type="button"
        variant="outline"
        disabled={release.isPending}
        onClick={() => release.mutate({ rideId })}
        className="mt-3 h-14 w-full rounded-2xl bg-white font-black"
      >
        {release.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
        Liberar retención
      </Button>
    </div>
  );
}
