import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accessibility, Baby, BriefcaseBusiness, CalendarClock, Car, Cat, CheckCircle2, Clock3, Euro, Gift, Loader2, Plus, Route, Users, X } from "lucide-react";

type Category = "standard" | "comfort" | "van" | "accessible";
type PaymentMethod = "cash" | "card" | "bizum";
type Requirements = { wheelchair: boolean; largeLuggage: boolean; pet: boolean; childSeat: boolean; hearingAssistance: boolean; visualAssistance: boolean; reducedMobility: boolean; notes: string };
type Stop = { address: string };
type Booking = { id: string; pickup_address: string; dropoff_address: string; scheduled_at: string; service_category: Category; payment_method: PaymentMethod; estimated_fare: number | string; status: string; intermediate_stops?: Stop[]; passenger_requirements?: Requirements; promo_code?: string | null };

const categories = [
  { id: "standard" as const, title: "Turismo", icon: Car }, { id: "comfort" as const, title: "Confort", icon: BriefcaseBusiness },
  { id: "van" as const, title: "Monovolumen", icon: Users }, { id: "accessible" as const, title: "Taxi adaptado", icon: Accessibility },
];
const needs = [
  ["wheelchair", "Silla de ruedas", Accessibility], ["reducedMobility", "Movilidad reducida", Accessibility], ["largeLuggage", "Equipaje grande", BriefcaseBusiness],
  ["pet", "Mascota", Cat], ["childSeat", "Silla infantil", Baby], ["hearingAssistance", "Apoyo auditivo", Accessibility], ["visualAssistance", "Apoyo visual", Accessibility],
] as const;
const empty: Requirements = { wheelchair: false, largeLuggage: false, pet: false, childSeat: false, hearingAssistance: false, visualAssistance: false, reducedMobility: false, notes: "" };
const money = (value: unknown) => `${Number(value || 0).toFixed(2)} €`;

export default function PassengerAdvancedBookingPage() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [category, setCategory] = useState<Category>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [intermediateStops, setIntermediateStops] = useState<Stop[]>([]);
  const [requirements, setRequirements] = useState<Requirements>(empty);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const payload = useMemo(() => ({ pickupAddress, dropoffAddress, category, paymentMethod, intermediateStops: intermediateStops.filter((item) => item.address.trim()), requirements, promoCode: promoCode || undefined }), [pickupAddress, dropoffAddress, category, paymentMethod, intermediateStops, requirements, promoCode]);
  const quoteInput = mode === "scheduled" && scheduledAt ? { ...payload, scheduledAt: new Date(scheduledAt).toISOString() } : payload;
  const enabled = pickupAddress.trim().length > 1 && dropoffAddress.trim().length > 1 && (mode === "now" || Boolean(scheduledAt));
  const quote = trpc.system.taxiPassengerBooking.quote.useQuery(quoteInput, { enabled, retry: false, staleTime: 15000 });
  const bookingsQuery = trpc.system.taxiPassengerBooking.listScheduled.useQuery(undefined, { retry: false });
  const createNow = trpc.system.taxiPassengerBooking.createImmediate.useMutation();
  const createLater = trpc.system.taxiPassengerBooking.createScheduled.useMutation();
  const updateLater = trpc.system.taxiPassengerBooking.updateScheduled.useMutation();
  const cancelLater = trpc.system.taxiPassengerBooking.cancelScheduled.useMutation();
  const busy = createNow.isPending || createLater.isPending || updateLater.isPending || cancelLater.isPending;
  const bookings = (bookingsQuery.data || []) as Booking[];

  const submit = async () => {
    setError(""); setNotice("");
    if (!enabled) return setError("Completa origen, destino y fecha cuando corresponda.");
    try {
      const refreshed = await quote.refetch();
      if (!refreshed.data) throw refreshed.error || new Error("No se pudo calcular el precio.");
      if (mode === "now") await createNow.mutateAsync(payload);
      else if (editingId) await updateLater.mutateAsync({ ...payload, id: editingId, scheduledAt: new Date(scheduledAt).toISOString() });
      else await createLater.mutateAsync({ ...payload, scheduledAt: new Date(scheduledAt).toISOString() });
      setNotice("Reserva guardada con precio validado por el servidor.");
      setPickupAddress(""); setDropoffAddress(""); setScheduledAt(""); setIntermediateStops([]); setRequirements(empty); setPromoInput(""); setPromoCode(""); setEditingId(null);
      await bookingsQuery.refetch(); await utils.system.taxiOps.passenger.getCurrentRide.invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la reserva."); }
  };
  const edit = (booking: Booking) => {
    setMode("scheduled"); setEditingId(booking.id); setPickupAddress(booking.pickup_address); setDropoffAddress(booking.dropoff_address);
    setScheduledAt(new Date(booking.scheduled_at).toISOString().slice(0, 16)); setCategory(booking.service_category); setPaymentMethod(booking.payment_method || "cash");
    setIntermediateStops(booking.intermediate_stops || []); setRequirements(booking.passenger_requirements || empty); setPromoCode(booking.promo_code || ""); setPromoInput(booking.promo_code || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const breakdown = quote.data?.breakdown as Record<string, number> | undefined;
  const lines = breakdown ? [
    ["Base", breakdown.baseFare], ["Distancia", breakdown.distanceFare], ["Tiempo", breakdown.timeFare], ["Reserva", breakdown.bookingFee],
    ["Aeropuerto", breakdown.airportSupplement], ["Paradas", breakdown.stopSupplement], ["Equipaje", breakdown.luggageSupplement], ["Mascota", breakdown.petSupplement], ["Silla infantil", breakdown.childSeatSupplement],
  ].filter(([, value]) => Number(value || 0) > 0) : [];

  return <main className="min-h-screen bg-[#f3f3f3] px-4 py-6 text-black"><div className="mx-auto max-w-6xl space-y-5">
    {(error || quote.error || bookingsQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error || quote.error?.message || bookingsQuery.error?.message}</div>}
    {notice && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}
    <Card className="rounded-[2rem] border-0 bg-white"><CardContent className="space-y-6 p-5 sm:p-7">
      <div className="grid grid-cols-2 gap-3"><button onClick={() => { setMode("now"); setEditingId(null); }} className={`min-h-16 rounded-2xl p-4 text-left font-black ${mode === "now" ? "bg-black text-white" : "bg-zinc-100"}`}><Clock3 className="mb-2" />Pedir ahora</button><button onClick={() => setMode("scheduled")} className={`min-h-16 rounded-2xl p-4 text-left font-black ${mode === "scheduled" ? "bg-black text-white" : "bg-zinc-100"}`}><CalendarClock className="mb-2" />Programar</button></div>
      {mode === "scheduled" && <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-14 rounded-2xl" />}
      <div className="space-y-3 rounded-3xl bg-zinc-100 p-4"><Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Origen" className="h-14 rounded-2xl border-0 bg-white font-bold" />{intermediateStops.map((stop, index) => <div key={index} className="flex gap-2"><Input value={stop.address} onChange={(e) => setIntermediateStops((items) => items.map((item, i) => i === index ? { address: e.target.value } : item))} placeholder={`Parada ${index + 1}`} className="h-14 rounded-2xl border-0 bg-white" /><Button variant="outline" onClick={() => setIntermediateStops((items) => items.filter((_, i) => i !== index))} className="h-14 w-14 rounded-2xl"><X /></Button></div>)}{intermediateStops.length < 2 && <Button variant="outline" onClick={() => setIntermediateStops((items) => [...items, { address: "" }])} className="h-14 w-full rounded-2xl bg-white font-black"><Plus className="mr-2" />Añadir parada</Button>}<Input value={dropoffAddress} onChange={(e) => setDropoffAddress(e.target.value)} placeholder="Destino" className="h-14 rounded-2xl border-0 bg-white font-bold" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setCategory(id)} className={`min-h-28 rounded-3xl border p-4 text-left font-black ${category === id ? "border-black bg-black text-white" : "border-zinc-200"}`}><Icon className="mb-4 h-7 w-7" />{title}</button>)}</div>
      <div><p className="mb-3 text-sm font-black text-zinc-500">Necesidades y accesibilidad</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{needs.map(([key, label, Icon]) => <button key={key} onClick={() => setRequirements((current) => ({ ...current, [key]: !current[key] }))} className={`min-h-14 rounded-2xl border p-3 text-left font-black ${requirements[key] ? "border-black bg-black text-white" : "border-zinc-200"}`}><Icon className="mr-2 inline h-5 w-5" />{label}</button>)}</div><Input value={requirements.notes} onChange={(e) => setRequirements((current) => ({ ...current, notes: e.target.value }))} placeholder="Indicaciones adicionales" className="mt-3 h-14 rounded-2xl" /><p className="mt-2 text-xs font-bold text-zinc-500">La discapacidad o necesidad de apoyo no genera suplemento por sí misma.</p></div>
      <div className="grid grid-cols-3 gap-2">{(["cash", "card", "bizum"] as PaymentMethod[]).map((item) => <button key={item} onClick={() => setPaymentMethod(item)} className={`h-14 rounded-2xl border font-black ${paymentMethod === item ? "bg-black text-white" : "bg-white"}`}>{item === "cash" ? "Efectivo" : item === "card" ? "Tarjeta" : "Bizum"}</button>)}</div>
      <div className="rounded-3xl border p-4"><p className="font-black"><Gift className="mr-2 inline" />Código promocional</p><div className="mt-3 flex gap-2"><Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="BIENVENIDA" className="h-14 rounded-2xl" /><Button onClick={() => setPromoCode(promoInput.trim().toUpperCase())} className="h-14 rounded-2xl bg-black font-black text-white">Aplicar</Button></div>{promoCode && <button onClick={() => { setPromoCode(""); setPromoInput(""); }} className="mt-2 text-sm font-black underline">Quitar {promoCode}</button>}</div>
      <div className="rounded-3xl bg-black p-5 text-white"><div className="flex justify-between"><div><p className="text-sm font-black text-white/50">Precio final antes de confirmar</p><p className="mt-1 text-4xl font-black">{quote.isLoading ? "…" : money(quote.data?.total)}</p><p className="mt-1 text-sm font-bold text-white/50">{quote.data ? `${quote.data.distanceKm} km · ${quote.data.durationMinutes} min` : "Completa la ruta"}</p></div><Euro className="h-8 w-8" /></div>{lines.length > 0 && <div className="mt-4 space-y-2 border-t border-white/10 pt-4">{lines.map(([label, value]) => <div key={String(label)} className="flex justify-between text-sm font-bold"><span className="text-white/60">{label}</span><span>{money(value)}</span></div>)}{Number(quote.data?.discount || 0) > 0 && <div className="flex justify-between font-black text-emerald-300"><span>Descuento {quote.data?.promoCode}</span><span>−{money(quote.data?.discount)}</span></div>}<div className="flex justify-between border-t border-white/10 pt-3 font-black"><span>Subtotal</span><span>{money(quote.data?.subtotal)}</span></div></div>}</div>
      <Button onClick={submit} disabled={busy || quote.isLoading || !quote.data} className="h-16 w-full rounded-2xl bg-cyan-600 text-lg font-black text-white">{busy ? <Loader2 className="mr-2 animate-spin" /> : <Route className="mr-2" />}{editingId ? "Guardar cambios y precio" : "Confirmar"}</Button>
    </CardContent></Card>
    <Card className="rounded-[2rem] border-0 bg-white"><CardContent className="p-5"><h2 className="text-2xl font-black">Reservas programadas</h2><div className="mt-4 space-y-3">{bookings.map((booking) => <div key={booking.id} className="rounded-3xl bg-zinc-100 p-4"><p className="font-black">{booking.pickup_address} → {booking.dropoff_address}</p><p className="mt-1 text-sm font-bold text-zinc-500">{new Date(booking.scheduled_at).toLocaleString("es-ES")} · {money(booking.estimated_fare)} {booking.promo_code ? `· ${booking.promo_code}` : ""}</p>{booking.status === "scheduled" && <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => edit(booking)} variant="outline" className="h-12 rounded-2xl font-black">Editar</Button><Button onClick={async () => { await cancelLater.mutateAsync({ id: booking.id }); await bookingsQuery.refetch(); }} variant="outline" className="h-12 rounded-2xl font-black text-red-700">Cancelar</Button></div>}</div>)}{!bookingsQuery.isLoading && bookings.length === 0 && <p className="rounded-2xl bg-zinc-100 p-4 text-sm font-bold text-zinc-500">No tienes reservas programadas.</p>}</div></CardContent></Card>
  </div></main>;
}
