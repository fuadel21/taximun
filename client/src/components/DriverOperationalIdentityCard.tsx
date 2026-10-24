import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Car, CheckCircle2, Loader2, MapPin, RefreshCw, Save } from "lucide-react";
import { TAXIMUN_MARKETS } from "@shared/constants";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const market = TAXIMUN_MARKETS.barcelona;
const invalidMarkers = new Set(["TX-000", "SIN-MAT", "AMB-0001", "0000-TXM"]);

type DriverLiveStatus = {
  status?: "available" | "busy" | "offline" | null;
  taxi_code?: string | null;
  plate?: string | null;
  current_zone?: string | null;
};

export function DriverOperationalIdentityCard() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const [taxiCode, setTaxiCode] = useState("");
  const [plate, setPlate] = useState("");
  const [zone, setZone] = useState<string>(market.zones[0].name);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const live = (statusQuery.data ?? null) as DriverLiveStatus | null;
  const currentStatus = live?.status ?? "offline";

  useEffect(() => {
    if (!live) return;
    setTaxiCode(live.taxi_code ?? "");
    setPlate(live.plate ?? "");
    setZone(live.current_zone ?? market.zones[0].name);
  }, [live]);

  const normalizedTaxiCode = taxiCode.trim().toUpperCase();
  const normalizedPlate = plate.trim().toUpperCase();
  const normalizedZone = zone.trim();
  const validIdentity = useMemo(
    () =>
      normalizedTaxiCode.length >= 2 &&
      normalizedPlate.length >= 2 &&
      normalizedZone.length >= 2 &&
      !invalidMarkers.has(normalizedTaxiCode) &&
      !invalidMarkers.has(normalizedPlate),
    [normalizedPlate, normalizedTaxiCode, normalizedZone]
  );

  const saveIdentity = trpc.system.taxiOps.driver.upsertStatus.useMutation({
    onSuccess: async () => {
      setError("");
      setMessage("Identidad operativa guardada correctamente.");
      await Promise.all([
        utils.system.taxiOps.driver.getStatus.invalidate(),
        utils.system.taxiOps.driver.getPendingRides.invalidate(),
      ]);
      window.setTimeout(() => setMessage(""), 2500);
    },
    onError: (mutationError) => {
      setMessage("");
      setError(mutationError.message);
    },
  });

  const save = () => {
    setMessage("");
    setError("");
    if (!validIdentity) {
      setError("Introduce un código de taxi, una matrícula y una zona reales. No se admiten valores de ejemplo.");
      return;
    }
    saveIdentity.mutate({
      status: currentStatus,
      taxiCode: normalizedTaxiCode,
      plate: normalizedPlate,
      currentZone: normalizedZone,
    });
  };

  const refresh = async () => {
    setMessage("");
    setError("");
    await statusQuery.refetch();
  };

  return (
    <section className="bg-[#f3f3f3] px-4 pt-6 text-black">
      <Card className="mx-auto max-w-5xl rounded-[2rem] border-black/5 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-zinc-500">Perfil operativo</p>
              <h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><Car className="h-7 w-7" />Taxi que trabaja ahora</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-500">Estos datos alimentan el turno y la asignación de servicios. Guardarlos no altera la posición ni marca como reciente una ubicación GPS antigua.</p>
            </div>
            <Button onClick={refresh} disabled={statusQuery.isFetching || saveIdentity.isPending} variant="outline" className="h-14 rounded-2xl bg-white px-5 font-black">
              {statusQuery.isFetching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RefreshCw className="mr-2 h-5 w-5" />}
              Actualizar
            </Button>
          </div>

          {statusQuery.error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />{statusQuery.error.message}</div>}
          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />{error}</div>}
          {message && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{message}</div>}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-2 text-sm font-black">Código o licencia del taxi<Input value={taxiCode} onChange={(event) => setTaxiCode(event.target.value)} placeholder="Ej. AMB-1234" className="h-14 rounded-2xl bg-zinc-100 px-4 font-bold uppercase" /></label>
            <label className="space-y-2 text-sm font-black">Matrícula<Input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="Ej. 1234 ABC" className="h-14 rounded-2xl bg-zinc-100 px-4 font-bold uppercase" /></label>
            <label className="space-y-2 text-sm font-black">Zona de trabajo<Input value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Zona" className="h-14 rounded-2xl bg-zinc-100 px-4 font-bold" /></label>
          </div>

          <div className="flex snap-x gap-2 overflow-x-auto pb-1">
            {market.zones.map((item) => (
              <button key={item.id} type="button" onClick={() => setZone(item.name)} className={`min-h-12 shrink-0 snap-start rounded-2xl border px-4 text-sm font-black ${zone === item.name ? "border-black bg-black text-white" : "border-zinc-200 bg-zinc-100 text-zinc-700"}`}>
                <MapPin className="mr-1 inline h-4 w-4" />{item.name}
              </button>
            ))}
          </div>

          <div className="rounded-3xl bg-zinc-100 p-4 text-sm font-semibold text-zinc-600">
            Estado conservado al guardar: <strong className="text-black">{currentStatus === "available" ? "Online" : currentStatus === "busy" ? "En servicio" : "Offline"}</strong>. La frescura GPS solo se renueva cuando llega una ubicación nueva.
          </div>

          <Button onClick={save} disabled={saveIdentity.isPending || statusQuery.isLoading} className="h-14 w-full rounded-2xl bg-black text-base font-black text-white hover:bg-black/85">
            {saveIdentity.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
            Guardar identidad operativa
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
