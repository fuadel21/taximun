import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, MapPin, PlusCircle, Save, Trash2 } from "lucide-react";

type Zone = {
  id: string;
  label: string;
  supplement_code: "airport" | "moll_adossat" | "fira" | "sants";
  applies_to: "origin" | "destination" | "both";
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  is_active: boolean;
};

type Draft = {
  id: string;
  label: string;
  supplementCode: Zone["supplement_code"];
  appliesTo: Zone["applies_to"];
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number;
  isActive: boolean;
  isNew: boolean;
};

const CODE_STYLE: Record<Zone["supplement_code"], { color: string; name: string }> = {
  airport: { color: "#f59e0b", name: "Aeropuerto" },
  moll_adossat: { color: "#3b82f6", name: "Moll Adossat" },
  fira: { color: "#8b5cf6", name: "Fira Gran Via" },
  sants: { color: "#10b981", name: "Sants" },
};
const APPLIES_LABEL: Record<Zone["applies_to"], string> = {
  both: "origen o destino",
  origin: "solo origen",
  destination: "solo destino",
};
const BARCELONA: [number, number] = [41.37, 2.13];

function zoneToDraft(zone: Zone): Draft {
  return {
    id: zone.id,
    label: zone.label,
    supplementCode: zone.supplement_code,
    appliesTo: zone.applies_to,
    centerLat: zone.center_lat,
    centerLng: zone.center_lng,
    radiusMeters: zone.radius_meters,
    isActive: zone.is_active,
    isNew: false,
  };
}

/**
 * Editor visual de las zonas geográficas que activan los suplementos de la
 * tarifa oficial: círculos sobre mapa OSM, centro arrastrable, radio ajustable
 * y alta/baja de zonas. Los cambios se aplican al presupuesto al guardar.
 */
export function AdminTariffZonesCard() {
  const zonesQuery = trpc.system.taxiAdminTariffs.listZones.useQuery(undefined, { retry: false });
  const upsert = trpc.system.taxiAdminTariffs.upsertZone.useMutation({ onSuccess: async () => zonesQuery.refetch() });
  const remove = trpc.system.taxiAdminTariffs.deleteZone.useMutation({ onSuccess: async () => zonesQuery.refetch() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<Map<string, L.Circle>>(new Map());
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const zones = (zonesQuery.data || []) as Zone[];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(BARCELONA, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      const current = draftRef.current;
      if (current) setDraft({ ...current, centerLat: Number(event.latlng.lat.toFixed(6)), centerLng: Number(event.latlng.lng.toFixed(6)) });
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      circlesRef.current.clear();
      centerMarkerRef.current = null;
    };
  }, []);

  // Círculos de todas las zonas (color por suplemento; selección resaltada).
  // La zona en edición se dibuja desde el borrador para ver los cambios en vivo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const effective: Zone[] = zones.map((zone) =>
      draft && draft.id === zone.id
        ? {
            ...zone,
            label: draft.label,
            supplement_code: draft.supplementCode,
            applies_to: draft.appliesTo,
            center_lat: draft.centerLat ?? zone.center_lat,
            center_lng: draft.centerLng ?? zone.center_lng,
            radius_meters: draft.radiusMeters,
            is_active: draft.isActive,
          }
        : zone,
    );
    if (draft && draft.isNew && draft.centerLat !== null && draft.centerLng !== null) {
      effective.push({ id: draft.id, label: draft.label, supplement_code: draft.supplementCode, applies_to: draft.appliesTo, center_lat: draft.centerLat, center_lng: draft.centerLng, radius_meters: draft.radiusMeters, is_active: draft.isActive });
    }
    const seen = new Set<string>();
    for (const zone of effective) {
      seen.add(zone.id);
      const selected = draft?.id === zone.id;
      const color = CODE_STYLE[zone.supplement_code]?.color || "#09090b";
      const center: L.LatLngExpression = [zone.center_lat, zone.center_lng];
      const tooltip = `${zone.label} · ${CODE_STYLE[zone.supplement_code]?.name || zone.supplement_code} · ${APPLIES_LABEL[zone.applies_to]} · r ${zone.radius_meters} m${zone.is_active ? "" : " · inactiva"}`;
      const existing = circlesRef.current.get(zone.id);
      if (existing) {
        existing.setLatLng(center);
        existing.setRadius(zone.radius_meters);
        existing.setStyle({ color, weight: selected ? 4 : 2, opacity: zone.is_active ? 1 : 0.35, fillOpacity: selected ? 0.18 : 0.08 });
        existing.setTooltipContent(tooltip);
      } else {
        const circle = L.circle(center, {
          radius: zone.radius_meters,
          color,
          weight: selected ? 4 : 2,
          opacity: zone.is_active ? 1 : 0.35,
          fillColor: color,
          fillOpacity: selected ? 0.18 : 0.08,
          dashArray: zone.is_active ? undefined : "4 6",
          bubblingMouseEvents: false,
        })
          .bindTooltip(tooltip, { direction: "top" })
          .on("click", () => setDraft(zoneToDraft(zone)))
          .addTo(map);
        circlesRef.current.set(zone.id, circle);
      }
    }
    for (const [id, circle] of Array.from(circlesRef.current.entries())) {
      if (!seen.has(id)) {
        circle.remove();
        circlesRef.current.delete(id);
      }
    }
  }, [zones, draft]);

  // Marcador arrastrable del centro de la zona en edición.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (draft && draft.centerLat !== null && draft.centerLng !== null) {
      const latLng: L.LatLngExpression = [draft.centerLat, draft.centerLng];
      if (centerMarkerRef.current) {
        centerMarkerRef.current.setLatLng(latLng);
      } else {
        const marker = L.marker(latLng, { draggable: true }).addTo(map);
        marker.bindTooltip("Arrastra para mover el centro de la zona", { direction: "top" });
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          const current = draftRef.current;
          if (current) setDraft({ ...current, centerLat: Number(position.lat.toFixed(6)), centerLng: Number(position.lng.toFixed(6)) });
        });
        centerMarkerRef.current = marker;
      }
    } else if (centerMarkerRef.current) {
      centerMarkerRef.current.remove();
      centerMarkerRef.current = null;
    }
  }, [draft?.centerLat, draft?.centerLng]);

  // Encuadre inicial cuando llegan las zonas.
  const fittedRef = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || zones.length === 0) return;
    const key = zones.map((zone) => zone.id).join(",");
    if (key === fittedRef.current) return;
    fittedRef.current = key;
    const points = zones.map((zone) => [zone.center_lat, zone.center_lng] as L.LatLngExpression);
    map.fitBounds(L.latLngBounds(points).pad(0.4));
  }, [zones]);

  const save = async () => {
    setError(""); setNotice("");
    if (!draft) return;
    if (draft.centerLat === null || draft.centerLng === null) return setError("Toca el mapa para situar el centro de la zona.");
    if (draft.label.trim().length < 2) return setError("Pon un nombre a la zona.");
    try {
      await upsert.mutateAsync({
        id: draft.id,
        label: draft.label.trim(),
        supplementCode: draft.supplementCode,
        appliesTo: draft.appliesTo,
        centerLat: draft.centerLat,
        centerLng: draft.centerLng,
        radiusMeters: Math.round(draft.radiusMeters),
        isActive: draft.isActive,
      });
      setNotice(`Zona «${draft.label}» guardada. El motor de precios ya la aplica.`);
      setDraft({ ...draft, isNew: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la zona.");
    }
  };

  const removeZone = async () => {
    setError(""); setNotice("");
    if (!draft || draft.isNew) return setDraft(null);
    try {
      await remove.mutateAsync({ id: draft.id });
      setNotice(`Zona «${draft.label}» eliminada.`);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la zona.");
    }
  };

  return (
    <div className="rounded-[2rem] border-0 bg-white p-1">
      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="relative m-3 overflow-hidden rounded-3xl border border-zinc-200">
          <div ref={containerRef} className="h-[420px] w-full" />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-2xl bg-white/95 px-3 py-2 text-xs font-black text-zinc-800 shadow-md">
            {draft ? (draft.centerLat === null ? "Toca el mapa para situar el centro" : "Arrastra el pin o toca el mapa · pulsa un círculo para editarlo") : "Pulsa un círculo para editarlo"}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-2xl bg-white/95 px-3 py-2 text-[10px] font-black text-zinc-700 shadow-md">
            {Object.entries(CODE_STYLE).map(([code, style]) => (
              <span key={code} className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: style.color }} />
                {style.name}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-xl font-black">Zonas con suplemento</h2>
            <p className="mt-1 text-sm font-bold text-zinc-400">Geografía que activa cada suplemento oficial. El radio y el centro se editan sobre el mapa.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {zones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setDraft(zoneToDraft(zone))}
                className={`rounded-2xl border px-3 py-2 text-left text-xs font-black ${draft?.id === zone.id ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CODE_STYLE[zone.supplement_code]?.color }} />
                  {zone.label}
                </span>
                <span className={`mt-0.5 block text-[10px] font-bold ${draft?.id === zone.id ? "text-white/60" : "text-zinc-400"}`}>
                  {APPLIES_LABEL[zone.applies_to]} · {zone.radius_meters} m{zone.is_active ? "" : " · inactiva"}
                </span>
              </button>
            ))}
            <button
              onClick={() => setDraft({ id: `zona-${Date.now().toString(36)}`, label: "Nueva zona", supplementCode: "airport", appliesTo: "both", centerLat: null, centerLng: null, radiusMeters: 500, isActive: true, isNew: true })}
              className="rounded-2xl border border-dashed border-zinc-300 px-3 py-2 text-xs font-black text-zinc-500 hover:border-black hover:text-black"
            >
              <PlusCircle className="mr-1 inline h-4 w-4" />Nueva zona
            </button>
          </div>

          {zonesQuery.isLoading && <p className="text-sm font-bold text-zinc-400"><Loader2 className="mr-2 inline animate-spin" />Cargando zonas…</p>}
          {notice && <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />{notice}</p>}
          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

          {draft && (
            <div className="space-y-3 rounded-3xl border border-zinc-200 p-4">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-black">Identificador</span>
                  <Input value={draft.id} disabled={!draft.isNew} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} className="mt-1 h-11 rounded-xl text-sm font-bold" />
                </label>
                <label className="block">
                  <span className="text-xs font-black">Nombre</span>
                  <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="mt-1 h-11 rounded-xl text-sm font-bold" />
                </label>
                <label className="block">
                  <span className="text-xs font-black">Suplemento que activa</span>
                  <select value={draft.supplementCode} onChange={(e) => setDraft({ ...draft, supplementCode: e.target.value as Zone["supplement_code"] })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold">
                    {Object.entries(CODE_STYLE).map(([code, style]) => <option key={code} value={code}>{style.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black">Aplica en</span>
                  <select value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value as Zone["applies_to"] })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold">
                    <option value="both">Origen o destino</option>
                    <option value="origin">Solo origen</option>
                    <option value="destination">Solo destino</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black">Radio (metros)</span>
                  <Input type="number" min={50} max={10000} step={50} value={draft.radiusMeters} onChange={(e) => setDraft({ ...draft, radiusMeters: Number(e.target.value) })} className="mt-1 h-11 rounded-xl text-sm font-bold" />
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-5 w-5 rounded" />
                  <span className="text-xs font-black">Zona activa</span>
                </label>
              </div>
              <p className="text-xs font-bold text-zinc-400">
                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                {draft.centerLat !== null ? `Centro: ${draft.centerLat.toFixed(5)}, ${draft.centerLng?.toFixed(5)}` : "Sin centro: toca el mapa"}
              </p>
              <div className="flex gap-2">
                <Button onClick={save} disabled={upsert.isPending} className="h-12 flex-1 rounded-2xl bg-black font-black text-white hover:bg-zinc-800">
                  {upsert.isPending ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}Guardar zona
                </Button>
                <Button onClick={() => setDraft(null)} variant="outline" className="h-12 rounded-2xl font-black">Cerrar</Button>
                {!draft.isNew && <Button onClick={removeZone} variant="outline" className="h-12 rounded-2xl font-black text-red-700 hover:bg-red-50"><Trash2 /></Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
