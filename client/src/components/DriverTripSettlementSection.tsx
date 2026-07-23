import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, CreditCard, Euro, Loader2, ReceiptText } from "lucide-react";

type ActiveRide = {
  id: string;
  status: "assigned" | "in_progress";
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  payment_method?: string | null;
};

type PaymentMethod = "cash" | "card" | "bizum";
type RidePayment = { status?: string | null; amount_captured?: number | null };

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

export function DriverTripSettlementSection() {
  const utils = trpc.useUtils();
  const activeQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
  });
  const active = (activeQuery.data ?? null) as ActiveRide | null;
  const [finalFare, setFinalFare] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    setFinalFare(String(Number(active.estimated_fare ?? 0).toFixed(2)));
    if (["cash", "card", "bizum"].includes(String(active.payment_method))) {
      setPaymentMethod(active.payment_method as PaymentMethod);
    }
  }, [active?.id]);

  const paymentQuery = trpc.system.taxiPayments.getForRide.useQuery(
    { rideId: active?.id || "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(active?.id && active.status === "in_progress" && paymentMethod === "card"), retry: false }
  );
  const captureMutation = trpc.system.taxiPayments.capture.useMutation();
  const settleMutation = trpc.system.taxiTripSettlement.settleAndComplete.useMutation({
    onSuccess: async () => {
      setError("");
      setNotes("");
      await Promise.all([
        utils.system.taxiOps.driver.getActiveRide.invalidate(),
        utils.system.taxiOps.driver.getRideHistory.invalidate(),
        utils.system.taxiOps.driver.getStatus.invalidate(),
        utils.system.taxiDriverAnalytics.getDashboard.invalidate(),
      ]);
    },
    onError: (err) => setError(err.message),
  });

  if (!active || active.status !== "in_progress") return null;

  const submit = async () => {
    const amount = Number(finalFare.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Introduce un importe final válido.");
      return;
    }

    setError("");
    try {
      if (paymentMethod === "card") {
        const payment = (paymentQuery.data ?? null) as RidePayment | null;
        const expectedCents = Math.round(amount * 100);
        const alreadyCaptured = payment?.status === "captured" && Number(payment.amount_captured ?? 0) === expectedCents;

        if (!alreadyCaptured) {
          await captureMutation.mutateAsync({ rideId: active.id, finalAmount: amount });
          await paymentQuery.refetch();
        }
      }

      await settleMutation.mutateAsync({
        rideId: active.id,
        finalFare: amount,
        paymentMethod,
        paymentStatus: "paid",
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el cobro y cierre.");
    }
  };

  const busy = settleMutation.isPending || captureMutation.isPending;
  const paymentError = paymentQuery.error || captureMutation.error;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-4">
      <Card className="rounded-[1.75rem] border-emerald-100 bg-white shadow-xl">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Cierre obligatorio</p>
              <h2 className="mt-1 text-2xl font-black">Finalizar y cobrar viaje</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">{active.passenger_name || "Pasajero"} · {active.dropoff_address}</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><ReceiptText className="mr-1 h-4 w-4" />Recibo final</Badge>
          </div>

          {(error || paymentError) && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error || paymentError?.message}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">Importe final del taxímetro</label>
              <div className="relative">
                <Euro className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />
                <Input value={finalFare} onChange={(event) => setFinalFare(event.target.value)} inputMode="decimal" className="h-14 rounded-2xl pl-12 text-lg font-black" />
              </div>
              <p className="mt-1 text-xs font-bold text-slate-400">Estimación previa: {money(active.estimated_fare)}</p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">Método cobrado</label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "card", "bizum"] as PaymentMethod[]).map((method) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} disabled={busy} className={`rounded-2xl p-3 text-xs font-black ${paymentMethod === method ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>
                    <CreditCard className="mx-auto mb-1 h-4 w-4" />{method === "cash" ? "Efectivo" : method === "card" ? "Tarjeta" : "Bizum"}
                  </button>
                ))}
              </div>
              {paymentMethod === "card" && <p className="mt-2 rounded-2xl bg-blue-50 p-2 text-xs font-bold text-blue-800">La tarjeta se capturará en Stripe antes de cerrar el viaje.</p>}
            </div>
          </div>

          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={800} className="min-h-20 rounded-2xl" placeholder="Observaciones opcionales del cierre" />

          <Button onClick={submit} disabled={busy || (paymentMethod === "card" && paymentQuery.isLoading)} className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-black text-white hover:bg-emerald-500">
            {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
            {captureMutation.isPending ? "Capturando tarjeta…" : settleMutation.isPending ? "Cerrando viaje…" : "Confirmar cobro y finalizar"}
          </Button>
          <p className="text-center text-xs font-bold text-slate-500">La base de datos valida el pago y contabiliza el viaje de forma atómica.</p>
        </CardContent>
      </Card>
    </section>
  );
}
