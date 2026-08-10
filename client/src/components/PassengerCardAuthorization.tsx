import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { loadStripeBrowser, type StripeCardElement, type StripeClient } from "@/lib/stripe-browser";

function moneyFromCents(value: unknown) {
  return `${(Number(value || 0) / 100).toFixed(2)} €`;
}

function statusText(status?: string | null) {
  if (status === "authorized") return "Tarjeta autorizada";
  if (status === "captured") return "Pago capturado";
  if (status === "cancelled") return "Autorización liberada";
  if (status === "refunded") return "Pago reembolsado";
  if (status === "partially_refunded") return "Reembolso parcial";
  if (status === "failed") return "Pago fallido";
  return "Autorización pendiente";
}

export function PassengerCardAuthorization() {
  const utils = trpc.useUtils();
  const rideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
  });
  const ride = rideQuery.data as any;
  const isCardRide = Boolean(ride?.id && ride?.payment_method === "card" && ["pending", "assigned", "in_progress"].includes(String(ride?.status)));

  const configQuery = trpc.system.taxiCardPayments.getClientConfig.useQuery(undefined, {
    enabled: isCardRide,
    retry: false,
    staleTime: 60_000,
  });
  const paymentQuery = trpc.system.taxiPayments.getForRide.useQuery(
    { rideId: ride?.id || "00000000-0000-0000-0000-000000000000" },
    { enabled: isCardRide, retry: false, refetchInterval: 5000 }
  );

  const createAuthorization = trpc.system.taxiPayments.createAuthorization.useMutation();
  const syncAuthorization = trpc.system.taxiCardPayments.syncAuthorization.useMutation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stripe, setStripe] = useState<StripeClient | null>(null);
  const cardHostRef = useRef<HTMLDivElement | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const syncingRideRef = useRef<string | null>(null);

  const payment = paymentQuery.data as any;
  const authorized = payment?.status === "authorized";
  const zeroValidated = payment?.status === "captured" && Number(payment?.amount_authorized || 0) === 0;
  const ready = authorized || zeroValidated;
  const busy = createAuthorization.isPending || syncAuthorization.isPending;

  useEffect(() => {
    if (!isCardRide || payment?.status !== "pending" || syncingRideRef.current === ride.id) return;
    syncingRideRef.current = ride.id;
    void syncAuthorization.mutateAsync({ rideId: ride.id })
      .then(async () => {
        await paymentQuery.refetch();
      })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => {
          if (syncingRideRef.current === ride.id) syncingRideRef.current = null;
        }, 4000);
      });
  }, [isCardRide, payment?.status, ride?.id]);

  useEffect(() => {
    if (!open || !configQuery.data?.publishableKey || !cardHostRef.current || cardElementRef.current) return;
    let cancelled = false;

    void loadStripeBrowser(configQuery.data.publishableKey)
      .then((client) => {
        if (cancelled || !cardHostRef.current) return;
        setStripe(client);
        const element = client.elements().create("card", {
          hidePostalCode: true,
          style: {
            base: {
              fontSize: "17px",
              color: "#111111",
              fontFamily: "system-ui, sans-serif",
              "::placeholder": { color: "#71717a" },
            },
          },
        });
        cardElementRef.current = element;
        element.mount(cardHostRef.current);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar Stripe."));

    return () => {
      cancelled = true;
      cardElementRef.current?.unmount();
      cardElementRef.current?.destroy?.();
      cardElementRef.current = null;
      setStripe(null);
    };
  }, [open, configQuery.data?.publishableKey]);

  if (!isCardRide) return null;

  const authorize = async () => {
    setError("");
    setMessage("");
    if (!ride?.id) return;
    if (!configQuery.data?.configured || !configQuery.data.publishableKey) {
      setError("El pago con tarjeta todavía no está configurado en el servidor.");
      return;
    }
    if (!stripe || !cardElementRef.current) {
      setError("El formulario seguro de Stripe todavía se está cargando.");
      return;
    }

    try {
      const authorization = await createAuthorization.mutateAsync({ rideId: ride.id });
      if (Number((authorization as any)?.amount_authorized || 0) === 0 && (authorization as any)?.status === "captured") {
        setMessage("El viaje queda en 0 €. No hace falta retener ningún importe en la tarjeta.");
        await paymentQuery.refetch();
        setOpen(false);
        return;
      }

      const clientSecret = (authorization as any)?.client_secret;
      if (!clientSecret) throw new Error("Stripe no devolvió una autorización utilizable.");

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElementRef.current },
      });
      if (result.error) throw new Error(result.error.message || "Stripe no pudo autorizar la tarjeta.");
      if (result.paymentIntent?.status !== "requires_capture") {
        throw new Error("La tarjeta no quedó en estado de autorización pendiente de captura.");
      }

      await syncAuthorization.mutateAsync({ rideId: ride.id });
      await Promise.all([
        paymentQuery.refetch(),
        utils.system.taxiOps.passenger.getCurrentRide.invalidate(),
      ]);
      setMessage("Tarjeta autorizada. El importe solo se capturará al finalizar el viaje.");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autorizar la tarjeta.");
      await paymentQuery.refetch();
    }
  };

  return (
    <section className="px-4 pt-4">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${ready ? "bg-emerald-100 text-emerald-700" : "bg-black text-white"}`}>
              {ready ? <CheckCircle2 className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
            </span>
            <div>
              <p className="text-sm font-black text-zinc-500">Pago del viaje</p>
              <h2 className="text-xl font-black">{statusText(payment?.status)}</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">
                {ready
                  ? `Autorizado: ${moneyFromCents(payment?.amount_authorized)}. La captura se hace al cerrar el servicio.`
                  : "Autoriza la tarjeta antes de que el conductor pueda iniciar el viaje."}
              </p>
            </div>
          </div>
          <ShieldCheck className="h-6 w-6 shrink-0 text-zinc-400" />
        </div>

        {message && <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
        {(error || configQuery.error || paymentQuery.error) && (
          <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
            <AlertCircle className="mr-2 inline h-5 w-5" />
            {error || configQuery.error?.message || paymentQuery.error?.message}
          </div>
        )}

        {!ready && !open && (
          <Button
            type="button"
            onClick={() => { setError(""); setMessage(""); setOpen(true); }}
            className="mt-4 h-14 w-full rounded-2xl bg-black font-black text-white"
          >
            <CreditCard className="mr-2 h-5 w-5" />Autorizar tarjeta
          </Button>
        )}

        {!ready && open && (
          <div className="mt-4 space-y-3 rounded-3xl bg-zinc-100 p-4">
            <p className="text-sm font-black">Datos de tarjeta</p>
            <div ref={cardHostRef} className="min-h-14 rounded-2xl bg-white px-4 py-4 shadow-sm" />
            <p className="text-xs font-bold text-zinc-500">Los datos de la tarjeta se envían directamente a Stripe y no se guardan en Taximun.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy} className="h-14 rounded-2xl bg-white font-black">Cancelar</Button>
              <Button type="button" onClick={authorize} disabled={busy || !stripe} className="h-14 rounded-2xl bg-black font-black text-white">
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
                Autorizar
              </Button>
            </div>
          </div>
        )}

        {payment?.status === "pending" && (
          <Button
            type="button"
            variant="outline"
            disabled={syncAuthorization.isPending}
            onClick={async () => {
              setError("");
              try {
                await syncAuthorization.mutateAsync({ rideId: ride.id });
                await paymentQuery.refetch();
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo comprobar Stripe.");
              }
            }}
            className="mt-3 h-12 w-full rounded-2xl bg-white font-black"
          >
            {syncAuthorization.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Comprobar autorización
          </Button>
        )}
      </div>
    </section>
  );
}
