import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";

type Tip = {
  id: string;
  ride_id: string;
  amount_cents: number;
  method: "cash" | "bizum";
  status: string;
  declared_at?: string | null;
};

export function DriverTipConfirmations() {
  const utils = trpc.useUtils();
  const query = trpc.system.taxiRideAftercare.listDriverPending.useQuery(undefined, { retry: false, refetchInterval: 15000 });
  const confirm = trpc.system.taxiRideAftercare.confirmOfflineTip.useMutation({
    onSuccess: async () => {
      await utils.system.taxiRideAftercare.listDriverPending.invalidate();
    },
  });
  const tips = (query.data ?? []) as Tip[];

  if (!query.isLoading && tips.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 pb-5">
      <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5 text-white">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-white/50">Propinas pendientes</p><h2 className="mt-1 text-2xl font-black">Confirma solo lo recibido</h2><p className="mt-1 text-sm font-semibold text-white/50">Efectivo y Bizum requieren tu confirmación.</p></div><Badge className="bg-amber-100 text-amber-900">{tips.length}</Badge></div>
        {query.isLoading && <p className="mt-4 rounded-2xl bg-white/5 p-4 text-sm font-bold text-white/50"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando propinas…</p>}
        {query.error && <p className="mt-4 rounded-2xl bg-red-950/40 p-4 text-sm font-bold text-red-200">{query.error.message}</p>}
        <div className="mt-4 space-y-3">
          {tips.map((tip) => (
            <div key={tip.id} className="rounded-3xl bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xl font-black">{(tip.amount_cents / 100).toFixed(2)} €</p><p className="text-xs font-bold text-white/45">{tip.method === "bizum" ? "Bizum" : "Efectivo"} · viaje {tip.ride_id.slice(0, 8).toUpperCase()}</p></div><Button disabled={confirm.isPending} onClick={() => confirm.mutate({ tipId: tip.id })} className="h-12 rounded-2xl bg-emerald-600 px-5 font-black text-white">{confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirmar recibido</Button></div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-bold text-white/40"><Gift className="mr-1 inline h-4 w-4" />Las propinas con tarjeta se confirman automáticamente mediante Stripe.</p>
      </div>
    </section>
  );
}
