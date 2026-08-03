import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, CreditCard, Download, Euro, Gift, Loader2, MessageCircle, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";

type Props = { rideId: string; status: string };

const money = (cents: number | null | undefined) => `${(Number(cents || 0) / 100).toFixed(2)} €`;
const fare = (value: unknown) => `${Number(value || 0).toFixed(2)} €`;
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

function paymentLabel(value?: string | null) {
  if (value === "card") return "Tarjeta";
  if (value === "bizum") return "Bizum";
  return "Efectivo";
}

function tipStatusLabel(status?: string | null) {
  if (status === "paid") return "Confirmada";
  if (status === "pending_confirmation") return "Esperando confirmación del conductor";
  if (status === "checkout_pending") return "Pago de tarjeta pendiente";
  if (status === "failed") return "Pago no completado";
  if (status === "cancelled") return "Pago cancelado";
  return "Sin propina";
}

export function PassengerRideAftercare({ rideId, status }: Props) {
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("5");
  const [method, setMethod] = useState<"card" | "cash" | "bizum">("card");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const enabled = status === "completed";

  const query = trpc.system.taxiRideAftercare.get.useQuery({ rideId }, { enabled, retry: false, refetchOnWindowFocus: true });
  const createCheckout = trpc.system.taxiRideAftercare.createCardCheckout.useMutation();
  const declareOffline = trpc.system.taxiRideAftercare.declareOfflineTip.useMutation();
  const syncCard = trpc.system.taxiRideAftercare.syncCardTip.useMutation();
  const cancelCard = trpc.system.taxiRideAftercare.cancelCardTip.useMutation();
  const data = query.data;
  const tip = data?.tip;
  const cardTipAvailable = Boolean(data?.cardTipAvailable);
  const numericAmount = Number(amount.replace(",", "."));
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 0.5 && numericAmount <= 500;
  const tipLocked = Boolean(tip && !["failed", "cancelled"].includes(tip.status));
  const busy = createCheckout.isPending || declareOffline.isPending || syncCard.isPending || cancelCard.isPending;

  const refresh = async () => {
    await utils.system.taxiRideAftercare.get.invalidate({ rideId });
  };

  useEffect(() => {
    if (query.isLoading || cardTipAvailable || method !== "card") return;
    setMethod("cash");
  }, [query.isLoading, cardTipAvailable, method]);

  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("rideId") !== rideId) return;
    const result = params.get("tip");
    if (result === "success") {
      syncCard.mutate({ rideId }, {
        onSuccess: async (saved) => {
          setNotice(saved?.status === "paid" ? "Propina pagada y enviada al saldo Stripe Connect del conductor." : "El pago todavía se está verificando por Stripe.");
          await refresh();
        },
        onError: (err) => setError(err.message),
      });
    } else if (result === "cancelled") {
      cancelCard.mutate({ rideId }, {
        onSuccess: async (saved) => {
          setNotice(saved?.status === "paid" ? "Stripe confirmó que la propina sí llegó a pagarse." : "Pago cancelado. Puedes volver a intentarlo o elegir efectivo/Bizum.");
          await refresh();
        },
        onError: (err) => setError(err.message),
      });
    }
  }, [rideId, enabled]);

  const selectedTip = useMemo(() => {
    if (!tip) return "";
    return `${money(tip.amount_cents)} · ${paymentLabel(tip.method)} · ${tipStatusLabel(tip.status)}`;
  }, [tip]);

  const submitTip = async () => {
    if (!validAmount || tipLocked) return;
    if (method === "card" && !cardTipAvailable) {
      setError("La tarjeta no está disponible porque el conductor todavía no tiene Stripe Connect habilitado.");
      return;
    }
    try {
      setError("");
      setNotice("");
      if (method === "card") {
        const result = await createCheckout.mutateAsync({ rideId, amount: numericAmount });
        window.location.assign(result.checkoutUrl);
        return;
      }
      await declareOffline.mutateAsync({ rideId, amount: numericAmount, method });
      setNotice("Propina registrada. El conductor deberá confirmar que la ha recibido.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la propina.");
    }
  };

  const printReceipt = () => {
    if (!data) return;
    const ride = data.ride;
    const payment = data.payment;
    const confirmedTip = tip?.status === "paid" ? tip : null;
    const receipt = window.open("", "_blank", "width=760,height=900");
    if (!receipt) {
      setError("El navegador bloqueó la ventana del recibo.");
      return;
    }
    const finalFare = ride.final_fare ?? ride.estimated_fare ?? 0;
    const receiptDate = new Date(ride.completed_at || ride.settled_at || ride.requested_at).toLocaleString("es-ES");
    receipt.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo Taximun ${escapeHtml(ride.id)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:40px;max-width:720px;margin:auto}h1{font-size:32px;margin:0}.muted{color:#666}.box{border:1px solid #ddd;border-radius:16px;padding:18px;margin-top:18px}.row{display:flex;justify-content:space-between;gap:20px;padding:8px 0;border-bottom:1px solid #eee}.row:last-child{border-bottom:0}.total{font-size:22px;font-weight:800}.small{font-size:12px}@media print{button{display:none}}</style></head><body><h1>Taximun</h1><p class="muted">Recibo del viaje ${escapeHtml(ride.id.slice(0, 8).toUpperCase())}</p><div class="box"><div class="row"><span>Origen</span><strong>${escapeHtml(ride.pickup_address)}</strong></div><div class="row"><span>Destino</span><strong>${escapeHtml(ride.dropoff_address)}</strong></div><div class="row"><span>Conductor</span><strong>${escapeHtml(ride.driver_name || "Conductor Taximun")}</strong></div><div class="row"><span>Fecha</span><strong>${escapeHtml(receiptDate)}</strong></div></div><div class="box"><div class="row"><span>Tarifa final</span><strong>${escapeHtml(fare(finalFare))}</strong></div><div class="row"><span>Método</span><strong>${escapeHtml(paymentLabel(ride.payment_method))}</strong></div><div class="row"><span>Estado del pago</span><strong>${escapeHtml(ride.payment_status || payment?.status || "registrado")}</strong></div><div class="row"><span>Reembolsado</span><strong>${escapeHtml(money(payment?.amount_refunded))}</strong></div>${confirmedTip ? `<div class="row"><span>Propina</span><strong>${escapeHtml(money(confirmedTip.amount_cents))}</strong></div>` : ""}<div class="row total"><span>Total documentado</span><strong>${escapeHtml((Number(finalFare) + Number(confirmedTip?.amount_cents || 0) / 100).toFixed(2) + " €")}</strong></div></div><p class="small muted">Documento generado desde Taximun. La propina solo aparece cuando su pago o recepción está confirmado.</p><button onclick="window.print()">Guardar como PDF / imprimir</button></body></html>`);
    receipt.document.close();
    receipt.focus();
  };

  if (!enabled) return null;

  return (
    <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-black text-zinc-500">Después del viaje</p><h3 className="mt-1 text-xl font-black">Recibo, propina y soporte</h3><p className="mt-1 text-sm font-semibold text-zinc-500">Todo queda enlazado al viaje real.</p></div>
          <ReceiptText className="h-7 w-7" />
        </div>

        {(error || query.error) && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline h-4 w-4" />{error || query.error?.message}</div>}
        {notice && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={printReceipt} disabled={!data || query.isLoading} variant="outline" className="h-14 rounded-2xl font-black"><Download className="mr-2 h-5 w-5" />Guardar recibo PDF</Button>
          <Button onClick={() => setLocation(`/passenger/security?rideId=${rideId}`)} variant="outline" className="h-14 rounded-2xl font-black"><MessageCircle className="mr-2 h-5 w-5" />Incidencia de este viaje</Button>
        </div>

        <div className="rounded-3xl bg-zinc-100 p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="font-black">Propina al conductor</p><p className="text-xs font-bold text-zinc-500">Tarjeta va directamente a su Stripe Connect; efectivo/Bizum requieren confirmación.</p></div>{tip && <Badge className={tip.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{tipStatusLabel(tip.status)}</Badge>}</div>
          {selectedTip && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-black">{selectedTip}</p>}
          {!tipLocked && <>
            <div className="mt-4 grid grid-cols-3 gap-2">{[2, 5, 10].map((value) => <button key={value} onClick={() => setAmount(String(value))} className={`h-12 rounded-2xl font-black ${Number(amount) === value ? "bg-black text-white" : "bg-white"}`}>{value} €</button>)}</div>
            <div className="mt-3 flex items-center gap-2"><Euro className="h-5 w-5" /><Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-12 rounded-2xl bg-white" placeholder="Importe" /></div>
            {!query.isLoading && !cardTipAvailable && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-900">La tarjeta no está disponible para este viaje porque el conductor todavía no tiene Stripe Connect operativo.</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">{(["card", "cash", "bizum"] as const).map((item) => {
              const disabled = item === "card" && !cardTipAvailable;
              return <button key={item} disabled={disabled} onClick={() => setMethod(item)} className={`h-12 rounded-2xl text-sm font-black ${disabled ? "cursor-not-allowed bg-zinc-200 text-zinc-400" : method === item ? "bg-cyan-600 text-white" : "bg-white"}`}>{paymentLabel(item)}</button>;
            })}</div>
            <Button onClick={submitTip} disabled={!validAmount || busy || method === "card" && !cardTipAvailable} className="mt-3 h-14 w-full rounded-2xl bg-black font-black text-white">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : method === "card" ? <CreditCard className="mr-2 h-5 w-5" /> : <Gift className="mr-2 h-5 w-5" />}Añadir {validAmount ? `${numericAmount.toFixed(2)} €` : "propina"}</Button>
          </>}
        </div>
      </CardContent>
    </Card>
  );
}