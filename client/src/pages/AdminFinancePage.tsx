import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, RefreshCw, RotateCcw, ShieldAlert, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function moneyCents(value: unknown) {
  return `${(Number(value || 0) / 100).toFixed(2)} €`;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminFinancePage() {
  const overviewQuery = trpc.system.taxiFinanceAdmin.getOverview.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });
  const retryRecovery = trpc.system.taxiFinanceAdmin.retryRecovery.useMutation();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [workingPayment, setWorkingPayment] = useState<string | null>(null);

  const overview = overviewQuery.data as any;
  const summary = overview?.summary;
  const attention = (overview?.attention || []) as any[];
  const connectAttention = (overview?.connectAttention || []) as any[];
  const recentTransfers = (overview?.recentTransfers || []) as any[];
  const recent = useMemo(() => recentTransfers.slice(0, 12), [recentTransfers]);

  const retry = async (paymentId: string) => {
    setWorkingPayment(paymentId);
    setMessage("");
    setError("");
    try {
      const result = await retryRecovery.mutateAsync({ paymentId });
      if ((result as any)?.ok === false) {
        setError((result as any)?.message || "Stripe todavía no permite recuperar la transferencia.");
      } else {
        setMessage("Recuperación financiera conciliada con Stripe.");
      }
      await overviewQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reintentar la recuperación.");
    } finally {
      setWorkingPayment(null);
    }
  };

  const refresh = async () => {
    setError("");
    setMessage("");
    await overviewQuery.refetch();
  };

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] bg-black p-6 text-white shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Taximun Admin</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Finanzas y liquidaciones</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-zinc-300">Cobros Stripe, transferencias Connect, reembolsos y contracargos con recuperación real de fondos.</p>
            </div>
            <Button type="button" variant="outline" onClick={refresh} disabled={overviewQuery.isFetching} className="h-14 rounded-2xl border-white/20 bg-white text-black font-black hover:bg-zinc-100">
              {overviewQuery.isFetching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
              Actualizar
            </Button>
          </div>
        </section>

        {summary && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Metric icon={<CreditCard className="h-5 w-5" />} label="Transferencias" value={String(summary.transferCount || 0)} />
            <Metric icon={<Banknote className="h-5 w-5" />} label="Enviado a Connect" value={moneyCents(summary.totalTransferred)} />
            <Metric icon={<RotateCcw className="h-5 w-5" />} label="Recuperado" value={moneyCents(summary.totalReversed)} />
            <Metric icon={<ShieldAlert className="h-5 w-5" />} label="Recuperación pendiente" value={String(summary.attentionCount || 0)} warning={Number(summary.attentionCount || 0) > 0} />
            <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Transferencias fallidas" value={String(summary.failedTransferCount || 0)} warning={Number(summary.failedTransferCount || 0) > 0} />
            <Metric icon={<WalletCards className="h-5 w-5" />} label="Connect pendientes" value={String(summary.connectAttentionCount || 0)} warning={Number(summary.connectAttentionCount || 0) > 0} />
          </div>
        )}

        {message && <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-800">{message}</div>}
        {(error || overviewQuery.error) && (
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">
            <AlertTriangle className="mr-2 inline h-5 w-5" />{error || overviewQuery.error?.message}
          </div>
        )}

        <Card className="rounded-[2rem] border-0 bg-white shadow-lg">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Recuperaciones pendientes</h2>
                <p className="text-sm font-semibold text-zinc-500">Reembolsos o contracargos cuya parte del conductor todavía no se pudo recuperar desde Stripe Connect.</p>
              </div>
              <Badge className={attention.length ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{attention.length}</Badge>
            </div>

            {!overviewQuery.isLoading && attention.length === 0 && (
              <div className="rounded-3xl bg-emerald-50 p-5 text-center">
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
                <p className="mt-2 font-black text-emerald-900">No hay recuperaciones pendientes</p>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {attention.map((item) => {
                const transfer = item.transfer;
                const payment = item.payment;
                const ride = item.ride;
                const paymentId = String(transfer.payment_id || payment?.id || "");
                return (
                  <div key={transfer.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black">{ride?.dropoff_address || `Viaje ${String(transfer.ride_id).slice(0, 8).toUpperCase()}`}</p>
                        <p className="mt-1 text-xs font-bold text-zinc-500">Conductor: {ride?.driver_name || transfer.driver_id}</p>
                      </div>
                      <Badge className="bg-amber-200 text-amber-950 hover:bg-amber-200">Atención</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Info label="Transferido" value={moneyCents(transfer.amount)} />
                      <Info label="Revertido" value={moneyCents(transfer.amount_reversed)} />
                      <Info label="Capturado" value={moneyCents(payment?.amount_captured)} />
                      <Info label="Reembolsado" value={moneyCents(payment?.amount_refunded)} />
                    </div>
                    {transfer.payout_blocked_reason && <p className="mt-3 rounded-2xl bg-white/80 p-3 text-xs font-black text-zinc-700">Motivo: {transfer.payout_blocked_reason}</p>}
                    {transfer.failure_message && <p className="mt-2 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{transfer.failure_message}</p>}
                    <Button type="button" onClick={() => retry(paymentId)} disabled={!paymentId || retryRecovery.isPending} className="mt-3 h-14 w-full rounded-2xl bg-black font-black text-white">
                      {workingPayment === paymentId ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RotateCcw className="mr-2 h-5 w-5" />}
                      Reintentar recuperación
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[2rem] border-0 bg-white shadow-lg">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-xl font-black">Conductores Connect pendientes</h2>
                <p className="text-sm font-semibold text-zinc-500">Cuentas que todavía no pueden recibir liquidaciones automáticas.</p>
              </div>
              {connectAttention.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 text-sm font-bold text-zinc-500">Sin cuentas pendientes.</p>}
              {connectAttention.slice(0, 20).map((account) => (
                <div key={account.driver_id} className="rounded-2xl bg-zinc-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black">{account.driver_id}</p>
                    <Badge className="bg-white text-zinc-700 hover:bg-white">{account.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-bold text-zinc-500">Payouts: {account.payouts_enabled ? "sí" : "no"} · Cobros: {account.charges_enabled ? "sí" : "no"} · {dateLabel(account.updated_at)}</p>
                  {account.disabled_reason && <p className="mt-2 text-xs font-black text-red-700">{account.disabled_reason}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-0 bg-white shadow-lg">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-xl font-black">Últimas liquidaciones</h2>
                <p className="text-sm font-semibold text-zinc-500">Trazabilidad de las transferencias más recientes hacia Connect, incluidas las fallidas.</p>
              </div>
              {recent.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 text-sm font-bold text-zinc-500">Todavía no hay liquidaciones registradas.</p>}
              {recent.map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">Viaje {String(transfer.ride_id).slice(0, 8).toUpperCase()}</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">{dateLabel(transfer.paid_at || transfer.updated_at)} · revertido {moneyCents(transfer.amount_reversed)}</p>
                    {transfer.status === "failed" && transfer.failure_message && <p className="mt-1 text-xs font-bold text-red-700">{transfer.failure_message}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-black">{moneyCents(transfer.amount)}</p>
                    <Badge className={transfer.status === "failed" ? "bg-red-100 text-red-800 hover:bg-red-100" : transfer.status === "reversed" ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{transfer.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, warning = false }: { icon: React.ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-3xl p-4 shadow-sm ${warning ? "bg-amber-50" : "bg-white"}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/80 p-3"><p className="text-[11px] font-black uppercase tracking-[0.1em] text-zinc-400">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
