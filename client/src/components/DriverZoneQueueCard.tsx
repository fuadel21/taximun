import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Anchor, Building2, ListOrdered, Plane, Timer, TrainFront } from "lucide-react";

type ZoneQueue = {
  zoneId: string;
  zoneName: string;
  waiting: number;
  estimatedWaitMinutes: number;
  head: { driverId: string; driverName: string; position: number } | null;
  myPosition: number | null;
  driversAhead: number | null;
};

const zoneIcon = (zoneName: string) => {
  const name = zoneName.toLowerCase();
  if (name.includes("aeroport")) return Plane;
  if (name.includes("sants") || name.includes("estaci")) return TrainFront;
  if (name.includes("port") || name.includes("cruise")) return Anchor;
  return Building2;
};

/**
 * Cola FIFO por zona: posición del conductor en la cola oficial de su zona
 * (aeropuerto, Sants, puerto, centro) y ocupación del resto de zonas.
 */
export default function DriverZoneQueueCard() {
  const queue = trpc.system.taxiOps.driver.getZoneQueue.useQuery(undefined, {
    refetchInterval: 6000,
    retry: false,
  });
  const data = queue.data as
    | { myZone: string | null; myStatus: string; inQueueZone: ZoneQueue | null; queues: ZoneQueue[] }
    | undefined;

  if (!data) {
    return (
      <section className="px-4 pb-4">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
          <p className="text-sm font-black">Cargando colas de zona…</p>
        </div>
      </section>
    );
  }

  const mine = data.inQueueZone;

  return (
    <section className="px-4 pb-4">
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="rounded-[2rem] border border-zinc-800 bg-zinc-900 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
                <ListOrdered className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-black tracking-tight">Cola de zona</p>
                <p className="text-xs font-semibold text-zinc-400">
                  FIFO en aeropuerto, Sants, puerto y centro · tu zona: {data.myZone ?? "sin zona"}
                </p>
              </div>
            </div>
            {mine && (
              <div className="text-right">
                <p className="text-3xl font-black leading-none">#{mine.myPosition ?? "—"}</p>
                <p className="text-xs font-bold text-zinc-400">tu posición</p>
              </div>
            )}
          </div>

          {mine ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-black/60 p-3">
                <p className="text-xs font-black uppercase text-zinc-500">{mine.zoneName}</p>
                <p className="mt-1 text-2xl font-black">
                  {mine.driversAhead ?? 0} <span className="text-sm font-bold text-zinc-400">delante</span>
                </p>
              </div>
              <div className="rounded-2xl bg-black/60 p-3">
                <p className="flex items-center gap-1 text-xs font-black uppercase text-zinc-500">
                  <Timer className="h-3.5 w-3.5" /> espera estimada
                </p>
                <p className="mt-1 text-2xl font-black">
                  ~{mine.estimatedWaitMinutes} <span className="text-sm font-bold text-zinc-400">min</span>
                </p>
              </div>
              <p className="col-span-2 text-xs font-semibold text-zinc-400">
                {mine.head
                  ? `Turno de ${mine.head.driverName}${mine.myPosition === 1 ? " · ¡eres el primero, el próximo viaje del área es tuyo!" : ""}`
                  : "Cola vacía."}
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-black/60 p-3 text-xs font-semibold text-zinc-400">
              Tu zona actual ({data.myZone ?? "sin zona"}) no tiene cola oficial. Los viajes con recogida en
              aeropuerto, Sants, puerto o centro se ofrecen primero a la cola de esa zona: acércate y espera
              ahí para asegurar turno.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.queues.map((zone) => {
            const Icon = zoneIcon(zone.zoneName);
            const isMine = mine?.zoneId === zone.zoneId;
            return (
              <div
                key={zone.zoneId}
                className={`rounded-3xl border p-4 ${
                  isMine ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-900 text-white"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isMine ? "bg-black text-white" : "bg-zinc-800 text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2 text-sm font-black leading-tight">{zone.zoneName}</p>
                <p className={`mt-1 text-xs font-bold ${isMine ? "text-zinc-500" : "text-zinc-400"}`}>
                  {zone.waiting} en cola · ~{zone.estimatedWaitMinutes} min
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
