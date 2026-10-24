import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";

type Field = { key: string; label: string; hint: string; step?: string };

const GROUPS: Array<{ title: string; note: string; fields: Field[] }> = [
  {
    title: "Tarifa T1 · laborables de 8:00 a 20:00",
    note: "Tramo horario diurno de lunes a viernes no festivos.",
    fields: [
      { key: "t1_flag_drop", label: "Bajada de bandera T1 (€)", hint: "Importe inicial al subir al taxi", step: "0.01" },
      { key: "t1_per_km", label: "Precio por kilómetro T1 (€)", hint: "Concepto distancia diurno", step: "0.001" },
    ],
  },
  {
    title: "Tarifa T2 · laborables de 20:00 a 8:00 y sábados y festivos 24 h",
    note: "Tramo nocturno y de fin de semana.",
    fields: [
      { key: "t2_flag_drop", label: "Bajada de bandera T2 (€)", hint: "Importe inicial en tramo T2", step: "0.01" },
      { key: "t2_per_km", label: "Precio por kilómetro T2 (€)", hint: "Concepto distancia en tramo T2", step: "0.001" },
    ],
  },
  {
    title: "Suplementos oficiales",
    note: "Se aplican por zona geográfica (geolocalizados) o por categoría de vehículo.",
    fields: [
      { key: "sup_airport", label: "Aeropuerto (origen o destino) (€)", hint: "Aeropuerto Josep Tarradellas BCN-El Prat", step: "0.01" },
      { key: "sup_moll_adossat", label: "Moll Adossat · cruceros (€)", hint: "Terminal de cruceros del Port de Barcelona", step: "0.01" },
      { key: "sup_fira_origen", label: "Fira Gran Via · solo origen (€)", hint: "Recintos feriales de L'Hospitalet", step: "0.01" },
      { key: "sup_sants_origen", label: "Estació de Sants · solo origen (€)", hint: "Estación de tren de Barcelona Sants", step: "0.01" },
      { key: "sup_large_vehicle", label: "Vehículo de 5 a 8 plazas (€)", hint: "Categoría monovolumen", step: "0.01" },
      { key: "sup_special_night", label: "Noche especial (€)", hint: "Sant Joan, Nochebuena y Fin de Año (20:00-8:00)", step: "0.01" },
    ],
  },
  {
    title: "Mínimos y topes",
    note: "Percepciones mínimas obligatorias y tope de suplementos.",
    fields: [
      { key: "min_airport_total", label: "Carrera mínima desde el aeropuerto (€)", hint: "Incluye todos los suplementos", step: "0.01" },
      { key: "min_app_service", label: "Mínima servicio concertado por app (€)", hint: "Percepción mínima de servicios por aplicación", step: "0.01" },
      { key: "max_supplements", label: "Tope de la suma de suplementos (€)", hint: "Límite máximo acumulado", step: "0.01" },
      { key: "t4_flat_port_airport", label: "T4 fijo aeropuerto ↔ Moll Adossat (€)", hint: "Precio cerrado en ambos sentidos", step: "0.01" },
    ],
  },
  {
    title: "Ajustes de la plataforma",
    note: "Cargos y factores propios de Taximun sobre la tarifa oficial.",
    fields: [
      { key: "waiting_per_hour", label: "Espera o detención por hora (€)", hint: "Referencia informativa del taxímetro", step: "0.01" },
      { key: "service_fee", label: "Cargo de servicio de la app (€)", hint: "0 = el precio coincide con el taxímetro", step: "0.01" },
      { key: "comfort_multiplier", label: "Multiplicador categoría confort", hint: "1 = tarifa oficial exacta", step: "0.001" },
      { key: "road_factor", label: "Factor recta → carretera", hint: "Estimación de km cuando no hay ruta real", step: "0.001" },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((group) => group.fields.map((field) => field.key));

export default function AdminTariffsPage() {
  const configQuery = trpc.system.taxiAdminTariffs.get.useQuery(undefined, { retry: false });
  const update = trpc.system.taxiAdminTariffs.update.useMutation({ onSuccess: async () => configQuery.refetch() });
  const [form, setForm] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!configQuery.data) return;
    const config = configQuery.data.config as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const key of ALL_KEYS) next[key] = String(config[key] ?? "");
    setForm(next);
  }, [configQuery.data]);

  const submit = async () => {
    setError(""); setNotice("");
    try {
      const payload: Record<string, number> = {};
      for (const key of ALL_KEYS) {
        const value = Number(form[key]);
        if (!Number.isFinite(value)) throw new Error(`El campo ${key} no es un número válido.`);
        payload[key] = value;
      }
      await update.mutateAsync({
        t1FlagDrop: payload.t1_flag_drop, t1PerKm: payload.t1_per_km,
        t2FlagDrop: payload.t2_flag_drop, t2PerKm: payload.t2_per_km,
        waitingPerHour: payload.waiting_per_hour,
        supAirport: payload.sup_airport, supMollAdossat: payload.sup_moll_adossat,
        supFiraOrigen: payload.sup_fira_origen, supSantsOrigen: payload.sup_sants_origen,
        supLargeVehicle: payload.sup_large_vehicle, supSpecialNight: payload.sup_special_night,
        minAirportTotal: payload.min_airport_total, minAppService: payload.min_app_service,
        maxSupplements: payload.max_supplements, t4FlatPortAirport: payload.t4_flat_port_airport,
        serviceFee: payload.service_fee, comfortMultiplier: payload.comfort_multiplier,
        roadFactor: payload.road_factor,
      } as any);
      setNotice("Tarifa actualizada. El motor de precios ya usa los nuevos importes.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la tarifa."); }
  };

  return <main className="bg-[#f3f3f3] px-4 py-6 text-black"><div className="mx-auto max-w-5xl space-y-5">
    <div>
      <p className="text-sm font-black text-zinc-500">Tarifa metropolitana de Barcelona</p>
      <h1 className="text-4xl font-black tracking-tight">Tarifas oficiales del taxi (AMB)</h1>
      <p className="mt-2 font-semibold text-zinc-500">Motor de precio cerrado por adelantado: bajada de bandera + €/km del tramo horario (T1/T2) + suplementos oficiales + mínimos. Los cambios se aplican al instante en los presupuestos y reservas.</p>
    </div>
    {(error || configQuery.error) && <div className="rounded-3xl bg-red-50 p-4 font-bold text-red-700">{error || configQuery.error?.message}</div>}
    {notice && <div className="rounded-3xl bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}
    {configQuery.isLoading && <div className="rounded-3xl bg-white p-6 font-bold text-zinc-500"><Loader2 className="mr-2 inline animate-spin" />Cargando configuración…</div>}
    {configQuery.data && GROUPS.map((group) => (
      <Card key={group.title} className="rounded-[2rem] border-0 bg-white"><CardContent className="p-5 sm:p-7">
        <h2 className="text-xl font-black">{group.title}</h2>
        <p className="mt-1 text-sm font-bold text-zinc-400">{group.note}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {group.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-sm font-black">{field.label}</span>
              <Input type="number" step={field.step || "0.01"} value={form[field.key] || ""} onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))} className="mt-1 h-14 rounded-2xl font-black" />
              <span className="mt-1 block text-xs font-bold text-zinc-400">{field.hint}</span>
            </label>
          ))}
        </div>
      </CardContent></Card>
    ))}
    {configQuery.data && (
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-3xl bg-black p-4 text-white shadow-xl">
        <p className="flex-1 text-sm font-bold text-white/60">Última actualización: {configQuery.data.updatedAt ? new Date(configQuery.data.updatedAt).toLocaleString("es-ES") : "—"}</p>
        <Button variant="outline" onClick={() => configQuery.refetch()} className="h-12 rounded-2xl font-black"><RotateCcw className="mr-2" />Descartar cambios</Button>
        <Button onClick={submit} disabled={update.isPending} className="h-12 rounded-2xl bg-cyan-600 font-black text-white hover:bg-cyan-500">{update.isPending ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}Guardar tarifa</Button>
      </div>
    )}
  </div></main>;
}
