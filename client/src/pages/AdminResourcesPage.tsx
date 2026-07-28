import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Car, CheckCircle2, History, Loader2, Plus, RefreshCw, UserRound } from "lucide-react";

type DriverStatus = "available" | "busy" | "pause" | "offline";
type TaxiStatus = "available" | "busy" | "maintenance" | "offline";

const driverStatuses: DriverStatus[] = ["available", "busy", "pause", "offline"];
const taxiStatuses: TaxiStatus[] = ["available", "busy", "maintenance", "offline"];

function statusLabel(status: string) {
  if (status === "available") return "Disponible";
  if (status === "busy") return "En servicio";
  if (status === "pause") return "Pausa";
  if (status === "maintenance") return "Mantenimiento";
  return "Desconectado";
}

function formatDate(value: unknown) {
  if (typeof value !== "string") return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminResourcesPage() {
  const utils = trpc.useUtils();
  const snapshot = trpc.system.adminControl.getSnapshot.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });

  const [driverName, setDriverName] = useState("");
  const [driverTaxi, setDriverTaxi] = useState("");
  const [driverZone, setDriverZone] = useState("");
  const [taxiCode, setTaxiCode] = useState("");
  const [taxiPlate, setTaxiPlate] = useState("");
  const [taxiDriver, setTaxiDriver] = useState("");
  const [taxiModel, setTaxiModel] = useState("");

  const refresh = async () => {
    await utils.system.adminControl.getSnapshot.invalidate();
    await snapshot.refetch();
  };

  const createDriver = trpc.system.adminControl.createDriver.useMutation({
    onSuccess: async () => {
      setDriverName("");
      setDriverTaxi("");
      setDriverZone("");
      await refresh();
    },
  });

  const createTaxi = trpc.system.adminControl.createTaxi.useMutation({
    onSuccess: async () => {
      setTaxiCode("");
      setTaxiPlate("");
      setTaxiDriver("");
      setTaxiModel("");
      await refresh();
    },
  });

  const updateDriver = trpc.system.adminControl.updateDriverStatus.useMutation({ onSuccess: refresh });
  const updateTaxi = trpc.system.adminControl.updateTaxiStatus.useMutation({ onSuccess: refresh });
  const resolveIncident = trpc.system.adminControl.resolveIncident.useMutation({ onSuccess: refresh });

  const drivers = snapshot.data?.drivers ?? [];
  const taxis = snapshot.data?.taxis ?? [];
  const incidents = snapshot.data?.incidents ?? [];
  const logs = snapshot.data?.logs ?? [];
  const error = snapshot.error?.message || createDriver.error?.message || createTaxi.error?.message || updateDriver.error?.message || updateTaxi.error?.message || resolveIncident.error?.message;

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 pb-12 pt-4">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-zinc-500">Datos reales de Supabase</p>
            <h2 className="text-2xl font-black text-black">Conductores y flota</h2>
          </div>
          <Button variant="outline" onClick={refresh} disabled={snapshot.isFetching} className="h-14 rounded-2xl bg-white font-black">
            <RefreshCw className={`mr-2 h-5 w-5 ${snapshot.isFetching ? "animate-spin" : ""}`} />Actualizar
          </Button>
        </div>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-2xl font-black"><UserRound className="h-6 w-6" />Nuevo conductor</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Nombre completo" className="h-14 rounded-2xl" />
              <div className="grid grid-cols-2 gap-3">
                <Input value={driverTaxi} onChange={(e) => setDriverTaxi(e.target.value)} placeholder="Código taxi" className="h-14 rounded-2xl" />
                <Input value={driverZone} onChange={(e) => setDriverZone(e.target.value)} placeholder="Zona" className="h-14 rounded-2xl" />
              </div>
              <Button onClick={() => createDriver.mutate({ name: driverName.trim(), taxiCode: driverTaxi.trim(), zone: driverZone.trim() || "Centro" })} disabled={createDriver.isPending || driverName.trim().length < 2 || driverTaxi.trim().length < 2} className="h-14 w-full rounded-2xl bg-black font-black text-white">
                {createDriver.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}Añadir conductor
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-2xl font-black"><Car className="h-6 w-6" />Nuevo vehículo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input value={taxiCode} onChange={(e) => setTaxiCode(e.target.value)} placeholder="Código taxi" className="h-14 rounded-2xl" />
                <Input value={taxiPlate} onChange={(e) => setTaxiPlate(e.target.value)} placeholder="Matrícula" className="h-14 rounded-2xl" />
              </div>
              <Input value={taxiDriver} onChange={(e) => setTaxiDriver(e.target.value)} placeholder="Conductor asignado" className="h-14 rounded-2xl" />
              <Input value={taxiModel} onChange={(e) => setTaxiModel(e.target.value)} placeholder="Marca y modelo" className="h-14 rounded-2xl" />
              <Button onClick={() => createTaxi.mutate({ taxiCode: taxiCode.trim(), plate: taxiPlate.trim(), driverName: taxiDriver.trim() || "Sin asignar", model: taxiModel.trim() || "Vehículo pendiente" })} disabled={createTaxi.isPending || taxiCode.trim().length < 2 || taxiPlate.trim().length < 2} className="h-14 w-full rounded-2xl bg-black font-black text-white">
                {createTaxi.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}Añadir vehículo
              </Button>
            </CardContent>
          </Card>
        </div>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="text-2xl font-black">Conductores registrados ({drivers.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {snapshot.isLoading && <p className="font-bold text-zinc-500">Cargando conductores...</p>}
              {!snapshot.isLoading && drivers.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 font-bold text-zinc-500">No hay conductores registrados.</p>}
              {drivers.map((driver: any) => (
                <div key={driver.id} className="rounded-3xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">{driver.name}</p><p className="text-sm font-semibold text-zinc-500">{driver.taxi_code} · {driver.zone}</p></div><Badge variant="outline">{statusLabel(driver.status)}</Badge></div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{driverStatuses.map((status) => <Button key={status} variant={driver.status === status ? "default" : "outline"} onClick={() => updateDriver.mutate({ id: driver.id, status })} disabled={updateDriver.isPending} className="h-12 rounded-xl text-xs font-black">{statusLabel(status)}</Button>)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="text-2xl font-black">Vehículos registrados ({taxis.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {snapshot.isLoading && <p className="font-bold text-zinc-500">Cargando flota...</p>}
              {!snapshot.isLoading && taxis.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 font-bold text-zinc-500">No hay vehículos registrados.</p>}
              {taxis.map((taxi: any) => (
                <div key={taxi.id} className="rounded-3xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">{taxi.taxi_code} · {taxi.plate}</p><p className="text-sm font-semibold text-zinc-500">{taxi.model} · {taxi.driver_name}</p></div><Badge variant="outline">{statusLabel(taxi.status)}</Badge></div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{taxiStatuses.map((status) => <Button key={status} variant={taxi.status === status ? "default" : "outline"} onClick={() => updateTaxi.mutate({ id: taxi.id, status })} disabled={updateTaxi.isPending} className="h-12 rounded-xl text-xs font-black">{statusLabel(status)}</Button>)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-2xl font-black"><AlertTriangle className="h-6 w-6" />Incidencias abiertas ({incidents.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!snapshot.isLoading && incidents.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 font-bold text-zinc-500">No hay incidencias abiertas.</p>}
              {incidents.map((incident: any) => (
                <div key={incident.id} className="rounded-3xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-black">{incident.code || "Incidencia"} · {incident.type}</p><p className="mt-1 text-sm font-semibold text-zinc-600">{incident.body}</p><p className="mt-2 text-xs font-bold text-zinc-400">{formatDate(incident.created_at)}</p></div>
                    <Badge variant="outline">{incident.level || "medium"}</Badge>
                  </div>
                  <Button onClick={() => resolveIncident.mutate({ id: incident.id })} disabled={resolveIncident.isPending} className="mt-4 h-12 w-full rounded-2xl bg-black font-black text-white"><CheckCircle2 className="mr-2 h-5 w-5" />Marcar como resuelta</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-black/5 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-2xl font-black"><History className="h-6 w-6" />Actividad reciente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!snapshot.isLoading && logs.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 font-bold text-zinc-500">Todavía no hay actividad registrada.</p>}
              {logs.map((log: any) => (
                <div key={log.id} className="rounded-2xl border border-zinc-200 p-4">
                  <p className="font-bold text-black">{log.message}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-400">{formatDate(log.created_at)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
