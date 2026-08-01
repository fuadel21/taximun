import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { PassengerRideAftercare } from "@/components/PassengerRideAftercare";

type CompletedRide = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  completed_at?: string | null;
  requested_at?: string | null;
  final_fare?: number | string | null;
  estimated_fare?: number | string | null;
  status: string;
};

export function PassengerAftercareHub() {
  const query = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, { retry: false, refetchInterval: 15000 });
  const rides = useMemo(() => ((query.data ?? []) as CompletedRide[]).filter((ride) => ride.status === "completed"), [query.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rides.find((ride) => ride.id === selectedId) || rides[0] || null;

  if (!query.isLoading && rides.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl space-y-4 px-4 pb-6">
      <div className="rounded-[2rem] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-zinc-500">Gestiones posteriores</p><h2 className="mt-1 text-2xl font-black">Recibos y propinas</h2><p className="mt-1 text-sm font-semibold text-zinc-500">Selecciona un viaje finalizado.</p></div><Badge className="bg-black text-white">{rides.length}</Badge></div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {rides.map((ride) => (
            <button key={ride.id} onClick={() => setSelectedId(ride.id)} className={`min-w-56 rounded-2xl p-4 text-left active:scale-[0.98] ${selected?.id === ride.id ? "bg-black text-white" : "bg-zinc-100 text-black"}`}>
              <p className="truncate font-black">{ride.dropoff_address}</p>
              <p className={`mt-1 text-xs font-bold ${selected?.id === ride.id ? "text-white/55" : "text-zinc-500"}`}>{new Date(ride.completed_at || ride.requested_at || Date.now()).toLocaleDateString("es-ES")} · {Number(ride.final_fare ?? ride.estimated_fare ?? 0).toFixed(2)} €</p>
            </button>
          ))}
        </div>
      </div>
      {selected && <PassengerRideAftercare rideId={selected.id} status={selected.status} />}
    </section>
  );
}
