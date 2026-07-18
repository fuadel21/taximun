import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellRing, ShieldAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "taximun_admin_dismissed_alert";

type SafetyReport = {
  id: string;
  ride_id?: string | null;
  category: string;
  priority: string;
  status: string;
  title: string;
  description?: string | null;
  created_at?: string | null;
};

function timestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function AdminUrgentAlertDock() {
  const { user, isGuest } = useAuth() as any;
  const [, setLocation] = useLocation();
  const [dismissedId, setDismissedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  });
  const notifiedId = useRef<string | null>(null);
  const isAdmin = !isGuest && user?.role === "admin";

  const query = trpc.system.taxiSafety.adminList.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const urgent = useMemo(() => {
    const reports = (query.data ?? []) as SafetyReport[];
    return reports
      .filter((report) => report.status !== "resolved" && report.status !== "dismissed")
      .filter((report) => report.priority === "critical" || report.category === "sos")
      .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))[0] ?? null;
  }, [query.data]);

  useEffect(() => {
    if (!urgent || urgent.id === notifiedId.current) return;
    notifiedId.current = urgent.id;
    navigator.vibrate?.([300, 120, 300, 120, 500]);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("SOS crítico en Taximun", {
        body: urgent.title || "Hay una alerta urgente pendiente de atención.",
        tag: `taximun-sos-${urgent.id}`,
      });
    }
  }, [urgent]);

  if (!isAdmin || !urgent || dismissedId === urgent.id) return null;

  const dismiss = () => {
    setDismissedId(urgent.id);
    try {
      sessionStorage.setItem(DISMISSED_KEY, urgent.id);
    } catch {}
  };

  const openAlert = async () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    setLocation("/admin/safety");
  };

  return (
    <aside className="fixed inset-x-3 top-3 z-[100] mx-auto max-w-3xl animate-in slide-in-from-top-3">
      <div className="overflow-hidden rounded-3xl border-2 border-red-300 bg-red-600 text-white shadow-[0_24px_80px_rgba(220,38,38,0.42)]">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-2xl bg-white text-red-600">
            <BellRing className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">SOS activo</span>
              <span className="text-xs font-black text-red-100">Actualización automática</span>
            </div>
            <p className="mt-2 text-lg font-black leading-tight">{urgent.title || "Alerta crítica pendiente"}</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-red-50/90">{urgent.description || "Un usuario necesita atención inmediata durante un viaje."}</p>
            {urgent.ride_id && <p className="mt-2 text-xs font-black text-white/85">Viaje: {urgent.ride_id.slice(0, 10)}</p>}
          </div>
          <button onClick={dismiss} aria-label="Cerrar aviso" className="rounded-xl bg-white/15 p-2 hover:bg-white/25">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-white/20 bg-red-700/60 p-3">
          <Button onClick={openAlert} className="h-12 rounded-2xl bg-white font-black text-red-700 hover:bg-red-50">
            <ShieldAlert className="mr-2 h-5 w-5" />Atender ahora
          </Button>
          <Button onClick={() => query.refetch()} variant="outline" className="h-12 rounded-2xl border-white/30 bg-white/10 font-black text-white hover:bg-white/20 hover:text-white">
            <AlertTriangle className="mr-2 h-5 w-5" />Actualizar
          </Button>
        </div>
      </div>
    </aside>
  );
}
