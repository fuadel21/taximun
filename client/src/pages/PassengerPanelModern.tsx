import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TAXIMUN_MARKETS } from "@shared/constants";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  Euro,
  Heart,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Route,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type TaxiRideRow = {
  id: string;
  passenger_name?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  status: RideStatus;
  requested_at?: string | null;
};

type DriverPublicProfile = {
  user_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  rating?: number | string | null;
  completed_rides?: number | string | null;
  taxi_code?: string | null;
  plate?: string | null;
  vehicle_model?: string | null;
  is_verified?: boolean | null;
};

const market = TAXIMUN_MARKETS.barcelona;

const presetIconById = {
  home: Home,
  sants: MapPin,
  airport: Car,
  fira: Route,
} as const;

const serviceIconById = {
  taxi: Car,
  eco: Sparkles,
  van: Users,
} as const;

const presets = market.popularPlaces.map((item) => ({
  ...item,
  title: item.label,
  time: item.minutes,
  icon: presetIconById[item.id as keyof typeof presetIconById] ?? MapPin,
}));

const rideOptions = market.serviceLevels.map((item) => ({
  ...item,
  icon: serviceIconById[item.id as keyof typeof serviceIconById] ?? Car,
}));

const clearGuest = () => {
  try {
    localStorage.removeItem("taximun_guest_role");
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.setItem("taximun_real_auth", "1");
  } catch {}
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;
const formatDate = (value: unknown) => {
  if (typeof value !== "string") return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

function statusLabel(status: RideStatus) {
  if (status === "pending") return "Buscando conductor";
  if (status === "assigned") return "Conductor asignado";
  if (status === "in_progress") return "Viaje en curso";
  if (status === "completed") return "Finalizado";
  if (status === "cancelled") return "Cancelado";
  return "Rechazado";
}

function statusBadge(status: RideStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Buscando</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">En curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazado</Badge>;
}

export default function PassengerPanelModern() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState("Mi ubicación actual");
  const [dropoffAddress, setDropoffAddress] = useState("Barcelona Sants");
  const [baseFare, setBaseFare] = useState(12.4);
  const [duration, setDuration] = useState(14);
  const [distanceKm, setDistanceKm] = useState(5.2);
  const [rideType, setRideType] = useState("taxi");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      try {
        clearGuest();
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const role = data.session.user.user_metadata?.role;
        if (role !== "passenger" && role !== "admin") {
          const { error: updateError } = await supabase.auth.updateUser({ data: { role: "passenger" } });
          if (updateError) throw updateError;
          await supabase.auth.refreshSession();
        }
        if (!cancelled) setSessionOk(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo preparar la sesión.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    prepare();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setUserLocation(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
  }, []);

  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    enabled: sessionOk,
    retry: false,
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });
  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    enabled: sessionOk,
    retry: false,
    refetchInterval: 10000,
  });
  const createRideMutation = trpc.system.taxiOps.passenger.createRide.useMutation({
    onSuccess: () => {
      setError("");
      utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      utils.system.taxiOps.passenger.getRideHistory.invalidate();
    },
    onError: (err) => setError(err.message),
  });
  const cancelRideMutation = trpc.system.taxiOps.passenger.cancelRide.useMutation({
    onSuccess: () => {
      setError("");
      utils.system.taxiOps.passenger.getCurrentRide.invalidate();
      utils.system.taxiOps.passenger.getRideHistory.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const currentRide = (currentRideQuery.data ?? null) as TaxiRideRow | null;
  const history = (historyQuery.data ?? []) as TaxiRideRow[];
  const selectedOption = rideOptions.find((item) => item.id === rideType) ?? rideOptions[0];
  const fare = Number((baseFare * selectedOption.multiplier).toFixed(2));
  const pin = currentRide ? currentRide.id.slice(0, 4).toUpperCase() : "----";
  const saving = createRideMutation.isPending || cancelRideMutation.isPending;
  const progress = currentRide?.status === "pending" ? 28 : currentRide?.status === "assigned" ? 64 : currentRide?.status === "in_progress" ? 86 : 0;
  const activeZones = useMemo(() => market.zones.slice(0, 3), []);

  const applyPreset = (index: number) => {
    const preset = presets[index];
    setPickupAddress(preset.pickup);
    setDropoffAddress(preset.dropoff);
    setBaseFare(preset.fare);
    setDuration(preset.time);
    setDistanceKm(preset.km);
  };

  const requestTaxi = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) return setError("Falta origen o destino.");
    if (currentRide) return setError("Ya tienes un viaje activo.");
    await createRideMutation.mutateAsync({
      pickupAddress,
      dropoffAddress,
      pickupLat: userLocation?.latitude,
      pickupLng: userLocation?.longitude,
      estimatedFare: fare,
      estimatedDuration: duration,
      distanceKm,
      paymentMethod: "cash",
      serviceType: selectedOption.id as "taxi" | "eco" | "van",
      pickupZone: "Barcelona",
    });
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("taximun_real_auth");
      localStorage.removeItem("taximun_guest_role");
      localStorage.removeItem("manus-runtime-user-info");
    } catch {}
    window.location.href = "/auth";
  };

  if (checking) return <FullScreenMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title="Preparando tu viaje" text="Comprobando sesión real..." />;
  if (!sessionOk) return <FullScreenMessage icon={<ShieldCheck className="h-6 w-6" />} title="Inicia sesión" text="Para pedir taxi debes entrar con una cuenta real." action={<Button onClick={() => setLocation("/auth")} className="rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>} />;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <section className="relative min-h-[48vh] overflow-hidden bg-slate-900">
        <div className="absolute inset-0 opacity-95">
          <TaxiMap userLocation={userLocation || undefined} readOnly />
        </div>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent px-4 py-4 text-white">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">{market.launchLabel}</p>
            <h1 className="text-2xl font-black">{market.heroTitle}</h1>
            <p className="mt-1 max-w-sm text-xs font-semibold text-slate-200">{market.heroSubtitle}</p>
          </div>
          <Button onClick={logout} variant="outline" className="rounded-2xl border-white/20 bg-white/15 font-black text-white hover:bg-white/25">
            <LogOut className="mr-2 h-4 w-4" /> Salir
          </Button>
        </div>
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-2xl">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
          <span className="text-sm font-black">{currentRide ? statusLabel(currentRide.status) : "Listo para pedir en Barcelona"}</span>
        </div>
      </section>

      <section className="relative z-20 -mt-8 rounded-t-[2rem] bg-[#f7f8fb] px-4 pb-8 pt-4 shadow-[0_-24px_80px_rgba(15,23,42,0.35)]">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />

          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
          {(currentRideQuery.error || historyQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{currentRideQuery.error?.message || historyQuery.error?.message}</div>}

          {currentRide ? (
            <ActiveRideCard ride={currentRide} pin={pin} progress={progress} saving={saving} onCancel={() => cancelRideMutation.mutate({ rideId: currentRide.id })} />
          ) : (
            <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-3 rounded-3xl bg-slate-950 p-4 text-white">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Mercado activo</p>
                    <h2 className="text-2xl font-black">{market.city}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-300">Preparado para crecer por ciudad y país.</p>
                  </div>
                  <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">MVP real</Badge>
                </div>

                <div className="space-y-3 rounded-3xl bg-slate-50 p-3">
                  <Input value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} className="h-13 rounded-2xl border-0 bg-white font-bold shadow-sm" placeholder="Origen" />
                  <Input value={dropoffAddress} onChange={(event) => setDropoffAddress(event.target.value)} className="h-13 rounded-2xl border-0 bg-white font-bold shadow-sm" placeholder="¿A dónde vas?" />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {presets.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.title} onClick={() => applyPreset(index)} className="rounded-3xl bg-slate-50 p-3 text-center shadow-sm transition active:scale-95">
                        <Icon className="mx-auto mb-2 h-5 w-5 text-cyan-600" />
                        <p className="text-xs font-black">{item.title}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-black text-slate-500">Elige servicio</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {rideOptions.map((option) => {
                      const Icon = option.icon;
                      const active = rideType === option.id;
                      return (
                        <button key={option.id} onClick={() => setRideType(option.id)} className={`rounded-3xl border p-4 text-left transition active:scale-95 ${active ? "border-slate-950 bg-slate-950 text-white shadow-xl" : "border-slate-100 bg-white"}`}>
                          <div className="flex items-center justify-between gap-3">
                            <Icon className="h-6 w-6" />
                            <span className="text-lg font-black">{money(baseFare * option.multiplier)}</span>
                          </div>
                          <p className="mt-3 font-black">{option.title}</p>
                          <p className={`text-xs font-bold ${active ? "text-slate-300" : "text-slate-500"}`}>{option.note} · {duration} min</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MiniMetric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(fare)} />
                  <MiniMetric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${duration} min`} />
                  <MiniMetric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${distanceKm} km`} />
                </div>

                <p className="rounded-3xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{market.complianceNote}</p>

                <Button onClick={requestTaxi} disabled={saving} className="h-15 w-full rounded-3xl bg-slate-950 text-base font-black text-white hover:bg-slate-800">
                  {createRideMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Car className="mr-2 h-5 w-5" />}
                  Confirmar taxi · {money(fare)}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Zonas calientes Barcelona</h2>
                <MapPin className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {activeZones.map((zone) => (
                  <div key={zone.id} className="rounded-3xl bg-slate-50 p-3">
                    <p className="font-black">{zone.name}</p>
                    <p className="text-xs font-bold text-slate-500">ETA {zone.etaMinutes} min · demanda {zone.demand}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Seguridad y comodidad</h2>
                <ShieldCheck className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <ActionPill icon={<Phone className="h-4 w-4" />} title="Llamada" />
                <ActionPill icon={<MessageCircle className="h-4 w-4" />} title="Chat" />
                <ActionPill icon={<CreditCard className="h-4 w-4" />} title="Pago" />
                <ActionPill icon={<Heart className="h-4 w-4" />} title="Favorito" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Historial</h2>
                <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{history.length}</Badge>
              </div>
              <div className="space-y-2">
                {history.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Todavía no hay viajes.</p>}
                {history.slice(0, 4).map((ride) => <HistoryItem key={ride.id} ride={ride} />)}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function ActiveRideCard({ ride, pin, progress, saving, onCancel }: { ride: TaxiRideRow; pin: string; progress: number; saving: boolean; onCancel: () => void }) {
  const driverProfileQuery = trpc.system.taxiProfiles.getDriverPublicProfile.useQuery(
    { driverId: ride.driver_id ?? "" },
    { enabled: Boolean(ride.driver_id), retry: false, refetchInterval: 10000 }
  );
  const profile = (driverProfileQuery.data ?? null) as DriverPublicProfile | null;
  const driverName = profile?.full_name || ride.driver_name || "Buscando conductor";
  const taxiCode = profile?.taxi_code || ride.taxi_code || "Taxi pendiente";
  const plate = profile?.plate || ride.plate || "";
  const vehicleModel = profile?.vehicle_model || "Vehículo pendiente";
  const rating = Number(profile?.rating ?? 5).toFixed(1).replace(".", ",");
  const rides = Number(profile?.completed_rides ?? 0);
  const initials = driverName.split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase() || "TX";

  return (
    <Card className="rounded-[1.75rem] border-white bg-white shadow-xl">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-500">Viaje activo</p>
            <h2 className="text-2xl font-black">{statusLabel(ride.status)}</h2>
          </div>
          {statusBadge(ride.status)}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${progress}%` }} /></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-lg font-black text-white shadow-lg">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt={driverName} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xl font-black">{driverName}</p>
                  {profile?.is_verified ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Verificado</Badge> : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>}
                </div>
                <p className="text-sm font-bold text-slate-500">{taxiCode}{plate ? ` · ${plate}` : ""}</p>
                <p className="text-sm font-bold text-slate-500">{vehicleModel}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric icon={<Star className="h-4 w-4" />} title="Rating" value={rating} />
              <MiniMetric icon={<CheckCircle2 className="h-4 w-4" />} title="Viajes" value={String(rides)} />
            </div>
          </div>
          <div className="rounded-3xl bg-slate-950 p-4 text-white">
            <p className="text-xs font-bold uppercase text-slate-400">PIN de recogida</p>
            <p className="mt-1 text-3xl font-black tracking-widest">{pin}</p>
            <p className="mt-3 text-xs font-bold text-slate-400">Comparte este PIN solo al subir al taxi.</p>
          </div>
        </div>
        <div className="space-y-2 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
          <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p>
          <p><Navigation className="mr-2 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric icon={<Euro className="h-4 w-4" />} title="Precio" value={money(ride.estimated_fare)} />
          <MiniMetric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${ride.estimated_duration} min`} />
          <MiniMetric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${ride.distance_km} km`} />
        </div>
        {(ride.status === "pending" || ride.status === "assigned") && <Button onClick={onCancel} disabled={saving} variant="outline" className="h-13 w-full rounded-3xl border-red-200 bg-white font-black text-red-700 hover:bg-red-50"><XCircle className="mr-2 h-5 w-5" />Cancelar viaje</Button>}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="rounded-3xl bg-slate-50 p-3 text-center"><div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">{icon}</div><p className="text-xs font-bold text-slate-400">{title}</p><p className="font-black">{value}</p></div>;
}
function ActionPill({ icon, title }: { icon: ReactNode; title: string }) {
  return <button className="rounded-2xl bg-slate-50 p-3 text-center text-sm font-black text-slate-700 active:scale-95"><span className="mx-auto mb-1 flex justify-center text-cyan-600">{icon}</span>{title}</button>;
}
function HistoryItem({ ride }: { ride: TaxiRideRow }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-black">{ride.dropoff_address}</p>{statusBadge(ride.status)}</div><p className="mt-1 text-xs font-bold text-slate-500">{formatDate(ride.requested_at)} · {money(ride.estimated_fare)}</p></div>;
}
function FullScreenMessage({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-sm rounded-3xl"><CardContent className="space-y-4 p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600">{icon}</div><h1 className="text-2xl font-black">{title}</h1><p className="text-sm font-semibold text-slate-500">{text}</p>{action}</CardContent></Card></main>;
}
