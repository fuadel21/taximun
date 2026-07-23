import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Euro,
  Loader2,
  MapPin,
  Navigation,
  ReceiptText,
  ShieldAlert,
  Star,
} from "lucide-react";
import { useLocation } from "wouter";

type RatingTag = "safe_driving" | "professional" | "punctual" | "friendly" | "clean_vehicle";

type CompletedRide = {
  id: string;
  status: string;
  driver_id?: string | null;
  driver_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  final_fare?: number | string | null;
  estimated_duration: number | string;
  distance_km: number | string;
  service_type?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  settlement_notes?: string | null;
  settled_at?: string | null;
  completed_at?: string | null;
  requested_at?: string | null;
};

type RideRating = {
  id: string;
  ride_id: string;
  score: number;
  comment?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
};

const tags: Array<{ id: RatingTag; label: string }> = [
  { id: "safe_driving", label: "Conducción segura" },
  { id: "professional", label: "Profesional" },
  { id: "punctual", label: "Puntual" },
  { id: "friendly", label: "Amable" },
  { id: "clean_vehicle", label: "Vehículo limpio" },
];

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

function formatDate(value?: string | null) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function serviceLabel(value?: string | null) {
  if (value === "eco") return "Eco";
  if (value === "van") return "Van";
  return "Taxi";
}

function paymentLabel(value?: string | null) {
  if (value === "card") return "Tarjeta";
  if (value === "bizum") return "Bizum";
  return "Efectivo";
}

function paymentStatusLabel(value?: string | null) {
  if (value === "paid") return "Cobro confirmado";
  if (value === "waived") return "Sin cobro";
  if (value === "failed") return "Cobro fallido";
  return "Pendiente";
}

export function PassengerPostTripRatingSection() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<RatingTag[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });
  const ratingsQuery = trpc.system.taxiRatings.getMyRatings.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const history = (historyQuery.data ?? []) as CompletedRide[];
  const ratings = (ratingsQuery.data ?? []) as RideRating[];
  const ratedRideIds = useMemo(() => new Set(ratings.map((rating) => rating.ride_id)), [ratings]);
  const completedRides = useMemo(() => history.filter((ride) => ride.status === "completed"), [history]);
  const pendingRide = completedRides.find((ride) => ride.driver_id && !ratedRideIds.has(ride.id)) ?? null;
  const latestCompleted = completedRides[0] ?? null;
  const latestRating = latestCompleted ? ratings.find((rating) => rating.ride_id === latestCompleted.id) ?? null : null;

  const createRating = trpc.system.taxiRatings.createRating.useMutation({
    onSuccess: async () => {
      setError("");
      setNotice("Valoración enviada. Gracias por ayudarnos a mejorar Taximun.");
      setScore(0);
      setComment("");
      setSelectedTags([]);
      await utils.system.taxiRatings.getMyRatings.invalidate();
      setTimeout(() => setNotice(""), 4000);
    },
    onError: (err) => {
      setNotice("");
      setError(err.message);
    },
  });

  if (historyQuery.isLoading || ratingsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-2">
        <div className="rounded-3xl bg-white p-4 text-sm font-black text-slate-500 shadow-sm">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Preparando cierre del viaje...
        </div>
      </div>
    );
  }

  if (!latestCompleted) return null;

  const toggleTag = (tag: RatingTag) => {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };

  const submit = () => {
    if (!pendingRide) return;
    if (score < 1) {
      setError("Selecciona entre 1 y 5 estrellas.");
      return;
    }
    createRating.mutate({
      rideId: pendingRide.id,
      score,
      comment: comment.trim() || undefined,
      tags: selectedTags,
    });
  };

  const ride = pendingRide || latestCompleted;
  const finalFare = ride.final_fare ?? ride.estimated_fare;
  const hasFinalSettlement = ride.final_fare !== null && ride.final_fare !== undefined && Boolean(ride.settled_at);

  return (
    <section className="mx-auto max-w-5xl px-4 pb-4">
      <Card className="overflow-hidden rounded-[1.75rem] border-white bg-white shadow-xl">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3 rounded-3xl bg-slate-950 p-4 text-white">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Cierre del viaje</p>
              <h2 className="mt-1 text-2xl font-black">Recibo y valoración</h2>
              <p className="mt-1 text-xs font-bold text-slate-300">{formatDate(ride.settled_at || ride.completed_at || ride.requested_at)}</p>
            </div>
            <ReceiptText className="h-6 w-6 text-cyan-200" />
          </div>

          {(error || historyQuery.error || ratingsQuery.error) && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
              <AlertCircle className="mr-2 inline h-4 w-4" />
              {error || historyQuery.error?.message || ratingsQuery.error?.message}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Metric icon={<Euro className="h-4 w-4" />} title={hasFinalSettlement ? "Importe final" : "Estimado"} value={money(finalFare)} />
            <Metric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} />
            <Metric icon={<CreditCard className="h-4 w-4" />} title="Pago" value={paymentLabel(ride.payment_method)} />
          </div>

          <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
            <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p>
            <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p>
            <p className="text-xs text-slate-500">Servicio {serviceLabel(ride.service_type)} · {ride.distance_km} km · {paymentStatusLabel(ride.payment_status)}.</p>
            {ride.settlement_notes && <p className="rounded-2xl bg-white p-3 text-xs text-slate-600">Observaciones del cierre: {ride.settlement_notes}</p>}
          </div>

          {pendingRide ? (
            <div className="space-y-4 rounded-3xl border border-amber-100 bg-amber-50 p-4">
              <div>
                <p className="font-black text-amber-950">¿Cómo fue el viaje con {pendingRide.driver_name || "tu conductor"}?</p>
                <p className="text-xs font-bold text-amber-700">La valoración solo puede enviarse una vez.</p>
              </div>

              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScore(value)}
                    className="rounded-2xl bg-white p-2 shadow-sm transition active:scale-90"
                    aria-label={`${value} estrellas`}
                  >
                    <Star className={`h-8 w-8 ${value <= score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const active = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white" : "bg-white text-slate-600"}`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>

              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={600}
                className="min-h-24 rounded-2xl border-0 bg-white font-semibold"
                placeholder="Comentario opcional sobre el viaje"
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => setLocation("/passenger/security")} variant="outline" className="h-12 rounded-2xl bg-white font-black text-red-700">
                  <ShieldAlert className="mr-2 h-4 w-4" />Reportar incidencia
                </Button>
                <Button onClick={submit} disabled={createRating.isPending} className="h-12 rounded-2xl bg-slate-950 font-black text-white">
                  {createRating.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
                  Enviar valoración
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black">Valoración enviada</p>
                  <p className="text-xs font-bold text-emerald-700">Este viaje ya está cerrado.</p>
                </div>
                {latestRating && <Badge className="bg-white text-emerald-800 hover:bg-white">{latestRating.score}/5 ★</Badge>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-3 text-center">
      <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">{icon}</div>
      <p className="text-xs font-bold text-slate-400">{title}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
