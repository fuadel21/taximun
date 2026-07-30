import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { estimateTaximunFare } from "@/lib/taximunFare";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accessibility,
  Baby,
  BriefcaseBusiness,
  CalendarClock,
  Car,
  Cat,
  CheckCircle2,
  Clock3,
  Euro,
  Home,
  Loader2,
  MapPin,
  Plus,
  Route,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Category = "standard" | "comfort" | "van" | "accessible";
type PlaceType = "home" | "work" | "favorite";
type PaymentMethod = "cash" | "card" | "bizum";
type Stop = { address: string };
type Requirements = {
  wheelchair: boolean;
  largeLuggage: boolean;
  pet: boolean;
  childSeat: boolean;
  hearingAssistance: boolean;
  visualAssistance: boolean;
  reducedMobility: boolean;
  notes: string;
};

type SavedPlace = {
  id: string;
  place_type: PlaceType;
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
};

type ScheduledBooking = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  scheduled_at: string;
  service_category: Category;
  estimated_fare: number | string;
  status: "scheduled" | "cancelled" | "dispatched" | "completed";
  intermediate_stops?: Stop[] | null;
  passenger_requirements?: Requirements | null;
};

const categories: Array<{ id: Category; title: string; note: string; multiplier: number; icon: typeof Car }> = [
  { id: "standard", title: "Turismo", note: "Hasta 4 pasajeros", multiplier: 1, icon: Car },
  { id: "comfort", title: "Confort", note: "Vehículo amplio y cómodo", multiplier: 1.18, icon: BriefcaseBusiness },
  { id: "van", title: "Monovolumen", note: "Grupos o equipaje grande", multiplier: 1.45, icon: Users },
  { id: "accessible", title: "Taxi adaptado", note: "Movilidad reducida", multiplier: 1.35, icon: Accessibility },
];

const requirementOptions: Array<{ key: keyof Omit<Requirements, "notes">; title: string; icon: typeof Car }> = [
  { key: "wheelchair", title: "Silla de ruedas", icon: Accessibility },
  { key: "reducedMobility", title: "Movilidad reducida", icon: Accessibility },
  { key: "largeLuggage", title: "Equipaje grande", icon: BriefcaseBusiness },
  { key: "pet", title: "Viajo con mascota", icon: Cat },
  { key: "childSeat", title: "Silla infantil", icon: Baby },
  { key: "hearingAssistance", title: "Apoyo auditivo", icon: Accessibility },
  { key: "visualAssistance", title: "Apoyo visual", icon: Accessibility },
];

const emptyRequirements: Requirements = {
  wheelchair: false,
  largeLuggage: false,
  pet: false,
  childSeat: false,
  hearingAssistance: false,
  visualAssistance: false,
  reducedMobility: false,
  notes: "",
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;
const formatDate = (value: string) => new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

export default function PassengerAdvancedBookingPage() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [category, setCategory] = useState<Category>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [stops, setStops] = useState<Stop[]>([]);
  const [requirements, setRequirements] = useState<Requirements>(emptyRequirements);
  const [saveType, setSaveType] = useState<PlaceType>("favorite");
  const [saveLabel, setSaveLabel] = useState("Favorito");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const placesQuery = trpc.system.taxiPassengerBooking.listSavedPlaces.useQuery(undefined, { retry: false });
  const scheduledQuery = trpc.system.taxiPassengerBooking.listScheduled.useQuery(undefined, { retry: false });
  const createImmediate = trpc.system.taxiPassengerBooking.createImmediate.useMutation();
  const createScheduled = trpc.system.taxiPassengerBooking.createScheduled.useMutation();
  const updateScheduled = trpc.system.taxiPassengerBooking.updateScheduled.useMutation();
  const cancelScheduled = trpc.system.taxiPassengerBooking.cancelScheduled.useMutation();
  const savePlace = trpc.system.taxiPassengerBooking.savePlace.useMutation();
  const deletePlace = trpc.system.taxiPassengerBooking.deletePlace.useMutation();

  const places = (placesQuery.data ?? []) as SavedPlace[];
  const bookings = (scheduledQuery.data ?? []) as ScheduledBooking[];
  const selectedCategory = categories.find((item) => item.id === category) ?? categories[0];
  const estimate = useMemo(() => {
    const base = estimateTaximunFare({
      pickup: null,
      dropoff: null,
      pickupAddress,
      dropoffAddress,
      serviceType: category === "van" || category === "accessible" ? "van" : category === "comfort" ? "eco" : "taxi",
      fallbackDistanceKm: 5.2 + stops.length * 2.2,
      fallbackDurationMinutes: 14 + stops.length * 7,
    });
    const extras = (requirements.largeLuggage ? 3 : 0) + (requirements.pet ? 2 : 0) + (requirements.childSeat ? 4 : 0);
    const estimatedFare = Number((base.estimatedFare * selectedCategory.multiplier + extras).toFixed(2));
    return {
      ...base,
      extras,
      estimatedFare,
      lowerFare: Number(Math.max(0, estimatedFare * 0.9).toFixed(2)),
      upperFare: Number((estimatedFare * 1.12).toFixed(2)),
    };
  }, [pickupAddress, dropoffAddress, category, selectedCategory.multiplier, requirements, stops.length]);

  const busy = createImmediate.isPending || createScheduled.isPending || updateScheduled.isPending || cancelScheduled.isPending || savePlace.isPending || deletePlace.isPending;

  const payload = {
    pickupAddress,
    dropoffAddress,
    category,
    paymentMethod,
    intermediateStops: stops.filter((item) => item.address.trim()),
    requirements,
    estimatedFare: estimate.estimatedFare,
    fareRangeMin: estimate.lowerFare,
    fareRangeMax: estimate.upperFare,
    estimatedDuration: estimate.durationMinutes,
    distanceKm: estimate.distanceKm,
    fareBreakdown: {
      baseFare: estimate.baseFare,
      distanceFare: estimate.distanceFare,
      timeFare: estimate.timeFare,
      bookingFee: estimate.bookingFee,
      airportSupplement: estimate.airportSupplement,
      nightSupplement: estimate.nightSupplement,
      accessibilitySupplement: 0,
      selectedExtras: estimate.extras,
      category: selectedCategory.title,
      stops: stops.length,
    },
  };

  const reset = () => {
    setPickupAddress("");
    setDropoffAddress("");
    setScheduledAt("");
    setStops([]);
    setRequirements(emptyRequirements);
    setEditingId(null);
  };

  const submit = async () => {
    setError("");
    setNotice("");
    if (!pickupAddress.trim() || !dropoffAddress.trim()) return setError("Completa origen y destino.");
    try {
      if (mode === "now") {
        await createImmediate.mutateAsync(payload);
        setNotice("Viaje solicitado. Ya puedes seguir la búsqueda desde Mis viajes.");
      } else {
        if (!scheduledAt) return setError("Elige día y hora para la reserva.");
        const input = { ...payload, scheduledAt: new Date(scheduledAt).toISOString() };
        if (editingId) await updateScheduled.mutateAsync({ ...input, id: editingId });
        else await createScheduled.mutateAsync(input);
        await scheduledQuery.refetch();
        setNotice(editingId ? "Reserva actualizada." : "Reserva programada correctamente.");
      }
      reset();
      await utils.system.taxiOps.passenger.getCurrentRide.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la reserva.");
    }
  };

  const startEdit = (booking: ScheduledBooking) => {
    setMode("scheduled");
    setEditingId(booking.id);
    setPickupAddress(booking.pickup_address);
    setDropoffAddress(booking.dropoff_address);
    setScheduledAt(new Date(booking.scheduled_at).toISOString().slice(0, 16));
    setCategory(booking.service_category);
    setStops(Array.isArray(booking.intermediate_stops) ? booking.intermediate_stops : []);
    setRequirements(booking.passenger_requirements ?? emptyRequirements);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCurrentDestination = async () => {
    if (!dropoffAddress.trim()) return setError("Escribe un destino antes de guardarlo.");
    try {
      await savePlace.mutateAsync({ placeType: saveType, label: saveLabel || "Favorito", address: dropoffAddress.trim() });
      await placesQuery.refetch();
      setNotice("Dirección guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la dirección.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black">
      <div className="mx-auto max-w-6xl space-y-5">
        {(error || placesQuery.error || scheduledQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error || placesQuery.error?.message || scheduledQuery.error?.message}</div>}
        {notice && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}

        <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
          <CardContent className="space-y-6 p-5 sm:p-7">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setMode("now"); setEditingId(null); }} className={`min-h-16 rounded-2xl border p-4 text-left font-black ${mode === "now" ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}><Clock3 className="mb-2 h-6 w-6" />Pedir ahora</button>
              <button onClick={() => setMode("scheduled")} className={`min-h-16 rounded-2xl border p-4 text-left font-black ${mode === "scheduled" ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}><CalendarClock className="mb-2 h-6 w-6" />Programar</button>
            </div>

            {mode === "scheduled" && <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-14 rounded-2xl bg-zinc-50 font-bold" />}

            <div className="space-y-3 rounded-3xl bg-zinc-100 p-4">
              <Input value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} placeholder="Origen" className="h-14 rounded-2xl border-0 bg-white font-bold" />
              {stops.map((stop, index) => <div key={index} className="flex gap-2"><Input value={stop.address} onChange={(event) => setStops((current) => current.map((item, itemIndex) => itemIndex === index ? { address: event.target.value } : item))} placeholder={`Parada ${index + 1}`} className="h-14 rounded-2xl border-0 bg-white font-bold" /><Button variant="outline" onClick={() => setStops((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="h-14 w-14 rounded-2xl"><X className="h-5 w-5" /></Button></div>)}
              {stops.length < 2 && <Button variant="outline" onClick={() => setStops((current) => [...current, { address: "" }])} className="h-14 w-full rounded-2xl bg-white font-black"><Plus className="mr-2 h-5 w-5" />Añadir parada</Button>}
              <Input value={dropoffAddress} onChange={(event) => setDropoffAddress(event.target.value)} placeholder="Destino" className="h-14 rounded-2xl border-0 bg-white font-bold" />
            </div>

            <div>
              <p className="mb-3 text-sm font-black text-zinc-500">Categoría</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map((item) => { const Icon = item.icon; const active = category === item.id; return <button key={item.id} onClick={() => setCategory(item.id)} className={`min-h-32 rounded-3xl border p-4 text-left ${active ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}><Icon className="h-7 w-7" /><p className="mt-4 font-black">{item.title}</p><p className={`mt-1 text-xs font-semibold ${active ? "text-white/60" : "text-zinc-500"}`}>{item.note}</p></button>; })}</div>
            </div>

            <div>
              <p className="mb-3 text-sm font-black text-zinc-500">Accesibilidad y necesidades</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{requirementOptions.map((item) => { const Icon = item.icon; const active = requirements[item.key]; return <button key={item.key} onClick={() => setRequirements((current) => ({ ...current, [item.key]: !current[item.key] }))} className={`min-h-14 rounded-2xl border p-3 text-left font-black ${active ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}><Icon className="mr-2 inline h-5 w-5" />{item.title}</button>; })}</div>
              <Input value={requirements.notes} onChange={(event) => setRequirements((current) => ({ ...current, notes: event.target.value }))} placeholder="Indicaciones adicionales para el conductor" className="mt-3 h-14 rounded-2xl bg-zinc-50 font-bold" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["cash", "card", "bizum"] as PaymentMethod[]).map((method) => <button key={method} onClick={() => setPaymentMethod(method)} className={`h-14 rounded-2xl border font-black ${paymentMethod === method ? "border-black bg-black text-white" : "border-zinc-200 bg-white"}`}>{method === "cash" ? "Efectivo" : method === "card" ? "Tarjeta" : "Bizum"}</button>)}
            </div>

            <div className="rounded-[1.75rem] bg-black p-5 text-white">
              <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-white/55">Estimación antes de confirmar</p><p className="mt-1 text-3xl font-black">{money(estimate.estimatedFare)}</p><p className="mt-1 text-sm font-semibold text-white/60">Rango {money(estimate.lowerFare)} – {money(estimate.upperFare)} · {estimate.durationMinutes} min</p></div><Euro className="h-8 w-8" /></div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-white/70"><span>Tarifa base: {money(estimate.baseFare)}</span><span>Distancia: {money(estimate.distanceFare)}</span><span>Tiempo: {money(estimate.timeFare)}</span><span>Reserva: {money(estimate.bookingFee)}</span><span>Aeropuerto: {money(estimate.airportSupplement)}</span><span>Extras: {money(estimate.extras)}</span></div>
            </div>

            <Button onClick={submit} disabled={busy} className="h-16 w-full rounded-2xl bg-black text-base font-black text-white">{busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : mode === "scheduled" ? <CalendarClock className="mr-2 h-5 w-5" /> : <Car className="mr-2 h-5 w-5" />}{editingId ? "Guardar cambios" : mode === "scheduled" ? "Confirmar reserva" : "Solicitar taxi"}</Button>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="space-y-4 p-5 sm:p-7"><div><p className="text-sm font-black text-zinc-500">Mis lugares</p><h2 className="text-2xl font-black">Casa, Trabajo y favoritos</h2></div><div className="grid gap-3 md:grid-cols-[0.7fr_1fr_auto]"><select value={saveType} onChange={(event) => setSaveType(event.target.value as PlaceType)} className="h-14 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 font-bold"><option value="home">Casa</option><option value="work">Trabajo</option><option value="favorite">Favorito</option></select><Input value={saveLabel} onChange={(event) => setSaveLabel(event.target.value)} placeholder="Nombre del lugar" className="h-14 rounded-2xl bg-zinc-50 font-bold" /><Button onClick={saveCurrentDestination} disabled={busy} className="h-14 rounded-2xl bg-black font-black text-white"><Save className="mr-2 h-5 w-5" />Guardar destino</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{places.map((place) => <div key={place.id} className="rounded-3xl bg-zinc-100 p-4"><div className="flex items-start justify-between gap-2"><button onClick={() => setDropoffAddress(place.address)} className="text-left"><Badge className="bg-white text-black">{place.place_type === "home" ? "Casa" : place.place_type === "work" ? "Trabajo" : "Favorito"}</Badge><p className="mt-2 font-black">{place.label}</p><p className="mt-1 text-sm font-semibold text-zinc-500">{place.address}</p></button><button onClick={async () => { await deletePlace.mutateAsync({ id: place.id }); await placesQuery.refetch(); }} className="rounded-xl bg-white p-3"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></CardContent></Card>

        <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm"><CardContent className="space-y-4 p-5 sm:p-7"><div><p className="text-sm font-black text-zinc-500">Próximos viajes</p><h2 className="text-2xl font-black">Reservas programadas</h2></div>{scheduledQuery.isLoading && <div className="rounded-3xl bg-zinc-100 p-6 text-center font-bold text-zinc-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Cargando reservas...</div>}{bookings.filter((item) => item.status === "scheduled").map((booking) => <div key={booking.id} className="rounded-3xl border border-zinc-200 p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /><p className="font-black">{formatDate(booking.scheduled_at)}</p></div><p className="mt-2 text-sm font-bold">{booking.pickup_address} → {booking.dropoff_address}</p><p className="mt-1 text-sm font-semibold text-zinc-500">{categories.find((item) => item.id === booking.service_category)?.title ?? booking.service_category} · {money(booking.estimated_fare)}</p></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => startEdit(booking)} className="h-14 rounded-2xl font-black">Editar</Button><Button variant="outline" onClick={async () => { await cancelScheduled.mutateAsync({ id: booking.id }); await scheduledQuery.refetch(); }} className="h-14 rounded-2xl border-red-200 font-black text-red-700">Cancelar</Button></div></div></div>)}{!scheduledQuery.isLoading && bookings.filter((item) => item.status === "scheduled").length === 0 && <div className="rounded-3xl bg-zinc-100 p-6 text-center text-sm font-bold text-zinc-500">No tienes reservas futuras.</div>}</CardContent></Card>
      </div>
    </main>
  );
}
