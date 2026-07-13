import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Award,
  Car,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

type Ride = {
  id: string;
  driver_id?: string | null;
  status: string;
};

type DriverProfile = {
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

type DriverReview = {
  id: string;
  score: number;
  comment?: string | null;
  tags?: string[] | null;
  createdAt?: string | null;
};

type ReputationResponse = {
  profile: DriverProfile;
  badges: string[];
  tagCounts: Record<string, number>;
  reviews: DriverReview[];
};

const badgeLabels: Record<string, string> = {
  verified: "Conductor verificado",
  excellent_rating: "Excelente valoración",
  experienced: "Conductor experimentado",
  punctual: "Puntual",
  safe_driver: "Conducción segura",
  clean_vehicle: "Vehículo limpio",
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
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PublicDriverProfileSection() {
  const currentRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    retry: false,
    refetchInterval: 10000,
  });
  const historyQuery = trpc.system.taxiOps.passenger.getRideHistory.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const currentRide = (currentRideQuery.data ?? null) as Ride | null;
  const history = (historyQuery.data ?? []) as Ride[];
  const driverId = useMemo(() => {
    if (currentRide?.driver_id) return currentRide.driver_id;
    return history.find((ride) => ride.driver_id)?.driver_id ?? null;
  }, [currentRide, history]);

  const reputationQuery = trpc.system.taxiRatings.getPublicDriverReputation.useQuery(
    { driverId: driverId || "" },
    {
      enabled: Boolean(driverId),
      retry: false,
      refetchInterval: 15000,
    }
  );

  if (!driverId) return null;

  if (reputationQuery.isLoading) {
    return (
      <section className="mx-auto max-w-5xl px-4 pb-4">
        <div className="rounded-3xl bg-white p-4 text-sm font-black text-slate-500 shadow-sm">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando perfil del conductor...
        </div>
      </section>
    );
  }

  if (reputationQuery.error || !reputationQuery.data) return null;

  const data = reputationQuery.data as ReputationResponse;
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
  const topTags = Object.entries(data.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <section className="mx-auto max-w-5xl px-4 pb-4">
      <Card className="overflow-hidden rounded-[1.75rem] border-white bg-white shadow-xl">
        <CardContent className="space-y-4 p-4">
          <div className="rounded-3xl bg-slate-950 p-4 text-white">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/10 text-2xl font-black shadow-lg">
                {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name || "Conductor"} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Perfil público del conductor</p>
                <h2 className="mt-1 truncate text-2xl font-black">{profile.full_name || "Conductor Taximun"}</h2>
                <p className="mt-1 text-sm font-bold text-slate-300">{profile.vehicle_model || "Vehículo registrado"} · {profile.taxi_code || "Taxi"} · {profile.plate || "Matrícula verificada"}</p>
                {profile.work_zone && <p className="mt-1 text-xs font-bold text-slate-400"><MapPin className="mr-1 inline h-3.5 w-3.5" />{profile.work_zone}</p>}
              </div>
              {profile.is_verified && <ShieldCheck className="h-7 w-7 shrink-0 text-emerald-300" />}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Metric icon={<Star className="h-4 w-4" />} title="Valoración" value={`${rating}/5`} dark />
              <Metric icon={<CheckCircle2 className="h-4 w-4" />} title="Opiniones" value={String(ratingCount)} dark />
              <Metric icon={<Car className="h-4 w-4" />} title="Viajes" value={String(completedRides)} dark />
            </div>
          </div>

          {data.badges.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                <h3 className="font-black">Insignias</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.badges.map((badge) => (
                  <Badge key={badge} className="bg-amber-50 text-amber-800 hover:bg-amber-50">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />{badgeLabels[badge] || badge}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {topTags.length > 0 && (
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="font-black">Lo que más valoran los pasajeros</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topTags.map(([tag, count]) => (
                  <span key={tag} className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">
                    {tagLabels[tag] || tag} · {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-black">Últimas opiniones</h3>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{data.reviews.length}</Badge>
            </div>
            <div className="space-y-2">
              {data.reviews.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Todavía no hay opiniones públicas.</p>}
              {data.reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-4 w-4 ${value <= Number(review.score) ? "fill-amber-400" : "text-slate-300"}`} />)}
                    </div>
                    <span className="text-xs font-bold text-slate-400">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.comment && <p className="mt-2 text-sm font-semibold text-slate-700">{review.comment}</p>}
                  {Array.isArray(review.tags) && review.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {review.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">{tagLabels[tag] || tag}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-2xl bg-cyan-50 p-3 text-xs font-bold text-cyan-800">Este perfil solo muestra reputación y datos profesionales necesarios para el servicio. No se publican teléfono, correo ni documentos.</p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon, title, value, dark }: { icon: React.ReactNode; title: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${dark ? "bg-white/10 text-white" : "bg-slate-50"}`}>
      <div className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full ${dark ? "bg-white/10 text-cyan-200" : "bg-white text-cyan-600"}`}>{icon}</div>
      <p className="text-xs font-bold text-slate-400">{title}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
