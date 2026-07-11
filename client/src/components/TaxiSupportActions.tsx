import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";

type SupportRole = "passenger" | "driver";
type SupportKind = "help" | "route" | "call" | "sos" | "payment" | "lost_item";

type SafetyReport = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  created_at?: string | null;
};

const quickActions: Array<{
  kind: SupportKind;
  title: string;
  category: "sos" | "safety" | "lost_item" | "route_issue" | "payment_issue" | "other";
  priority: "low" | "normal" | "high" | "critical";
  icon: ReactNode;
  description: string;
}> = [
  {
    kind: "sos",
    title: "SOS urgente",
    category: "sos",
    priority: "critical",
    icon: <Siren className="h-4 w-4" />,
    description: "Emergencia durante el viaje. Revisar de inmediato.",
  },
  {
    kind: "help",
    title: "Ayuda de seguridad",
    category: "safety",
    priority: "high",
    icon: <ShieldAlert className="h-4 w-4" />,
    description: "Necesito ayuda con una situación de seguridad.",
  },
  {
    kind: "route",
    title: "Problema con la ruta",
    category: "route_issue",
    priority: "high",
    icon: <MapPin className="h-4 w-4" />,
    description: "Ruta incorrecta, desvío extraño o problema de recogida/destino.",
  },
  {
    kind: "payment",
    title: "Problema de pago",
    category: "payment_issue",
    priority: "normal",
    icon: <CreditCard className="h-4 w-4" />,
    description: "Duda o incidencia relacionada con el importe o forma de pago.",
  },
  {
    kind: "lost_item",
    title: "Objeto perdido",
    category: "lost_item",
    priority: "normal",
    icon: <MessageCircle className="h-4 w-4" />,
    description: "He olvidado algo en el taxi o necesito contactar por un objeto.",
  },
  {
    kind: "call",
    title: "Solicitar llamada",
    category: "other",
    priority: "normal",
    icon: <Phone className="h-4 w-4" />,
    description: "Quiero que soporte revise mi caso y me contacte.",
  },
];

export function TaxiSupportActions({ role, rideId }: { role: SupportRole; rideId?: string | null }) {
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const label = role === "driver" ? "conductor" : "pasajero";

  const passengerRideQuery = trpc.system.taxiOps.passenger.getCurrentRide.useQuery(undefined, {
    enabled: role === "passenger" && !rideId,
    retry: false,
  });
  const driverRideQuery = trpc.system.taxiOps.driver.getActiveRide.useQuery(undefined, {
    enabled: role === "driver" && !rideId,
    retry: false,
  });
  const reportsQuery = trpc.system.taxiSafety.getMyReports.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const activeRide = role === "passenger" ? passengerRideQuery.data : driverRideQuery.data;
  const resolvedRideId = rideId || activeRide?.id || null;
  const reports = (reportsQuery.data ?? []) as SafetyReport[];

  const createReport = trpc.system.taxiSafety.createReport.useMutation({
    onSuccess: async () => {
      setNotice("Incidencia registrada correctamente. El administrador podrá revisarla.");
      setError("");
      setDescription("");
      await utils.system.taxiSafety.getMyReports.invalidate();
      setTimeout(() => setNotice(""), 3200);
    },
    onError: (err) => setError(err.message),
  });

  const activeRideLabel = useMemo(() => {
    if (!activeRide) return "Sin viaje activo detectado";
    const pickup = activeRide.pickup_address || "origen";
    const dropoff = activeRide.dropoff_address || "destino";
    return `${pickup} → ${dropoff}`;
  }, [activeRide]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no permite compartir ubicación.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("No se pudo obtener ubicación. Puedes enviar la incidencia sin ubicación.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
  };

  const create = (kind: SupportKind) => {
    const action = quickActions.find((item) => item.kind === kind) ?? quickActions[1];
    createReport.mutate({
      rideId: resolvedRideId ?? undefined,
      category: action.category,
      priority: action.priority,
      title: action.title,
      description: `${label}: ${description.trim() || action.description}${resolvedRideId ? `\nViaje: ${resolvedRideId}` : ""}`,
      contactPhone: contactPhone.trim() || undefined,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black">Seguridad y soporte</h2>
              <p className="text-xs font-bold text-slate-500">Registra incidencias reales para {label}. Quedan guardadas para revisión del administrador.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-cyan-600" />
          </div>

          {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
          {notice && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}

          <div className="rounded-3xl bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Viaje vinculado</p>
            <p className="mt-1 text-sm font-black text-slate-800">{activeRideLabel}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{resolvedRideId ? `ID ${resolvedRideId.slice(0, 8).toUpperCase()}` : "La incidencia se guardará sin viaje asociado."}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {quickActions.map((action) => (
              <SupportButton
                key={action.kind}
                icon={action.icon}
                title={action.title}
                subtitle={action.priority === "critical" ? "Crítico" : action.priority === "high" ? "Alta" : "Normal"}
                danger={action.priority === "critical"}
                loading={createReport.isPending}
                onClick={() => create(action.kind)}
              />
            ))}
          </div>

          <div className="space-y-3 rounded-3xl bg-slate-50 p-3">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 rounded-2xl border-0 bg-white font-semibold shadow-sm"
              placeholder="Explica qué ha pasado. Ejemplo: el taxi no coincide, ruta incorrecta, problema con pago..."
            />
            <Input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              className="h-12 rounded-2xl border-0 bg-white font-semibold shadow-sm"
              placeholder="Teléfono de contacto opcional"
            />
            <Button variant="outline" className="h-12 w-full rounded-2xl bg-white font-black text-slate-800" disabled={locating} onClick={detectLocation}>
              {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
              {coords ? `Ubicación añadida (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Añadir mi ubicación a la incidencia"}
            </Button>
          </div>

          <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">En una emergencia real llama al 112. Taximun registra la incidencia para seguimiento dentro de la plataforma.</p>
        </CardContent>
      </Card>

      <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-black">Mis incidencias</h2>
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{reports.length}</Badge>
          </div>
          <div className="space-y-2">
            {reports.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Todavía no hay incidencias.</p>}
            {reports.slice(0, 5).map((report) => (
              <div key={report.id} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-slate-800">{report.title}</p>
                  <Badge className="bg-white text-slate-700 hover:bg-white">{report.status}</Badge>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">{report.category} · {report.priority}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SupportButton({ icon, title, subtitle, onClick, loading, danger }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; loading: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className={`rounded-2xl p-3 text-left text-sm font-black transition active:scale-95 disabled:opacity-60 ${danger ? "bg-red-600 text-white shadow-lg" : "bg-slate-50 text-slate-700 hover:bg-cyan-50"}`}>
      <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${danger ? "bg-white/20 text-white" : "bg-white text-cyan-600 shadow-sm"}`}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span>
      {title}
      <span className={`mt-1 block text-xs font-bold ${danger ? "text-red-100" : "text-slate-400"}`}>{subtitle}</span>
    </button>
  );
}
