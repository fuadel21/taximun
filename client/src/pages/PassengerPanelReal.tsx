import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, Car, Loader2, LogOut, MapPin, ShieldCheck } from "lucide-react";

type RideStatus = "pending" | "assigned" | "in_progress" | "completed" | "cancelled" | "rejected";

type TaxiRideRow = {
  id: string;
  driver_name?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | string;
  estimated_duration: number | string;
  distance_km: number | string;
  status: RideStatus;
};

const clearGuest = () => {
  try {
    localStorage.removeItem("taximun_guest_role");
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.setItem("taximun_real_auth", "1");
  } catch {}
};

const money = (value: unknown) => `${Number(value ?? 0).toFixed(2)} €`;

function statusBadge(status: RideStatus) {
  if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Buscando conductor</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Conductor asignado</Badge>;
  if (status === "in_progress") return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Viaje en curso</Badge>;
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Finalizado</Badge>;
  if (status === "cancelled") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Rechazado</Badge>;
}

export default function PassengerPanelReal() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("Mi ubicación actual");
  const [dropoffAddress, setDropoffAddress] = useState("Hospital municipal · Entrada principal");
  const [fare, setFare] = useState(12.8);
  const [duration, setDuration] = useState(14);
  const [distanceKm, setDistanceKm] = useState(5.4);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        clearGuest();
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) {
          if (!cancelled) setSessionOk(false);
          return;
        }

        const role = session.user.user_metadata?.role;
        if (role !== "admin" && role !== "passenger") {
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
    return () => {
      cancelled = true;
    };
  }, []);

  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    enabled: sessionOk,
    retry: false,
    refetchInterval: 5000,
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
  const saving = createRideMutation.isPending || cancelRideMutation.isPending;

  const requestTaxi = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      setError("Falta origen o destino.");
      return;
    }
    if (currentRide) {
      setError("Ya tienes un viaje activo.");
      return;
    }
    await createRideMutation.mutateAsync({
      pickupAddress,
      dropoffAddress,
      estimatedFare: fare,
      estimatedDuration: duration,
      distanceKm,
      paymentMethod: "cash",
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

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-sm rounded-3xl">
          <CardContent className="flex items-center justify-center gap-3 p-8 font-black text-slate-700">
            <Loader2 className="h-5 w-5 animate-spin" /> Comprobando sesión real...
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!sessionOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] p-4">
        <Card className="w-full max-w-md rounded-3xl border-white/70 bg-white/90 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-cyan-600" /> Sesión necesaria</CardTitle>
            <CardDescription>Tu cuenta no está con sesión activa. Entra desde el login real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
            <Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_50%,_#ffffff_100%)] p-4 text-slate-950">
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center justify-between gap-3 rounded-3xl bg-white/85 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white"><Car className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun</p>
              <h1 className="text-xl font-black">Panel pasajero real</h1>
            </div>
          </div>
          <Button onClick={logout} variant="outline" className="rounded-2xl bg-white font-black"><LogOut className="mr-2 h-4 w-4" />Salir</Button>
        </header>

        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        {(currentRideQuery.error || historyQuery.error) && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{currentRideQuery.error?.message || historyQuery.error?.message}</div>}

        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <Card className="rounded-3xl border-white/70 bg-white/90 shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl font-black">Nueva solicitud real</CardTitle>
              <CardDescription>Se guardará en la tabla `taxi_rides`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="font-black">Origen</Label>
                <Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className="h-13 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label className="font-black">Destino</Label>
                <Input value={dropoffAddress} onChange={(e) => setDropoffAddress(e.target.value)} className="h-13 rounded-2xl" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Precio" value={money(fare)} />
                <Metric label="Tiempo" value={`${duration} min`} />
                <Metric label="Distancia" value={`${distanceKm} km`} />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" onClick={() => { setPickupAddress("Estación central"); setDropoffAddress("Hospital municipal"); setFare(12.8); setDuration(14); setDistanceKm(5.4); }} className="rounded-2xl bg-white font-black">Estación</Button>
                <Button variant="outline" onClick={() => { setPickupAddress("Mi ubicación actual"); setDropoffAddress("Centro"); setFare(8.9); setDuration(9); setDistanceKm(3.1); }} className="rounded-2xl bg-white font-black">Centro</Button>
                <Button variant="outline" onClick={() => { setPickupAddress("Hotel Costa"); setDropoffAddress("Aeropuerto"); setFare(34.5); setDuration(28); setDistanceKm(21.6); }} className="rounded-2xl bg-white font-black">Aeropuerto</Button>
              </div>
              <Button onClick={requestTaxi} disabled={saving || Boolean(currentRide)} className="h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-black text-white">
                {createRideMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                Pedir taxi real
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-white/70 bg-white/90 shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl font-black">Seguimiento</CardTitle>
              <CardDescription>Actualizado desde Supabase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentRideQuery.isLoading && <p className="rounded-2xl bg-slate-50 p-4 text-center font-bold text-slate-500">Cargando...</p>}
              {!currentRideQuery.isLoading && !currentRide && <p className="rounded-2xl bg-slate-50 p-4 text-center font-bold text-slate-500">No tienes viaje activo.</p>}
              {currentRide && (
                <RideCard ride={currentRide}>
                  {(currentRide.status === "pending" || currentRide.status === "assigned") && (
                    <Button onClick={() => cancelRideMutation.mutate({ rideId: currentRide.id })} disabled={saving} variant="outline" className="mt-3 w-full rounded-2xl border-red-200 bg-white font-black text-red-700">Cancelar viaje</Button>
                  )}
                </RideCard>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-white/70 bg-white/90 shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-black">Historial real</CardTitle>
            <CardDescription>Viajes finalizados, cancelados o rechazados.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {history.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center font-bold text-slate-500 md:col-span-2">Sin historial todavía.</p>}
            {history.map((ride) => <RideCard key={ride.id} ride={ride} />)}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-xs font-bold text-slate-400">{label}</p><p className="font-black">{value}</p></div>;
}

function RideCard({ ride, children }: { ride: TaxiRideRow; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-black">{ride.id.slice(0, 8)}</p>
        {statusBadge(ride.status)}
      </div>
      {ride.driver_name && <p className="mt-2 text-sm font-bold text-cyan-700">{ride.driver_name} · {ride.taxi_code ?? "Taxi"} · {ride.plate ?? ""}</p>}
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <p><MapPin className="mr-1 inline h-4 w-4 text-cyan-600" />{ride.pickup_address}</p>
        <p><MapPin className="mr-1 inline h-4 w-4 text-blue-600" />{ride.dropoff_address}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Precio" value={money(ride.estimated_fare)} />
        <Metric label="Tiempo" value={`${ride.estimated_duration} min`} />
        <Metric label="Km" value={`${ride.distance_km} km`} />
      </div>
      {children}
    </div>
  );
}
