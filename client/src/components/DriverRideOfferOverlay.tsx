import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  Euro,
  MapPin,
  Navigation,
  Route,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

type RideOffer = {
  id: string;
  ride_id: string;
  expires_at: string;
  offered_at: string;
  distance_to_pickup_km?: number | string | null;
  eta_to_pickup_minutes?: number | string | null;
  passenger_name?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  trip_distance_km: number | string;
  payment_method?: string | null;
  service_type?: string | null;
};

type DriverStatus = {
  taxi_code?: string | null;
  plate?: string | null;
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

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

function playOfferAlert() {
  try {
    navigator.vibrate?.([250, 120, 250]);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  } catch {}
}

export function DriverRideOfferOverlay() {
  const utils = trpc.useUtils();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const alertedOfferRef = useRef<string | null>(null);
  const timeoutHandledRef = useRef<string | null>(null);

  const statusQuery = trpc.system.taxiOps.driver.getStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 5000,
  });
  const offerQuery = trpc.system.taxiRideOffers.driver.getCurrentOffer.useQuery(undefined, {
    retry: false,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
  const offer = (offerQuery.data ?? null) as RideOffer | null;
  const status = (statusQuery.data ?? null) as DriverStatus | null;

  const acceptMutation = trpc.system.taxiRideOffers.driver.acceptOffer.useMutation({
    onSuccess: async () => {
      setError("");
      await Promise.all([
        utils.system.taxiRideOffers.driver.getCurrentOffer.invalidate(),
        utils.system.taxiOps.driver.getActiveRide.invalidate(),
        utils.system.taxiOps.driver.getPendingRides.invalidate(),
        utils.system.taxiOps.driver.getStatus.invalidate(),
      ]);
      window.location.href = "/driver/navigation";
    },
    onError: (err) => setError(err.message),
  });

  const rejectMutation = trpc.system.taxiRideOffers.driver.rejectOffer.useMutation({
    onSuccess: async () => {
      setError("");
      await utils.system.taxiRideOffers.driver.getCurrentOffer.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!offer || alertedOfferRef.current === offer.id) return;
    alertedOfferRef.current = offer.id;
    timeoutHandledRef.current = null;
    playOfferAlert();
  }, [offer?.id]);

  const remainingMs = offer ? Math.max(0, new Date(offer.expires_at).getTime() - now) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = offer ? Math.max(0, Math.min(100, (remainingMs / 20000) * 100)) : 0;

  useEffect(() => {
    if (!offer || remainingMs > 0 || timeoutHandledRef.current === offer.id || rejectMutation.isPending) return;
    timeoutHandledRef.current = offer.id;
    rejectMutation.mutate({ offerId: offer.id, reason: "timeout" });
  }, [offer?.id, remainingMs, rejectMutation.isPending]);

  useEffect(() => {
    if (!offer || remainingSeconds !== 5) return;
    navigator.vibrate?.([180, 80, 180, 80, 180]);
  }, [offer?.id, remainingSeconds]);

  const pickupDistance = useMemo(() => {
    const value = Number(offer?.distance_to_pickup_km);
    return Number.isFinite(value) ? `${value.toFixed(1)} km` : "Calculando";
  }, [offer?.distance_to_pickup_km]);

  if (!offer) return null;

  const saving = acceptMutation.isPending || rejectMutation.isPending;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/95 p-4 text-white backdrop-blur-md">
      <div className="mx-auto flex min-h-full max-w-lg items-center justify-center py-6">
        <div className="w-full overflow-hidden rounded-[2rem] bg-white text-slate-950 shadow-2xl">
          <div className="bg-gradient-to-br from-cyan-600 via-blue-600 to-slate-950 p-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100">Nueva oferta inteligente</p>
                <h2 className="mt-1 text-3xl font-black">{remainingSeconds}s</h2>
                <p className="mt-1 text-sm font-bold text-blue-100">Responde antes de que pase al siguiente conductor.</p>
              </div>
              <Badge className="bg-white text-slate-950 hover:bg-white"><Sparkles className="mr-1 h-4 w-4" />Prioridad cercana</Badge>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
              <div className={`h-full rounded-full transition-all ${remainingSeconds <= 5 ? "bg-red-300" : "bg-cyan-200"}`} style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="space-y-4 p-5">
            {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black"><UserRound className="mr-2 inline h-4 w-4 text-cyan-600" />{offer.passenger_name || "Pasajero"}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Oferta #{offer.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <Badge className="bg-cyan-50 text-cyan-800 hover:bg-cyan-50">{serviceLabel(offer.service_type)}</Badge>
            </div>

            <div className="space-y-3 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
              <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{offer.pickup_address}</p>
              <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{offer.dropoff_address}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Metric icon={<Route className="h-4 w-4" />} title="A recogida" value={pickupDistance} />
              <Metric icon={<Clock3 className="h-4 w-4" />} title="Llegada" value={offer.eta_to_pickup_minutes ? `${offer.eta_to_pickup_minutes} min` : "—"} />
              <Metric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(offer.estimated_fare)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Info icon={<Car className="h-4 w-4" />} label="Trayecto" value={`${offer.trip_distance_km} km · ${offer.estimated_duration} min`} />
              <Info icon={<CreditCard className="h-4 w-4" />} label="Pago" value={paymentLabel(offer.payment_method)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => rejectMutation.mutate({ offerId: offer.id, reason: "driver_declined" })}
                disabled={saving}
                variant="outline"
                className="h-16 rounded-3xl border-red-200 bg-white text-base font-black text-red-700 hover:bg-red-50"
              >
                <XCircle className="mr-2 h-5 w-5" />Rechazar
              </Button>
              <Button
                onClick={() => acceptMutation.mutate({
                  offerId: offer.id,
                  taxiCode: status?.taxi_code || "TX-000",
                  plate: status?.plate || "SIN-MAT",
                })}
                disabled={saving || remainingMs <= 0}
                className="h-16 rounded-3xl bg-emerald-600 text-base font-black text-white hover:bg-emerald-500"
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />Aceptar
              </Button>
            </div>

            <p className="text-center text-xs font-bold text-slate-500">Al expirar, la oferta se libera automáticamente para el siguiente conductor elegible.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3 text-center"><div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">{icon}</div><p className="text-[11px] font-bold text-slate-400">{title}</p><p className="font-black">{value}</p></div>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-cyan-600">{icon}<span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span></div><p className="mt-1 font-black text-slate-800">{value}</p></div>;
}
