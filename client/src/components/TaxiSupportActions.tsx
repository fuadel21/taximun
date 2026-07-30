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

type QuickAction = {
  kind: SupportKind;
  title: string;
  category: "sos" | "safety" | "lost_item" | "route_issue" | "payment_issue" | "other";
  priority: "low" | "normal" | "high" | "critical";
  icon: ReactNode;
  description: string;
};

const quickActions: QuickAction[] = [
  {
    kind: "sos",
    title: "SOS urgente",
    category: "sos",
    priority: "critical",
    icon: <Siren className="h-5 w-5" />,
    description: "Emergencia durante el viaje. Revisar de inmediato.",
  },
  {
    kind: "help",
    title: "Ayuda de seguridad",
    category: "safety",
    priority: "high",
    icon: <ShieldAlert className="h-5 w-5" />,
    description: "Necesito ayuda con una situación de seguridad.",
  },
  {
    kind: "route",
    title: "Problema con la ruta",
    category: "route_issue",
    priority: "high",
    icon: <MapPin className="h-5 w-5" />,
    description: "Ruta incorrecta, desvío extraño o problema de recogida o destino.",
  },
  {
    kind: "payment",
    title: "Problema de pago",
    category: "payment_issue",
    priority: "normal",
    icon: <CreditCard className="h-5 w-5" />,
    description: "Duda o incidencia relacionada con el importe o forma de pago.",
  },
  {
    kind: "lost_item",
    title: "Objeto perdido",
    category: "lost_item",
    priority: "normal",
    icon: <MessageCircle className="h-5 w-5" />,
    description: "He olvidado algo en el taxi o necesito contactar por un objeto.",
  },
  {
    kind: "call",
    title: "Solicitar llamada",
    category: "other",
    priority: "normal",
    icon: <Phone className="h-5 w-5" />,
    description: "Quiero que soporte revise mi caso y me contacte.",
  },
];

const priorityLabel = (priority: QuickAction["priority"]) => {
  if (priority === "critical") return "Crítica";
  if (priority === "high") return "Alta";
  if (priority === "low") return "Baja";
  return "Normal";
};

const reportStatusLabel = (status: string) => {
  if (status === "resolved") return "Resuelta";
  if (status === "in_progress") return "En gestión";
  if (status === "closed") return "Cerrada";
  return "Abierta";
};

export function TaxiSupportActions({ role, rideId }: { role: SupportRole; rideId?: string | null }) {
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedKind, setSelectedKind] = useState<SupportKind | null>(null);
  const [sosConfirmationReady, setSosConfirmationReady] = useState(false);
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
  const selectedAction = quickActions.find((item) => item.kind === selectedKind) ?? null;

  const createReport = trpc.system.taxiSafety.createReport.useMutation({
    onSuccess: async () => {
      setNotice("Incidencia registrada correctamente. El equipo de administración podrá revisarla.");
      setError("");
      setDescription("");
      setSelectedKind(null);
      setSosConfirmationReady(false);
      await utils.system.taxiSafety.getMyReports.invalidate();
      window.setTimeout(() => setNotice(""), 3200);
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

  const selectAction = (kind: SupportKind) => {
    setSelectedKind(kind);
    setSosConfirmationReady(false);
    setError("");
    setNotice("");
  };

  const submitSelected = () => {
    if (!selectedAction) {
      setError("Selecciona primero el tipo de incidencia.");
      return;
    }

    if (selectedAction.kind === "sos" && !sosConfirmationReady) {
      setSosConfirmationReady(true);
      setError("Confirma una segunda vez para registrar el SOS urgente.");
      return;
    }

    setError("");
    createReport.mutate({
      rideId: resolvedRideId ?? undefined,
      category: selectedAction.category,
      priority: selectedAction.priority,
      title: selectedAction.title,
      description: `${label}: ${description.trim() || selectedAction.description}${resolvedRideId ? `\nViaje: ${resolvedRideId}` : ""}`,
      contactPhone: contactPhone.trim() || undefined,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-zinc-500">Centro de ayuda</p>
              <h2 className="mt-1 text-2xl font-black text-black">Seguridad y soporte</h2>
              <p className="mt-2 text-sm font-semibold text-zinc-500">Selecciona el motivo, revisa los datos y confirma el envío. Nada se registra al tocar una categoría.</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>

          {(passengerRideQuery.error || driverRideQuery.error || reportsQuery.error) && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertTriangle className="mr-2 inline h-5 w-5" />
              {passengerRideQuery.error?.message || driverRideQuery.error?.message || reportsQuery.error?.message}
            </div>
          )}
          {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertTriangle className="mr-2 inline h-5 w-5" />{error}</div>}
          {notice && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}

          <div className="rounded-3xl bg-zinc-100 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Viaje vinculado</p>
            <p className="mt-1 text-sm font-black text-black">{activeRideLabel}</p>
            <p className="mt-1 text-xs font-bold text-zinc-500">{resolvedRideId ? `ID ${resolvedRideId.slice(0, 8).toUpperCase()}` : "La incidencia se guardará sin viaje asociado."}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <SupportButton
                key={action.kind}
                icon={action.icon}
                title={action.title}
                subtitle={`Prioridad ${priorityLabel(action.priority).toLowerCase()}`}
                danger={action.priority === "critical"}
                selected={selectedKind === action.kind}
                onClick={() => selectAction(action.kind)}
              />
            ))}
          </div>

          <div className={`space-y-4 rounded-[1.75rem] border p-4 ${selectedAction?.priority === "critical" ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Incidencia seleccionada</p>
                <h3 className="mt-1 text-xl font-black text-black">{selectedAction?.title || "Selecciona una categoría"}</h3>
                <p className="mt-1 text-sm font-semibold text-zinc-600">{selectedAction?.description || "Después podrás añadir detalles, teléfono y ubicación antes de enviarla."}</p>
              </div>
              {selectedAction && <Badge className={selectedAction.priority === "critical" ? "bg-red-600 text-white hover:bg-red-600" : "bg-black text-white hover:bg-black"}>{priorityLabel(selectedAction.priority)}</Badge>}
            </div>

            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-28 rounded-2xl border-zinc-200 bg-white p-4 font-semibold"
              placeholder="Explica qué ha pasado. Ejemplo: el taxi no coincide, ruta incorrecta o problema con el pago."
            />
            <Input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              className="h-14 rounded-2xl border-zinc-200 bg-white px-4 font-semibold"
              placeholder="Teléfono de contacto opcional"
            />
            <Button variant="outline" className="h-14 w-full rounded-2xl border-zinc-200 bg-white font-black text-black" disabled={locating} onClick={detectLocation}>
              {locating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <MapPin className="mr-2 h-5 w-5" />}
              {coords ? `Ubicación añadida (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Añadir mi ubicación"}
            </Button>

            {selectedAction?.kind === "sos" && (
              <div className="rounded-3xl bg-red-600 p-4 text-sm font-bold text-white">
                El SOS genera una alerta crítica para administración. En una emergencia real, llama también al 112.
              </div>
            )}

            <Button
              onClick={submitSelected}
              disabled={!selectedAction || createReport.isPending}
              className={`h-14 w-full rounded-2xl text-base font-black text-white ${selectedAction?.priority === "critical" ? "bg-red-600 hover:bg-red-500" : "bg-black hover:bg-black/85"}`}
            >
              {createReport.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : selectedAction?.kind === "sos" ? <Siren className="mr-2 h-5 w-5" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
              {selectedAction?.kind === "sos" && sosConfirmationReady ? "Confirmar y registrar SOS" : "Revisar y enviar incidencia"}
            </Button>
          </div>

          <p className="rounded-3xl bg-amber-50 p-4 text-sm font-bold text-amber-900">En una emergencia real llama al 112. Taximun registra la incidencia para seguimiento dentro de la plataforma.</p>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-black/5 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-zinc-500">Seguimiento</p>
              <h2 className="text-xl font-black text-black">Mis incidencias</h2>
            </div>
            <Badge className="bg-black text-white hover:bg-black">{reports.length}</Badge>
          </div>
          <div className="space-y-3">
            {reportsQuery.isLoading && <p className="rounded-3xl bg-zinc-100 p-5 text-center text-sm font-bold text-zinc-500">Cargando incidencias...</p>}
            {!reportsQuery.isLoading && reports.length === 0 && <p className="rounded-3xl bg-zinc-100 p-5 text-center text-sm font-bold text-zinc-500">Todavía no hay incidencias.</p>}
            {reports.slice(0, 5).map((report) => (
              <div key={report.id} className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-black">{report.title}</p>
                  <Badge className="bg-white text-zinc-700 hover:bg-white">{reportStatusLabel(report.status)}</Badge>
                </div>
                <p className="mt-2 text-xs font-bold text-zinc-500">{report.category} · prioridad {priorityLabel(report.priority as QuickAction["priority"]).toLowerCase()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SupportButton({ icon, title, subtitle, onClick, selected, danger }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; selected: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-28 rounded-3xl border p-4 text-left text-sm font-black transition active:scale-[0.98] ${danger ? selected ? "border-red-600 bg-red-600 text-white shadow-lg" : "border-red-200 bg-red-50 text-red-800" : selected ? "border-black bg-black text-white shadow-lg" : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100"}`}
    >
      <span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? "bg-white/15 text-white" : danger ? "bg-red-600 text-white" : "bg-white text-black shadow-sm"}`}>{icon}</span>
      {title}
      <span className={`mt-1 block text-xs font-bold ${selected ? "text-white/65" : danger ? "text-red-500" : "text-zinc-400"}`}>{subtitle}</span>
    </button>
  );
}
