import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Award,
  Car,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  TimerReset,
} from "lucide-react";

type RideRow = {
  id: string;
  status: string;
  driver_id?: string | null;
};

type PublicDriverResponse = {
  profile: {
    user_id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    rating?: number | string | null;
    rating_count?: number | string | null;
    completed_rides?: number | string | null;
    taxi_code?: string | null;
    plate?: string | null;
    vehicle_model?: string | null;
    work_zone?: string | null;
    is_verified?: boolean | null;
    created_at?: string | null;
  };
  badges: string[];
  tagCounts: Record<string, number>;
  reviews: Array<{
    id: string;
    score: number;
    comment?: string | null;
    tags?: string[] | null;
    createdAt?: string | null;
  }>;
};

const badgeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  verified: { label: "Conductor verificado", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  excellent_rating: { label: "Excelente valoración", icon: <Award className="h-3.5 w-3.5" /> },
  experienced: { label: "Conductor experimentado", icon: <Car className="h-3.5 w-3.5" /> },
  punctual: { label: "Puntual", icon: <TimerReset className="h-3.5 w-3.5" /> },
  safe_driver: { label: "Conducción segura", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  clean_vehicle: { label: "Vehículo limpio", icon: <Sparkles className="h-3.5 w-3.5" /> },
};

const tagLabels: Record<string, string> = {
  safe_driving: "Conducción segura",
  professional: "Profesional",
  punctual: "Puntual",
  friendly: "Amable",
  clean_vehicle: "Vehículo limpio",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

export function PassengerDriverPublicProfileSection() {
  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
  });
  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const currentRide = (currentRideQuery.data ?? null) as RideRow | null;
  const history = (historyQuery.data ?? []) as RideRow[];
  const driverId = useMemo(() => {
    if (currentRide?.driver_id) return currentRide.driver_id;
    return history.find((ride) => ride.driver_id)?.driver_id ?? null;
  }, [currentRide, history]);

  const profileQuery = trpc.system.taxiRatings.getPublicDriverReputation.useQuery(
    { driverId: driverId ?? "" },
    { enabled: Boolean(driverId), retry: false, refetchInterval: 30000 }
  );

  if (!driverId || profileQuery.isLoading) return null;
  if (profileQuery.error || !profileQuery.data) return null;

  const data = profileQuery.data as PublicDriverResponse;
  const profile = data.profile;
  const initials = String(profile.full_name || "TX")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const rating = Number(profile.rating ?? 5).toFixed(1).replace(".", ",");
  const ratingCount = Number(profile.rating_count ?? data.reviews.length);
  const completedRides = Number(profile.completed_rides ?? 0);

  return (
    <section className="mx-auto max-w-5xl px-4 pb-4">
      <Card className="overflow-hidden rounded-[1.75rem] border-white bg-white shadow-xl">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start gap-4 rounded-3xl bg-slate-950 p-4 text-white">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/10 text-xl font-black">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name || "Conductor"} className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Perfil público del conductor</p>
              <h2 className="mt-1 truncate text-2xl font-black">{profile.full_name || "Conductor Taximun"}</h2>
              <p className="mt-1 text-sm font-bold text-slate-300">{profile.vehicle_model || "Vehículo registrado"} · {profile.taxi_code || "Taxi"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100"><Star className="mr-1 h-3.5 w-3.5 fill-amber-500 text-amber-500" />{rating}</Badge>
                <Badge className="bg-white/10 text-white hover:bg-white/10">{ratingCount} opiniones</Badge>
                <Badge className="bg-white/10 text-white hover:bg-white/10">{completedRides} viajes</Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.badges.length === 0 && <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Perfil en crecimiento</Badge>}
            {data.badges.map((badge) => {
              const item = badgeLabels[badge];
              if (!item) return null;
              return <Badge key={badge} className="bg-cyan-50 text-cyan-800 hover:bg-cyan-50">{item.icon}<span className="ml-1">{item.label}</span></Badge>;
            })}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Metric title="Valoración" value={`${rating}/5`} icon={<Star className="h-4 w-4" />} />
            <Metric title="Viajes" value={String(completedRides)} icon={<Car className="h-4 w-4" />} />
            <Metric title="Zona" value={profile.work_zone || "Barcelona"} icon={<MapPin className="h-4 w-4" />} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black">Opiniones recientes</h3>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{data.reviews.length}</Badge>
            </div>
            <div className="space-y-2">
              {data.reviews.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Todavía no hay opiniones públicas.</p>}
              {data.reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      {[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-4 w-4 ${value <= Number(review.score) ? "fill-amber-400" : "text-slate-300"}`} />)}
                    </div>
                    <span className="text-xs font-bold text-slate-400">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.comment && <p className="mt-2 text-sm font-semibold text-slate-700">“{review.comment}”</p>}
                  {Array.isArray(review.tags) && review.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {review.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">{tagLabels[tag] || tag}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">Por privacidad, esta ficha no muestra teléfono, documentos, correo ni datos personales sensibles.</p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-3 text-center">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm">{icon}</div>
      <p className="text-xs font-bold text-slate-400">{title}</p>
      <p className="truncate font-black text-slate-900">{value}</p>
    </div>
  );
}
