import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, CalendarDays, Car, CreditCard, Euro, ReceiptText, Route, Star } from "lucide-react";

type Ride = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  final_fare?: number | string | null;
  fare?: number;
  fareSource?: "final" | "estimated";
  payment_status?: string | null;
  payment_method?: string | null;
  service_type?: string | null;
  settled_at?: string | null;
  completed_at?: string | null;
  requested_at?: string | null;
};

type Dashboard = {
  summary: {
    todayRevenue: number;
    weekRevenue: number;
    monthRevenue: number;
    todayRides: number;
    weekRides: number;
    monthRides: number;
    totalRevenue: number;
    totalRides: number;
    averageTicket: number;
    rating: number;
    ratingCount: number;
    completedRides: number;
  };
  paymentBreakdown: Record<string, { rides: number; revenue: number }>;
  rides: Ride[];
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const paymentLabel = (value?: string | null) => value === "card" ? "Tarjeta" : value === "bizum" ? "Bizum" : "Efectivo";
const serviceLabel = (value?: string | null) => value === "eco" ? "Eco" : value === "van" ? "Van" : "Taxi";
const paymentStatusLabel = (value?: string | null) => value === "paid" ? "Cobrado" : value === "waived" ? "Sin cobro" : value === "failed" ? "Fallido" : "Pendiente";

export default function DriverEarningsPage() {
  const [filter, setFilter] = useState<"all" | "cash" | "card" | "bizum">("all");
  const dashboardQuery = trpc.system.taxiDriverAnalytics.getDashboard.useQuery(undefined, { retry: false, refetchInterval: 15000 });
  const dashboard = (dashboardQuery.data ?? null) as Dashboard | null;
  const rides = useMemo(() => {
    if (!dashboard) return [];
    return filter === "all" ? dashboard.rides : dashboard.rides.filter((ride) => (ride.payment_method || "cash") === filter);
  }, [dashboard, filter]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Taximun Driver</p>
          <h1 className="mt-1 text-3xl font-black">Ingresos y estadísticas</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">Resumen profesional basado en importes finales de viajes liquidados.</p>
        </section>

        {dashboardQuery.isLoading && <div className="rounded-3xl bg-white p-4 text-sm font-black text-slate-500">Cargando estadísticas...</div>}
        {dashboardQuery.error && <div className="rounded-3xl bg-red-50 p-4 text-sm font-black text-red-700">{dashboardQuery.error.message}</div>}

        {dashboard && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric icon={<Euro className="h-4 w-4" />} title="Hoy" value={money(dashboard.summary.todayRevenue)} note={`${dashboard.summary.todayRides} viajes`} />
              <Metric icon={<CalendarDays className="h-4 w-4" />} title="Semana" value={money(dashboard.summary.weekRevenue)} note={`${dashboard.summary.weekRides} viajes`} />
              <Metric icon={<BarChart3 className="h-4 w-4" />} title="Mes" value={money(dashboard.summary.monthRevenue)} note={`${dashboard.summary.monthRides} viajes`} />
              <Metric icon={<ReceiptText className="h-4 w-4" />} title="Ticket medio" value={money(dashboard.summary.averageTicket)} note={`${dashboard.summary.totalRides} total`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
                <CardContent className="p-4">
                  <h2 className="mb-3 font-black">Reputación</h2>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric icon={<Star className="h-4 w-4" />} title="Valoración" value={`${dashboard.summary.rating.toFixed(1)}/5`} note={`${dashboard.summary.ratingCount} opiniones`} />
                    <Metric icon={<Car className="h-4 w-4" />} title="Completados" value={String(dashboard.summary.completedRides)} note="perfil" />
                    <Metric icon={<Route className="h-4 w-4" />} title="Ingresos total" value={money(dashboard.summary.totalRevenue)} note="liquidados" />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
                <CardContent className="p-4">
                  <h2 className="mb-3 font-black">Métodos de pago</h2>
                  <div className="space-y-2">
                    {(["cash", "card", "bizum"] as const).map((method) => {
                      const item = dashboard.paymentBreakdown[method] || { rides: 0, revenue: 0 };
                      return <div key={method} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span className="font-black"><CreditCard className="mr-2 inline h-4 w-4 text-cyan-600" />{paymentLabel(method)}</span><span className="text-sm font-black">{money(item.revenue)} · {item.rides}</span></div>;
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-xl font-black">Historial de servicios</h2><p className="text-xs font-bold text-slate-500">Hasta 500 viajes finalizados.</p></div>
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{rides.length}</Badge>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(["all", "cash", "card", "bizum"] as const).map((value) => <Button key={value} onClick={() => setFilter(value)} variant={filter === value ? "default" : "outline"} className="rounded-full font-black">{value === "all" ? "Todos" : paymentLabel(value)}</Button>)}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {rides.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500 md:col-span-2">Sin viajes para este filtro.</p>}
                  {rides.map((ride) => <div key={ride.id} className="rounded-3xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><p className="truncate font-black">{ride.dropoff_address}</p><span className="font-black">{money(ride.fare ?? ride.final_fare ?? ride.estimated_fare)}</span></div><p className="mt-1 text-xs font-bold text-slate-500">{dateLabel(ride.settled_at || ride.completed_at || ride.requested_at)} · {serviceLabel(ride.service_type)} · {paymentLabel(ride.payment_method)}</p><p className="mt-1 text-xs font-bold text-slate-400">{ride.fareSource === "estimated" ? "Estimación histórica" : paymentStatusLabel(ride.payment_status)}</p><p className="mt-2 text-xs font-semibold text-slate-600">{ride.pickup_address} → {ride.dropoff_address}</p></div>)}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ icon, title, value, note }: { icon: React.ReactNode; title: string; value: string; note: string }) {
  return <div className="rounded-3xl bg-white p-3 text-center shadow-lg"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">{icon}</div><p className="text-xs font-bold text-slate-400">{title}</p><p className="text-xl font-black">{value}</p><p className="text-[11px] font-bold text-slate-400">{note}</p></div>;
}