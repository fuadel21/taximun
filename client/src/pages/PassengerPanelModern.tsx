import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { TaxiMap } from "@/components/TaxiMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { estimateTaximunFare, type Coordinates, type FareEstimate } from "@/lib/taximunFare";
import { TAXIMUN_MARKETS } from "@shared/constants";
import {
  AlertCircle,
  BellRing,
  Car,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  Euro,
  Heart,
  Home,
  Loader2,
  LocateFixed,
  LockKeyhole,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Route,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  XCircle,
} from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";
type PaymentMethod = "cash" | "card" | "bizum";

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

type AddressSuggestion = {
  label: string;
  lat?: number;
  lng?: number;
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

const paymentOptions: Array<{ id: PaymentMethod; title: string; note: string }> = [
  { id: "cash", title: "Efectivo", note: "Pagas al conductor" },
  { id: "card", title: "Tarjeta", note: "Marcado para pago con tarjeta" },
  { id: "bizum", title: "Bizum", note: "Acuerdo directo con conductor" },
];

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

const cleanAddress = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "Ubicación detectada";
  return text.split(",").slice(0, 4).join(",");
};

async function reverseGeocode(latitude: number, longitude: number) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
  if (!response.ok) throw new Error("No se pudo convertir tu ubicación en dirección.");
  const data = await response.json();
  return cleanAddress(data.display_name) || `Ubicación actual (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
}

async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({
    format: "jsonv2",
    q: `${query}, Barcelona, España`,
    limit: "5",
    countrycodes: "es",
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.slice(0, 5).map((item: any) => ({
    label: cleanAddress(item.display_name),
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
}

function statusLabel(status: RideStatus) {
  if (status === "pending") return "Buscando conductor";
  if (status === "assigned") return "Conductor asignado";
  if (status === "in_progress") return "Viaje en curso";
  if (status === "completed") return "Finalizado";
  if (status === "cancelled") return "Cancelado";
  return "Rechazado";
}

function statusSubtitle(status: RideStatus) {
  if (status === "pending") return "Estamos avisando a conductores verificados cerca de ti.";
  if (status === "assigned") return "Tu taxi está asignado. Revisa matrícula, código y PIN antes de subir.";
  if (status === "in_progress") return "Viaje iniciado. Puedes compartir los datos del trayecto.";
  return "Consulta el detalle del servicio en tu historial.";
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
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<Coordinates | null>(null);
  const [pickupAddress, setPickupAddress] = useState("Pulsa “Usar mi ubicación”");
  const [dropoffAddress, setDropoffAddress] = useState("Barcelona Sants");
  const [baseFare, setBaseFare] = useState(12.4);
  const [duration, setDuration] = useState(14);
  const [distanceKm, setDistanceKm] = useState(5.2);
  const [rideType, setRideType] = useState("taxi");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState("Detecta tu ubicación para rellenar el origen automáticamente.");
  const [pickupSuggestions, setPickupSuggestions] = useState<AddressSuggestion[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<AddressSuggestion[]>([]);
  const [focusedField, setFocusedField] = useState<"pickup" | "dropoff" | null>(null);
  const [savedDestination, setSavedDestination] = useState("");

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
    try {
      const stored = localStorage.getItem("taximun_passenger_favorite_destination");
      if (stored) setSavedDestination(stored);
    } catch {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (focusedField !== "pickup" || pickupAddress.trim().length < 3 || pickupAddress.includes("Usar mi ubicación")) {
        setPickupSuggestions([]);
        return;
      }
      const results = await searchAddress(pickupAddress);
      setPickupSuggestions(results);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [pickupAddress, focusedField]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (focusedField !== "dropoff" || dropoffAddress.trim().length < 3) {
        setDropoffSuggestions([]);
        return;
      }
      const results = await searchAddress(dropoffAddress);
      setDropoffSuggestions(results);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [dropoffAddress, focusedField]);

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
  const selectedPayment = paymentOptions.find((item) => item.id === paymentMethod) ?? paymentOptions[0];
  const fareEstimate = useMemo(() => estimateTaximunFare({
    pickup: userLocation,
    dropoff: dropoffLocation,
    pickupAddress,
    dropoffAddress,
    serviceType: rideType,
    fallbackDistanceKm: distanceKm,
    fallbackDurationMinutes: duration,
  }), [userLocation, dropoffLocation, pickupAddress, dropoffAddress, rideType, distanceKm, duration]);
  const estimateForService = (serviceType: string) => estimateTaximunFare({
    pickup: userLocation,
    dropoff: dropoffLocation,
    pickupAddress,
    dropoffAddress,
    serviceType,
    fallbackDistanceKm: distanceKm,
    fallbackDurationMinutes: duration,
  });
  const fare = fareEstimate.estimatedFare;
  const pin = currentRide ? currentRide.id.slice(0, 4).toUpperCase() : "----";
  const saving = createRideMutation.isPending || cancelRideMutation.isPending;
  const progress = currentRide?.status === "pending" ? 28 : currentRide?.status === "assigned" ? 64 : currentRide?.status === "in_progress" ? 86 : 0;
  const activeZones = useMemo(() => market.zones.slice(0, 3), []);

  const detectCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no permite detectar ubicación.");
      return;
    }

    setDetectingLocation(true);
    setError("");
    setLocationMessage("Pidiendo permiso de ubicación...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setUserLocation({ latitude, longitude });
        setLocationMessage("Ubicación detectada. Rellenando origen...");

        try {
          const address = await reverseGeocode(latitude, longitude);
          setPickupAddress(address);
          setLocationMessage("Origen rellenado automáticamente.");
        } catch {
          setPickupAddress(`Ubicación actual (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
          setLocationMessage("Ubicación detectada, pero no se pudo obtener nombre de calle.");
        } finally {
          setDetectingLocation(false);
        }
      },
      () => {
        setDetectingLocation(false);
        setLocationMessage("Permiso de ubicación bloqueado. Puedes escribir el origen manualmente.");
        setError("No se pudo detectar la ubicación. Activa permisos de ubicación en el navegador.");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 }
    );
  };

  const selectSuggestion = (field: "pickup" | "dropoff", suggestion: AddressSuggestion) => {
    if (field === "pickup") {
      setPickupAddress(suggestion.label);
      if (Number.isFinite(suggestion.lat) && Number.isFinite(suggestion.lng)) setUserLocation({ latitude: suggestion.lat!, longitude: suggestion.lng! });
      setPickupSuggestions([]);
    } else {
      setDropoffAddress(suggestion.label);
      if (Number.isFinite(suggestion.lat) && Number.isFinite(suggestion.lng)) setDropoffLocation({ latitude: suggestion.lat!, longitude: suggestion.lng! });
      setDropoffSuggestions([]);
    }
    setFocusedField(null);
  };

  const applyPreset = (index: number) => {
    const preset = presets[index];
    if (!userLocation && pickupAddress.includes("Usar mi ubicación")) {
      setPickupAddress(preset.pickup);
    }
    setDropoffAddress(preset.dropoff);
    setDropoffLocation(null);
    setBaseFare(preset.fare);
    setDuration(preset.time);
    setDistanceKm(preset.km);
    setDropoffSuggestions([]);
    setPickupSuggestions([]);
  };

  const applyZone = (zone: { name: string; etaMinutes?: number }) => {
    const eta = Number(zone.etaMinutes ?? 8);
    setDropoffAddress(zone.name);
    setDropoffLocation(null);
    setBaseFare(Number(Math.max(8, eta * 1.15).toFixed(2)));
    setDuration(eta + 8);
    setDistanceKm(Number(Math.max(2.5, eta * 0.8).toFixed(1)));
    setDropoffSuggestions([]);
    setError("");
  };

  const saveFavoriteDestination = () => {
    if (!dropoffAddress.trim()) {
      setError("Escribe primero un destino para guardarlo como favorito.");
      return;
    }
    try {
      localStorage.setItem("taximun_passenger_favorite_destination", dropoffAddress.trim());
      setSavedDestination(dropoffAddress.trim());
      setError("");
    } catch {
      setError("No se pudo guardar el destino en este dispositivo.");
    }
  };

  const useSavedDestination = () => {
    if (!savedDestination) return;
    setDropoffAddress(savedDestination);
    setDropoffLocation(null);
    setError("");
  };

  const requestTaxi = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) return setError("Falta origen o destino.");
    if (pickupAddress.includes("Usar mi ubicación")) return setError("Detecta tu ubicación o escribe el origen manualmente.");
    if (currentRide) return setError("Ya tienes un viaje activo.");
    await createRideMutation.mutateAsync({
      pickupAddress,
      dropoffAddress,
      pickupLat: userLocation?.latitude,
      pickupLng: userLocation?.longitude,
      estimatedFare: fareEstimate.estimatedFare,
      estimatedDuration: fareEstimate.durationMinutes,
      distanceKm: fareEstimate.distanceKm,
      paymentMethod,
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
          <span className={`h-2.5 w-2.5 rounded-full ${currentRide?.status === "pending" ? "animate-pulse bg-amber-500" : "bg-cyan-500"}`} />
          <span className="text-sm font-black">{currentRide ? statusLabel(currentRide.status) : userLocation ? "Ubicación lista" : "Detecta tu ubicación"}</span>
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
                    <p className="mt-1 text-xs font-semibold text-slate-300">Origen real, destino automático y taxis verificados.</p>
                  </div>
                  <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">MVP real</Badge>
                </div>

                <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-3">
                  <Button onClick={detectCurrentLocation} disabled={detectingLocation} className="h-12 w-full rounded-2xl bg-cyan-600 font-black text-white hover:bg-cyan-700">
                    {detectingLocation ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LocateFixed className="mr-2 h-5 w-5" />}
                    {detectingLocation ? "Detectando ubicación..." : "Usar mi ubicación actual"}
                  </Button>
                  <p className="mt-2 text-xs font-bold text-cyan-800">{locationMessage}</p>
                </div>

                <div className="space-y-3 rounded-3xl bg-slate-50 p-3">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-600" />
                    <Input value={pickupAddress} onFocus={() => setFocusedField("pickup")} onChange={(event) => setPickupAddress(event.target.value)} className="h-14 rounded-2xl border-0 bg-white pl-12 font-bold shadow-sm" placeholder="Origen" />
                    {focusedField === "pickup" && pickupSuggestions.length > 0 && <SuggestionList suggestions={pickupSuggestions} onSelect={(item) => selectSuggestion("pickup", item)} />}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600" />
                    <Input value={dropoffAddress} onFocus={() => setFocusedField("dropoff")} onChange={(event) => { setDropoffAddress(event.target.value); setDropoffLocation(null); }} className="h-14 rounded-2xl border-0 bg-white pl-12 font-bold shadow-sm" placeholder="¿A dónde vas?" />
                    {focusedField === "dropoff" && dropoffSuggestions.length > 0 && <SuggestionList suggestions={dropoffSuggestions} onSelect={(item) => selectSuggestion("dropoff", item)} />}
                  </div>
                </div>

                {savedDestination && (
                  <button onClick={useSavedDestination} className="w-full rounded-3xl border border-emerald-100 bg-emerald-50 p-3 text-left text-sm font-black text-emerald-800 active:scale-95">
                    <Heart className="mr-2 inline h-4 w-4" /> Usar destino guardado: {savedDestination}
                  </button>
                )}

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
                      const optionEstimate = estimateForService(option.id);
                      return (
                        <button key={option.id} onClick={() => setRideType(option.id)} className={`rounded-3xl border p-4 text-left transition active:scale-95 ${active ? "border-slate-950 bg-slate-950 text-white shadow-xl" : "border-slate-100 bg-white"}`}>
                          <div className="flex items-center justify-between gap-3">
                            <Icon className="h-6 w-6" />
                            <span className="text-lg font-black">{money(optionEstimate.estimatedFare)}</span>
                          </div>
                          <p className="mt-3 font-black">{option.title}</p>
                          <p className={`text-xs font-bold ${active ? "text-slate-300" : "text-slate-500"}`}>{option.note} · {optionEstimate.durationMinutes} min · {optionEstimate.distanceKm} km</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <PaymentMethodCard selected={paymentMethod} options={paymentOptions} onChange={setPaymentMethod} />

                <div className="grid grid-cols-3 gap-2">
                  <MiniMetric icon={<Euro className="h-4 w-4" />} title="Estimado" value={money(fare)} />
                  <MiniMetric icon={<Clock3 className="h-4 w-4" />} title="Tiempo" value={`${fareEstimate.durationMinutes} min`} />
                  <MiniMetric icon={<Route className="h-4 w-4" />} title="Ruta" value={`${fareEstimate.distanceKm} km`} />
                </div>

                <FareBreakdownCard estimate={fareEstimate} />
                <BookingSummaryCard serviceTitle={selectedOption.title} paymentTitle={selectedPayment.title} estimate={fareEstimate} pickupAddress={pickupAddress} dropoffAddress={dropoffAddress} />

                <p className="rounded-3xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{market.complianceNote}</p>

                <Button onClick={requestTaxi} disabled={saving} className="h-15 w-full rounded-3xl bg-slate-950 text-base font-black text-white hover:bg-slate-800">
                  {createRideMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Car className="mr-2 h-5 w-5" />}
                  Solicitar taxi · {money(fare)}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Zonas sugeridas</h2>
                <MapPin className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {activeZones.map((zone) => (
                  <button key={zone.id} onClick={() => applyZone(zone)} className="rounded-3xl bg-slate-50 p-3 text-left transition hover:bg-cyan-50 active:scale-95">
                    <p className="font-black">{zone.name}</p>
                    <p className="text-xs font-bold text-slate-500">Rellenar destino · ETA {zone.etaMinutes} min · demanda {zone.demand}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-black">Acciones útiles</h2>
                <ShieldCheck className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <ActionPill icon={<Phone className="h-4 w-4" />} title="Soporte" note="Incidencia" onClick={() => setLocation("/passenger/security")} />
                <ActionPill icon={<BellRing className="h-4 w-4" />} title="Avisos" note="Ver" onClick={() => setLocation("/notifications")} />
                <ActionPill icon={<Heart className="h-4 w-4" />} title={savedDestination ? "Guardado" : "Favorito"} note="Destino" onClick={saveFavoriteDestination} />
                <ActionPill icon={<LocateFixed className="h-4 w-4" />} title="Ubicación" note="Detectar" onClick={detectCurrentLocation} disabled={detectingLocation} />
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

function PaymentMethodCard({ selected, options, onChange }: { selected: PaymentMethod; options: Array<{ id: PaymentMethod; title: string; note: string }>; onChange: (value: PaymentMethod) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-500">Método de pago</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <button key={option.id} onClick={() => onChange(option.id)} className={`rounded-3xl border p-4 text-left transition active:scale-95 ${active ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-100 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-black">{option.title}</p>
                {active && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              </div>
              <p className="mt-1 text-xs font-bold text-slate-500">{option.note}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BookingSummaryCard({ serviceTitle, paymentTitle, estimate, pickupAddress, dropoffAddress }: { serviceTitle: string; paymentTitle: string; estimate: FareEstimate; pickupAddress: string; dropoffAddress: string }) {
  return (
    <div className="rounded-3xl bg-slate-950 p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Resumen antes de solicitar</p>
          <h3 className="mt-1 text-2xl font-black">{money(estimate.estimatedFare)}</h3>
          <p className="text-xs font-bold text-slate-300">{serviceTitle} · {paymentTitle} · {estimate.durationMinutes} min · {estimate.distanceKm} km</p>
        </div>
        <Badge className="bg-white text-slate-950 hover:bg-white">Estimado</Badge>
      </div>
      <div className="mt-4 space-y-2 text-xs font-bold text-slate-300">
        <p><MapPin className="mr-2 inline h-4 w-4 text-cyan-300" />{pickupAddress}</p>
        <p><Navigation className="mr-2 inline h-4 w-4 text-blue-300" />{dropoffAddress}</p>
      </div>
    </div>
  );
}

function FareBreakdownCard({ estimate }: { estimate: FareEstimate }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">Cálculo estimado</p>
          <p className="text-xs font-bold text-slate-500">Rango aproximado: {money(estimate.lowerFare)} - {money(estimate.upperFare)}</p>
        </div>
        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Orientativo</Badge>
      </div>
      <div className="grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
        <p>Salida: <span className="text-slate-950">{money(estimate.baseFare)}</span></p>
        <p>Distancia: <span className="text-slate-950">{money(estimate.distanceFare)}</span></p>
        <p>Tiempo: <span className="text-slate-950">{money(estimate.timeFare)}</span></p>
        <p>Gestión app: <span className="text-slate-950">{money(estimate.bookingFee)}</span></p>
        {estimate.isAirport && <p>Aeropuerto: <span className="text-slate-950">{money(estimate.airportSupplement)}</span></p>}
        {estimate.isNightOrHoliday && <p>Nocturno/festivo: <span className="text-slate-950">x{estimate.nightSupplement}</span></p>}
        {estimate.serviceMultiplier !== 1 && <p>Servicio {estimate.serviceLabel}: <span className="text-slate-950">x{estimate.serviceMultiplier}</span></p>}
      </div>
      <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">El importe final puede variar por tráfico, ruta real, espera, suplementos y taxímetro.</p>
    </div>
  );
}

function SuggestionList({ suggestions, onSelect }: { suggestions: AddressSuggestion[]; onSelect: (suggestion: AddressSuggestion) => void }) {
  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
      {suggestions.map((suggestion) => (
        <button key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`} type="button" onClick={() => onSelect(suggestion)} className="flex w-full items-start gap-3 border-b border-slate-100 p-3 text-left last:border-0 hover:bg-slate-50">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
          <span className="text-sm font-bold text-slate-700">{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
}

function ActiveRideCard({ ride, pin, progress, saving, onCancel }: { ride: TaxiRideRow; pin: string; progress: number; saving: boolean; onCancel: () => void }) {
  const [shared, setShared] = useState(false);
  const driverProfileQuery = trpc.system.taxiProfiles.getDriverPublicProfile.useQuery(
    { driverId: ride.driver_id ?? "" },
    { enabled: Boolean(ride.driver_id), retry: false, refetchInterval: 10000 }
  );
  const profile = (driverProfileQuery.data ?? null) as DriverPublicProfile | null;
  const driverName = profile?.full_name || ride.driver_name || "Buscando conductor";
  const taxiCode = profile?.taxi_code || ride.taxi_code || "Taxi pendiente";
  const plate = profile?.plate || ride.plate || "Pendiente";
  const vehicleModel = profile?.vehicle_model || "Vehículo pendiente";
  const rating = Number(profile?.rating ?? 5).toFixed(1).replace(".", ",");
  const rides = Number(profile?.completed_rides ?? 0);
  const initials = driverName.split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase() || "TX";
  const pickupEta = ride.status === "pending" ? "Asignando" : ride.status === "assigned" ? "3-6 min" : ride.status === "in_progress" ? "En ruta" : "—";

  const shareTrip = async () => {
    const text = `Taximun · Viaje ${pin}\nEstado: ${statusLabel(ride.status)}\nOrigen: ${ride.pickup_address}\nDestino: ${ride.dropoff_address}\nTaxi: ${taxiCode}\nMatrícula: ${plate}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mi viaje Taximun", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setShared(true);
      setTimeout(() => setShared(false), 2200);
    } catch {}
  };

  return (
    <Card className="overflow-hidden rounded-[1.75rem] border-white bg-white shadow-xl">
      <CardContent className="space-y-4 p-4">
        <div className="rounded-[1.5rem] bg-slate-950 p-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Viaje activo</p>
              <h2 className="mt-1 text-2xl font-black">{statusLabel(ride.status)}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-300">{statusSubtitle(ride.status)}</p>
            </div>
            {statusBadge(ride.status)}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <TripTimeline status={ride.status} />
        </div>

        {ride.status === "pending" && (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <p className="font-black">Buscando taxi verificado cerca de ti</p>
                <p className="text-xs font-bold text-amber-700">Te avisaremos cuando un conductor acepte el servicio.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-lg font-black text-white shadow-lg">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt={driverName} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xl font-black">{driverName}</p>
                  {profile?.is_verified ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Verificado</Badge> : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendiente</Badge>}
                </div>
                <p className="text-sm font-bold text-slate-500">{taxiCode} · {plate}</p>
                <p className="text-sm font-bold text-slate-500">{vehicleModel}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniMetric icon={<Star className="h-4 w-4" />} title="Rating" value={rating} />
              <MiniMetric icon={<CheckCircle2 className="h-4 w-4" />} title="Viajes" value={String(rides)} />
              <MiniMetric icon={<Clock3 className="h-4 w-4" />} title="Llegada" value={pickupEta} />
            </div>
          </div>
          <div className="rounded-3xl bg-slate-950 p-4 text-white">
            <p className="text-xs font-bold uppercase text-slate-400">PIN de recogida</p>
            <p className="mt-1 text-4xl font-black tracking-widest">{pin}</p>
            <p className="mt-3 text-xs font-bold text-slate-400">Compártelo solo cuando matrícula y conductor coincidan.</p>
            <div className="mt-4 rounded-2xl bg-white/10 p-3 text-xs font-bold text-cyan-100">
              <LockKeyhole className="mr-1 inline h-3.5 w-3.5" /> Viaje protegido por verificación Taximun.
            </div>
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

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => { window.location.href = "/passenger/security"; }} variant="outline" className="h-12 rounded-2xl bg-white font-black"><Phone className="mr-2 h-4 w-4" />Soporte</Button>
          <Button onClick={() => { window.location.href = "/notifications"; }} variant="outline" className="h-12 rounded-2xl bg-white font-black"><BellRing className="mr-2 h-4 w-4" />Avisos</Button>
          <Button onClick={shareTrip} variant="outline" className="h-12 rounded-2xl bg-white font-black"><Share2 className="mr-2 h-4 w-4" />{shared ? "Copiado" : "Compartir"}</Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-3xl bg-cyan-50 p-3 text-xs font-bold text-cyan-800"><BellRing className="mr-1 inline h-4 w-4" /> Recibirás aviso cuando el estado cambie.</div>
          <div className="rounded-3xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><Copy className="mr-1 inline h-4 w-4" /> Código viaje: {ride.id.slice(0, 8).toUpperCase()}</div>
        </div>

        {(ride.status === "pending" || ride.status === "assigned") && <Button onClick={onCancel} disabled={saving} variant="outline" className="h-13 w-full rounded-3xl border-red-200 bg-white font-black text-red-700 hover:bg-red-50"><XCircle className="mr-2 h-5 w-5" />Cancelar viaje</Button>}
      </CardContent>
    </Card>
  );
}

function TripTimeline({ status }: { status: RideStatus }) {
  const steps = [
    { id: "pending", label: "Solicitud" },
    { id: "assigned", label: "Asignado" },
    { id: "in_progress", label: "En viaje" },
  ];
  const currentIndex = status === "pending" ? 0 : status === "assigned" ? 1 : status === "in_progress" || status === "completed" ? 2 : 0;

  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {steps.map((step, index) => {
        const active = index <= currentIndex;
        return (
          <div key={step.id} className={`rounded-2xl p-2 text-xs font-black ${active ? "bg-white text-slate-950" : "bg-white/10 text-slate-400"}`}>
            <CircleDot className={`mb-1 h-4 w-4 ${active ? "text-cyan-600" : "text-slate-500"}`} />
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

function MiniMetric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <div className="rounded-3xl bg-slate-50 p-3 text-center"><div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">{icon}</div><p className="text-xs font-bold text-slate-400">{title}</p><p className="font-black">{value}</p></div>;
}
function ActionPill({ icon, title, note, onClick, disabled }: { icon: ReactNode; title: string; note?: string; onClick?: () => void; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`rounded-2xl bg-slate-50 p-3 text-center text-sm font-black text-slate-700 active:scale-95 ${disabled ? "opacity-60" : "hover:bg-cyan-50"}`}><span className="mx-auto mb-1 flex justify-center text-cyan-600">{icon}</span>{title}{note && <span className="mt-0.5 block text-[10px] font-bold text-slate-400">{note}</span>}</button>;
}
function HistoryItem({ ride }: { ride: TaxiRideRow }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-black">{ride.dropoff_address}</p>{statusBadge(ride.status)}</div><p className="mt-1 text-xs font-bold text-slate-500">{formatDate(ride.requested_at)} · {money(ride.estimated_fare)}</p></div>;
}
function FullScreenMessage({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-sm rounded-3xl"><CardContent className="space-y-4 p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-600">{icon}</div><h1 className="text-2xl font-black">{title}</h1><p className="text-sm font-semibold text-slate-500">{text}</p>{action}</CardContent></Card></main>;
}
