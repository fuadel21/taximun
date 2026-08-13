import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

function moneyCents(value: unknown) {
  return `${(Number(value || 0) / 100).toFixed(2)} €`;
}

function accountStatusLabel(account: any) {
  if (!account) return "Sin configurar";
  if (account.status === "enabled" && account.payouts_enabled) return "Connect operativo";
  if (account.status === "restricted" || account.status === "disabled") return "Revisión necesaria";
  return "Verificación pendiente";
}

function payoutStateLabel(state: string) {
  if (state === "paid") return "Liquidado";
  if (state === "ready") return "Pendiente de liquidar";
  if (state === "connect_required") return "Falta activar Connect";
  if (state === "recovery_pending") return "Recuperación pendiente";
  if (state === "reversed") return "Liquidación revertida";
  if (state === "partially_reversed") return "Reversión parcial";
  if (state === "failed") return "Liquidación fallida";
  return "Sin acción";
}

export function DriverConnectPayoutCard() {
  const overviewQuery = trpc.system.taxiStripeConnect.getPayoutOverview.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const createAccount = trpc.system.taxiStripeConnect.createOrGetAccount.useMutation();
  const createOnboarding = trpc.system.taxiStripeConnect.createOnboardingLink.useMutation();
  const refreshStatus = trpc.system.taxiStripeConnect.refreshStatus.useMutation();
  const transferRide = trpc.system.taxiStripeConnect.transferRideEarnings.useMutation();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const handledReturn = useRef(false);

  const overview = overviewQuery.data as any;
  const account = overview?.account ?? null;
  const items = (overview?.items ?? []) as any[];
  const visibleItems = useMemo(
    () => items.filter((item) => ["paid", "ready", "connect_required", "recovery_pending", "failed", "partially_reversed", "reversed"].includes(String(item.state))).slice(0, 12),
    [items]
  );
  const connectReady = Boolean(account?.status === "enabled" && account?.payouts_enabled && account?.stripe_account_id);
  const busy = createAccount.isPending || createOnboarding.isPending || refreshStatus.isPending || transferRide.isPending;

  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("connect")) return;
    handledReturn.current = true;
    void refreshStatus.mutateAsync()
      .then(async () => {
        setMessage("Estado de Stripe Connect actualizado.");
        await overviewQuery.refetch();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo actualizar Stripe Connect."));
  }, []);

  const openOnboarding = async () => {
    setError("");
    setMessage("");
    try {
      if (!account?.stripe_account_id) {
        await createAccount.mutateAsync({ country: "ES" });
      }
      const link = await createOnboarding.mutateAsync({});
      if (!link?.url) throw new Error("Stripe no devolvió un enlace de verificación.");
      window.location.assign(link.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir Stripe Connect.");
      await overviewQuery.refetch();
    }
  };

  const refresh = async () => {
    setError("");
    setMessage("");
    try {
      await refreshStatus.mutateAsync();
      await overviewQuery.refetch();
      setMessage("Estado de liquidaciones actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado.");
    }
  };

  const retryRide = async (rideId: string) => {
    setError("");
    setMessage("");
    try {
      await transferRide.mutateAsync({ rideId });
      await overviewQuery.refetch();
      setMessage("Liquidación enviada a Stripe Connect.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo liquidar este viaje.");
    }
  };

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${connectReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-950 text-white"}`}>
            {connectReady ? <CheckCircle2 className="h-6 w-6" /> : <WalletCards className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Stripe Connect</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{accountStatusLabel(account)}</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
              {connectReady
                ? "Los viajes cobrados con tarjeta se liquidan automáticamente cuando el servicio queda cerrado correctamente."
                : "Activa y verifica tu cuenta Connect para recibir automáticamente el neto de los viajes pagados con tarjeta."}
            </p>
          </div>
        </div>

        <div className="grid min-w-[220px] grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
          <Button type="button" onClick={openOnboarding} disabled={busy} className="h-12 rounded-2xl bg-slate-950 font-black text-white">
            {createAccount.isPending || createOnboarding.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            {account?.stripe_account_id ? "Abrir verificación" : "Activar Connect"}
          </Button>
          <Button type="button" variant="outline" onClick={refresh} disabled={busy || !account?.stripe_account_id} className="h-12 rounded-2xl bg-white font-black">
            {refreshStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
        </div>
      </div>

      {account && (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniState label="Verificación" value={account.details_submitted ? "Enviada" : "Pendiente"} ok={Boolean(account.details_submitted)} />
          <MiniState label="Cobros" value={account.charges_enabled ? "Activos" : "Pendientes"} ok={Boolean(account.charges_enabled)} />
          <MiniState label="Liquidaciones" value={account.payouts_enabled ? "Activas" : "Pendientes"} ok={Boolean(account.payouts_enabled)} />
          <MiniState label="Requisitos" value={Array.isArray(account.requirements_due) ? String(account.requirements_due.length) : "0"} ok={Array.isArray(account.requirements_due) && account.requirements_due.length === 0} />
        </div>
      )}

      {message && <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-800">{message}</div>}
      {(error || overviewQuery.error) && (
        <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">
          <AlertTriangle className="mr-2 inline h-5 w-5" />
          {error || overviewQuery.error?.message}
        </div>
      )}

      {overviewQuery.isLoading && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Comprobando liquidaciones...</p>}

      {visibleItems.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-950">Liquidaciones recientes</h3>
              <p className="text-xs font-bold text-slate-500">Muestra pagos enviados a Connect y cualquier viaje que todavía requiere atención.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-slate-400" />
          </div>

          {visibleItems.map((item) => {
            const transfer = item.transfer;
            const payment = item.payment;
            const ride = item.ride;
            const reversed = Number(transfer?.amount_reversed || 0);
            return (
              <div key={payment.id} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950">{ride?.dropoff_address || `Viaje ${String(payment.ride_id).slice(0, 8).toUpperCase()}`}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      Neto: {moneyCents(payment.driver_net)} · {payoutStateLabel(String(item.state))}
                    </p>
                    {reversed > 0 && <p className="mt-1 text-xs font-black text-amber-700">Revertido a plataforma: {moneyCents(reversed)}</p>}
                    {transfer?.refund_reversal_pending && (
                      <p className="mt-2 rounded-xl bg-amber-100 p-2 text-xs font-black text-amber-900">
                        Un reembolso o contracargo necesita recuperación administrativa. No se enviará otra liquidación para este pago.
                      </p>
                    )}
                  </div>

                  {item.state === "paid" && <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />}
                  {item.state === "ready" && (
                    <Button type="button" onClick={() => retryRide(payment.ride_id)} disabled={transferRide.isPending} className="h-12 shrink-0 rounded-2xl bg-slate-950 font-black text-white">
                      {transferRide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                      Liquidar ahora
                    </Button>
                  )}
                  {item.state === "connect_required" && (
                    <Button type="button" onClick={openOnboarding} disabled={busy} className="h-12 shrink-0 rounded-2xl bg-slate-950 font-black text-white">
                      Activar Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MiniState({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-black ${ok ? "text-emerald-700" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}
