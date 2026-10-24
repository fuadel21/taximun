import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { fetchDrivingRoute, reverseGeocode, searchPlaces, type OsmPlace, type OsmRoute } from "@/lib/osm-services";
import { RideMapPicker, type MapPlace } from "@/components/RideMapPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accessibility, Baby, BriefcaseBusiness, CalendarClock, Car, Cat, CheckCircle2, Clock3, Crosshair, Euro, Gift, Loader2, MapPin, Plus, Route, Users, X } from "lucide-react";

type Category = "standard" | "comfort" | "van" | "accessible";
type PaymentMethod = "cash" | "card" | "bizum";
type Requirements = { wheelchair: boolean; largeLuggage: boolean; pet: boolean; childSeat: boolean; hearingAssistance: boolean; visualAssistance: boolean; reducedMobility: boolean; notes: string };
type Stop = { address: string };
type Booking = { id: string; pickup_address: string; dropoff_address: string; scheduled_at: string; service_category: Category; payment_method: PaymentMethod; estimated_fare: number | string; status: string; intermediate_stops?: Stop[]; passenger_requirements?: Requirements; promo_code?: string | null; pickup_lat?: number | null; pickup_lng?: number | null; dropoff_lat?: number | null; dropoff_lng?: number | null };
type QuoteData = {
  total: number; subtotal: number; discount: number; lowerFare: number; upperFare: number;
  distanceKm: number; durationMinutes: number; promoCode: string | null;
  breakdown: {
    tariff: string; tariffLabel: string; isFlatRate: boolean; baseFare: number; perKm: number; distanceFare: number;
    timeFare?: number; timeMinutes?: number; perMinute?: number;
    supplements?: Array<{ code: string; label: string; amount: number }>; supplementsTotal?: number;
    minimumApplied?: number | null; minimumLabel?: string | null; bookingFee?: number; routeSource?: string;
  };
};

const BARCELONA_CENTER: MapPlace = { lat: 41.3874, lng: 2.1686, address: "Plaça de Catalunya · Barcelona" };

const categories = [
  { id: "standard" as const, title: "Turismo", icon: Car, note: "Tarifa oficial exacta" },
  { id: "comfort" as const, title: "Confort", icon: BriefcaseBusiness, note: "Tarifa oficial exacta" },
  { id: "van" as const, title: "Monovolumen", icon: Users, note: "+ suplemento 5-8 plazas" },
  { id: "accessible" as const, title: "Taxi adaptado", icon: Accessibility, note: "Sin suplemento" },
];
const needs = [
  ["wheelchair", "Silla de ruedas", Accessibility], ["reducedMobility", "Movilidad reducida", Accessibility], ["largeLuggage", "Equipaje grande", BriefcaseBusiness],
  ["pet", "Mascota", Cat], ["childSeat", "Silla infantil", Baby], ["hearingAssistance", "Apoyo auditivo", Accessibility], ["visualAssistance", "Apoyo visual", Accessibility],
] as const;
const empty: Requirements = { wheelchair: false, largeLuggage: false, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "" };
const money = (value: unknown) => `${Number(value || 0).toFixed(2)} €`;

function CategoryCard({ input, enabled, category, selected, onSelect, onQuote }: {
  input: Record<string, unknown>;
  enabled: boolean;
  category: (typeof categories)[number];
  selected: boolean;
  onSelect: () => void;
  onQuote: (id: Category, data: QuoteData | undefined) => void;
}) {
  const quote = trpc.system.taxiPassengerBooking.quote.useQuery(
    { ...(input as any), category: category.id },
    { enabled, retry: false, staleTime: 15000 },
  );
  useEffect(() => {
    onQuote(category.id, quote.data as QuoteData | undefined);
  }, [quote.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = category.icon;
  return (
    <button onClick={onSelect} className={`min-h-28 rounded-3xl border p-4 text-left font-black transition ${selected ? "border-black bg-black text-white" : "border-zinc-200 bg-white hover:border-zinc-400"}`}>
      <div className="flex items-start justify-between">
        <Icon className="mb-4 h-7 w-7" />
        <span className={`text-lg ${selected ? "text-white" : "text-black"}`}>
          {enabled ? (quote.isLoading ? "…" : quote.error ? "—" : money(quote.data?.total)) : "—"}
        </span>
      </div>
      <p>{category.title}</p>
      <p className={`mt-1 text-[11px] font-bold ${selected ? "text-white/60" : "text-zinc-400"}`}>{category.note}</p>
    </button>
  );
}

export default function PassengerAdvancedBookingPage() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [pickup, setPickup] = useState<MapPlace | null>(null);
  const [dropoff, setDropoff] = useState<MapPlace | null>(null);
  const [route, setRoute] = useState<OsmRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pickMode, setPickMode] = useState<"pickup" | "dropoff">("dropoff");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<OsmPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState<Category>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [intermediateStops, setIntermediateStops] = useState<Stop[]>([]);
  const [requirements, setRequirements] = useState<Requirements>(empty);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const bootstrappedRef = useRef(false);

  // Ubicación del usuario al entrar (con respaldo en el centro de Barcelona).
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let done = false;
    const fallback = setTimeout(() => {
      if (!done) setPickup((current) => current || BARCELONA_CENTER);
    }, 5000);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          done = true;
          clearTimeout(fallback);
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          setPickup((current) => current || { lat, lng, address: "Tu ubicación" });
          const address = await reverseGeocode(lat, lng).catch(() => null);
          if (address) setPickup((current) => (current && current.address === "Tu ubicación" ? { ...current, address } : current));
        },
        () => {
          done = true;
          clearTimeout(fallback);
          setPickup((current) => current || BARCELONA_CENTER);
        },
        { enableHighAccuracy: false, timeout: 4500, maximumAge: 120000 },
      );
    } else setPickup((current) => current || BARCELONA_CENTER);
    return () => clearTimeout(fallback);
  }, []);

  // Búsqueda de destino con Nominatim (debounce).
  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(query, controller.signal);
        setResults(found);
      } catch {
        /* cancelado */
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchText]);

  // Ruta real de conducción (OSRM) al tener origen y destino.
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      return;
    }
    let stale = false;
    setRouteLoading(true);
    fetchDrivingRoute(pickup, dropoff).then((value) => {
      if (stale) return;
      setRoute(value);
      setRouteLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [pickup, dropoff]);

  const useMyLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setUserLocation({ lat, lng });
      setPickup({ lat, lng, address: "Tu ubicación" });
      const address = await reverseGeocode(lat, lng).catch(() => null);
      if (address) setPickup((current) => (current ? { ...current, address } : current));
      setPickMode("dropoff");
    });
  };

  const handleMapPick = async (lat: number, lng: number) => {
    const label = await reverseGeocode(lat, lng).catch(() => `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    if (pickMode === "pickup") {
      setPickup({ lat, lng, address: label });
      setPickMode("dropoff");
    } else {
      setDropoff({ lat, lng, address: label });
    }
  };

  const chooseResult = (place: OsmPlace) => {
    setDropoff({ lat: place.lat, lng: place.lng, address: place.displayName.split(",").slice(0, 3).join(",").trim() });
    setSearchText("");
    setResults([]);
  };

  const stopsClean = useMemo(() => intermediateStops.filter((item) => item.address.trim()), [intermediateStops]);
  const quoteReady = Boolean(pickup && dropoff) && (mode === "now" || Boolean(scheduledAt));
  const quoteInput = useMemo(() => ({
    pickupAddress: pickup?.address || "",
    dropoffAddress: dropoff?.address || "",
    ...(pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
    ...(dropoff ? { dropoffLat: dropoff.lat, dropoffLng: dropoff.lng } : {}),
    ...(route ? { routeDistanceKm: route.distanceKm, routeDurationMinutes: route.durationMinutes } : {}),
    paymentMethod,
    intermediateStops: stopsClean,
    requirements,
    promoCode: promoCode || undefined,
    ...(mode === "scheduled" && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    ...(editingId ? { editingBookingId: editingId } : {}),
  }), [pickup, dropoff, route, paymentMethod, stopsClean, requirements, promoCode, mode, scheduledAt, editingId]);

  const bookingsQuery = trpc.system.taxiPassengerBooking.listScheduled.useQuery(undefined, { retry: false });
  const createNow = trpc.system.taxiPassengerBooking.createImmediate.useMutation();
  const createLater = trpc.system.taxiPassengerBooking.createScheduled.useMutation();
  const updateLater = trpc.system.taxiPassengerBooking.updateScheduled.useMutation();
  const cancelLater = trpc.system.taxiPassengerBooking.cancelScheduled.useMutation();
  const busy = createNow.isPending || createLater.isPending || updateLater.isPending || cancelLater.isPending;
  const bookings = (bookingsQuery.data || []) as Booking[];
  const activeQuote = quotes[category];

  const submit = async () => {
    setError(""); setNotice("");
    if (!pickup || !dropoff) return setError("Fija la recogida y el destino (busca o toca el mapa).");
    if (mode === "scheduled" && !scheduledAt) return setError("Elige fecha y hora de la reserva.");
    try {
      const payload = {
        pickupAddress: pickup.address, dropoffAddress: dropoff.address,
        pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
        ...(route ? { routeDistanceKm: route.distanceKm, routeDurationMinutes: route.durationMinutes } : {}),
        category, paymentMethod, intermediateStops: stopsClean, requirements, promoCode: promoCode || undefined,
      };
      if (mode === "now") await createNow.mutateAsync(payload);
      else if (editingId) await updateLater.mutateAsync({ ...payload, id: editingId, scheduledAt: new Date(scheduledAt).toISOString() });
      else await createLater.mutateAsync({ ...payload, scheduledAt: new Date(scheduledAt).toISOString() });
      setNotice("Reserva creada con precio oficial cerrado por adelantado.");
      setDropoff(null); setRoute(null); setSearchText(""); setScheduledAt(""); setIntermediateStops([]); setRequirements(empty); setPromoInput(""); setPromoCode(""); setEditingId(null); setQuotes({});
      await bookingsQuery.refetch(); await utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la reserva."); }
  };
  const edit = (booking: Booking) => {
    setMode("scheduled"); setEditingId(booking.id);
    setPickup({
      lat: Number(booking.pickup_lat ?? BARCELONA_CENTER.lat),
      lng: Number(booking.pickup_lng ?? BARCELONA_CENTER.lng),
      address: booking.pickup_address,
    });
    setDropoff({
      lat: Number(booking.dropoff_lat ?? BARCELONA_CENTER.lat),
      lng: Number(booking.dropoff_lng ?? BARCELONA_CENTER.lng),
      address: booking.dropoff_address,
    });
    setScheduledAt(new Date(booking.scheduled_at).toISOString().slice(0, 16));
    setCategory(booking.service_category); setPaymentMethod(booking.payment_method || "cash");
    setIntermediateStops(booking.intermediate_stops || []); setRequirements(booking.passenger_requirements || empty);
    setPromoCode(booking.promo_code || ""); setPromoInput(booking.promo_code || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const breakdown = activeQuote?.breakdown;
  const officialLines = breakdown ? [
    breakdown.isFlatRate
      ? ["Precio fijo T4", breakdown.supplementsTotal ?? breakdown.distanceFare]
      : ["Bajada de bandera", breakdown.baseFare],
    ...(!breakdown.isFlatRate ? [["Recorrido", breakdown.distanceFare] as [string, number]] : []),
    ...(!breakdown.isFlatRate && (breakdown.timeFare || 0) > 0
      ? [[`Tiempo con tráfico · ${breakdown.timeMinutes ?? 0} min × ${Number(breakdown.perMinute || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} €`, breakdown.timeFare] as [string, number]]
      : []),
    ...(breakdown.supplements || []).map((item) => [item.label, item.amount] as [string, number]),
    ...(breakdown.minimumApplied ? [[breakdown.minimumLabel || "Mínimo aplicado", breakdown.minimumApplied - (breakdown.baseFare + breakdown.distanceFare + (breakdown.supplementsTotal || 0) + (breakdown.bookingFee || 0))] as [string, number]] : []),
    ...((breakdown.bookingFee || 0) > 0 ? [["Cargo de servicio de la app", breakdown.bookingFee] as [string, number]] : []),
  ].filter(([, value]) => Number(value || 0) > 0.001) : [];

  return <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black"><div className="mx-auto max-w-6xl space-y-5">
    {(error || bookingsQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error || bookingsQuery.error?.message}</div>}
    {notice && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}

    <Card className="overflow-hidden rounded-[2rem] border-0 bg-white">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[1.15fr_1fr]">
          {/* Mapa + búsqueda */}
          <div className="space-y-4 p-5 sm:p-7">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setMode("now"); setEditingId(null); }} className={`min-h-16 rounded-2xl p-4 text-left font-black ${mode === "now" ? "bg-black text-white" : "bg-zinc-100"}`}><Clock3 className="mb-2" />Pedir ahora</button>
              <button onClick={() => setMode("scheduled")} className={`min-h-16 rounded-2xl p-4 text-left font-black ${mode === "scheduled" ? "bg-black text-white" : "bg-zinc-100"}`}><CalendarClock className="mb-2" />Programar</button>
            </div>
            {mode === "scheduled" && <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-14 rounded-2xl" />}

            <div className="relative">
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 p-3">
                <MapPin className="ml-2 h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="¿A dónde vas? Busca una dirección en Barcelona"
                  className="h-11 w-full bg-transparent text-base font-bold outline-none placeholder:font-bold placeholder:text-zinc-400"
                />
                {searching && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" />}
                {!searching && searchText && <button onClick={() => { setSearchText(""); setResults([]); }} className="shrink-0 rounded-full p-1 hover:bg-zinc-200"><X className="h-4 w-4" /></button>}
              </div>
              {(results.length > 0 || (searchText.trim().length >= 3 && !searching)) && (
                <div className="absolute z-[600] mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                  {results.map((place, index) => (
                    <button key={`${place.lat}-${place.lng}-${index}`} onClick={() => chooseResult(place)} className="flex w-full items-start gap-3 border-b border-zinc-100 p-3 text-left last:border-0 hover:bg-zinc-50">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                      <span><span className="block text-sm font-black">{place.name}</span><span className="block text-xs font-bold text-zinc-400">{place.displayName}</span></span>
                    </button>
                  ))}
                  <button onClick={() => { setPickMode("dropoff"); setSearchText(""); setResults([]); }} className="w-full p-3 text-left text-sm font-black text-cyan-700 hover:bg-cyan-50">O toca el mapa para fijar el destino</button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className={`flex items-center gap-2 rounded-2xl border p-3 ${pickMode === "pickup" ? "border-cyan-600 bg-cyan-50" : "border-zinc-200"}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[10px] font-black text-white">A</span>
                <span className="min-w-0 flex-1 truncate text-sm font-black">{pickup ? pickup.address : "Detectando tu ubicación…"}</span>
                <button onClick={() => setPickMode(pickMode === "pickup" ? "dropoff" : "pickup")} className={`shrink-0 rounded-xl px-2 py-1 text-xs font-black ${pickMode === "pickup" ? "bg-black text-white" : "bg-zinc-100 text-zinc-700"}`}>Ajustar</button>
                <button onClick={useMyLocation} title="Usar mi ubicación" className="shrink-0 rounded-xl bg-zinc-100 p-2 hover:bg-zinc-200"><Crosshair className="h-4 w-4" /></button>
              </div>
              <div className={`flex items-center gap-2 rounded-2xl border p-3 ${pickMode === "dropoff" ? "border-cyan-600 bg-cyan-50" : "border-zinc-200"}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-black text-[10px] font-black text-white">B</span>
                <span className="min-w-0 flex-1 truncate text-sm font-black">{dropoff ? dropoff.address : "Busca el destino o tócalo en el mapa"}</span>
                {dropoff && <button onClick={() => { setDropoff(null); setRoute(null); }} className="shrink-0 rounded-xl bg-zinc-100 p-2 hover:bg-zinc-200"><X className="h-4 w-4" /></button>}
              </div>
            </div>

            <RideMapPicker pickup={pickup} dropoff={dropoff} route={route} pickMode={pickMode} onMapPick={handleMapPick} userLocation={userLocation} className="h-[340px] sm:h-[420px]" />
            <p className="text-xs font-bold text-zinc-400">
              {route ? `Ruta real por carretera · ${route.distanceKm.toFixed(1)} km` : routeLoading ? "Calculando ruta…" : "Mapa © OpenStreetMap · toca para elegir puntos"}
            </p>
          </div>

          {/* Opciones y precio */}
          <div className="space-y-6 border-t border-zinc-100 p-5 sm:p-7 lg:border-l lg:border-t-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((item) => (
                <CategoryCard key={item.id} input={quoteInput} enabled={quoteReady} category={item} selected={category === item.id} onSelect={() => setCategory(item.id)}
                  onQuote={(id, data) => setQuotes((current) => (data ? { ...current, [id]: data } : current))} />
              ))}
            </div>

            {intermediateStops.map((stop, index) => <div key={index} className="flex gap-2">
              <Input value={stop.address} onChange={(e) => setIntermediateStops((items) => items.map((item, i) => i === index ? { address: e.target.value } : item))} placeholder={`Parada ${index + 1}`} className="h-14 rounded-2xl" />
              <Button variant="outline" onClick={() => setIntermediateStops((items) => items.filter((_, i) => i !== index))} className="h-14 w-14 rounded-2xl"><X /></Button>
            </div>)}
            {intermediateStops.length < 2 && <Button variant="outline" onClick={() => setIntermediateStops((items) => [...items, { address: "" }])} className="h-12 w-full rounded-2xl bg-white font-black"><Plus className="mr-2" />Añadir parada intermedia</Button>}

            <div>
              <p className="mb-3 text-sm font-black text-zinc-500">Necesidades y accesibilidad</p>
              <div className="grid gap-2 sm:grid-cols-2">{needs.map(([key, label, Icon]) => <button key={key} onClick={() => setRequirements((current) => ({ ...current, [key]: !current[key] }))} className={`min-h-14 rounded-2xl border p-3 text-left font-black ${requirements[key] ? "border-black bg-black text-white" : "border-zinc-200"}`}><Icon className="mr-2 inline h-5 w-5" />{label}</button>)}</div>
              <Input value={requirements.notes} onChange={(e) => setRequirements((current) => ({ ...current, notes: e.target.value }))} placeholder="Indicaciones adicionales" className="mt-3 h-14 rounded-2xl" />
              <p className="mt-2 text-xs font-bold text-zinc-500">La discapacidad o necesidad de apoyo no genera suplemento por sí misma.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">{(["cash", "card", "bizum"] as PaymentMethod[]).map((item) => <button key={item} onClick={() => setPaymentMethod(item)} className={`h-14 rounded-2xl border font-black ${paymentMethod === item ? "bg-black text-white" : "bg-white"}`}>{item === "cash" ? "Efectivo" : item === "card" ? "Tarjeta" : "Bizum"}</button>)}</div>

            <div className="rounded-3xl border p-4">
              <p className="font-black"><Gift className="mr-2 inline" />Código promocional</p>
              <div className="mt-3 flex gap-2"><Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="BIENVENIDA" className="h-14 rounded-2xl" /><Button onClick={() => setPromoCode(promoInput.trim().toUpperCase())} className="h-14 rounded-2xl bg-black font-black text-white">Aplicar</Button></div>
              {promoCode && <button onClick={() => { setPromoCode(""); setPromoInput(""); setQuotes({}); }} className="mt-2 text-sm font-black underline">Quitar {promoCode}</button>}
            </div>
          </div>
        </div>

        {/* Precio oficial cerrado */}
        <div className="border-t border-zinc-100 bg-black p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black text-white/50">Precio cerrado por adelantado · tarifa oficial AMB{breakdown?.tariff === "T3" ? " (T3 por app)" : ""}</p>
              <p className="mt-1 text-4xl font-black sm:text-5xl">{quoteReady ? (activeQuote ? money(activeQuote.total) : "…") : "Elige el destino"}</p>
              <p className="mt-2 text-sm font-bold text-white/50">
                {activeQuote ? `${breakdown?.tariffLabel || ""} · ${activeQuote.distanceKm} km · ${activeQuote.durationMinutes} min` : "Se calcula con la tarifa metropolitana vigente"}
              </p>
              {activeQuote && activeQuote.discount > 0 && <p className="mt-1 text-sm font-black text-emerald-300">Descuento {activeQuote.promoCode}: −{money(activeQuote.discount)}</p>}
            </div>
            <div className="text-right">
              <Euro className="ml-auto h-8 w-8 text-white/40" />
              {activeQuote && <p className="mt-2 text-xs font-bold text-white/40">Rango con tráfico: {money(activeQuote.lowerFare)} – {money(activeQuote.upperFare)}</p>}
            </div>
          </div>
          {officialLines.length > 0 && activeQuote && (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
              {officialLines.map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4 text-sm font-bold"><span className="text-white/60">{label}</span><span>{money(value)}</span></div>)}
              {breakdown?.routeSource === "client_osrm" && <p className="pt-1 text-[11px] font-bold text-white/30">Kilometraje medido sobre la ruta real por carretera (OSRM).</p>}
              <div className="flex justify-between border-t border-white/10 pt-3 font-black"><span>Total a pagar</span><span>{money(activeQuote.total)}</span></div>
            </div>
          )}
          <Button onClick={submit} disabled={busy || !quoteReady || !activeQuote} className="mt-5 h-16 w-full rounded-2xl bg-cyan-600 text-lg font-black text-white hover:bg-cyan-500">{busy ? <Loader2 className="mr-2 animate-spin" /> : <Route className="mr-2" />}{editingId ? "Guardar cambios y precio" : "Confirmar viaje"}</Button>
        </div>
      </CardContent>
    </Card>

    <Card className="rounded-[2rem] border-0 bg-white"><CardContent className="p-5"><h2 className="text-2xl font-black">Reservas programadas</h2><div className="mt-4 space-y-3">{bookings.map((booking) => <div key={booking.id} className="rounded-3xl bg-zinc-100 p-4"><p className="font-black">{booking.pickup_address} → {booking.dropoff_address}</p><p className="mt-1 text-sm font-bold text-zinc-500">{new Date(booking.scheduled_at).toLocaleString("es-ES")} · {money(booking.estimated_fare)} {booking.promo_code ? `· ${booking.promo_code}` : ""}</p>{booking.status === "scheduled" && <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => edit(booking)} variant="outline" className="h-12 rounded-2xl font-black">Editar</Button><Button onClick={async () => { await cancelLater.mutateAsync({ id: booking.id }); await bookingsQuery.refetch(); }} variant="outline" className="h-12 rounded-2xl font-black text-red-700">Cancelar</Button></div>}</div>)}{!bookingsQuery.isLoading && bookings.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 text-sm font-bold text-zinc-500">No tienes reservas programadas.</p>}</div></CardContent></Card>
  </div></main>;
}
