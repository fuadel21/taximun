import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Loader2, X } from "lucide-react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  action_url?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

function dateLabel(value?: string | null) {
  if (!value) return "Ahora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ahora";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(type: string) {
  if (type.includes("approved")) return "Aprobado";
  if (type.includes("rejected")) return "Rechazado";
  if (type.includes("uploaded")) return "Nuevo";
  if (type === "warning") return "Aviso";
  if (type === "error") return "Error";
  return "Info";
}

function typeClass(type: string) {
  if (type.includes("approved") || type === "success") return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  if (type.includes("rejected") || type === "error") return "bg-red-100 text-red-800 hover:bg-red-100";
  if (type.includes("uploaded") || type === "warning") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return "bg-cyan-100 text-cyan-800 hover:bg-cyan-100";
}

export function TaxiNotificationCenter({ compact = false }: { compact?: boolean }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const listQuery = trpc.system.taxiNotifications.listMine.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const countQuery = trpc.system.taxiNotifications.unreadCount.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const markRead = trpc.system.taxiNotifications.markRead.useMutation({
    onSuccess: () => {
      utils.system.taxiNotifications.listMine.invalidate();
      utils.system.taxiNotifications.unreadCount.invalidate();
    },
  });
  const markAllRead = trpc.system.taxiNotifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.system.taxiNotifications.listMine.invalidate();
      utils.system.taxiNotifications.unreadCount.invalidate();
    },
  });

  const notifications = (listQuery.data ?? []) as NotificationRow[];
  const unreadCount = Number(countQuery.data ?? 0);
  const latest = useMemo(() => notifications.slice(0, compact ? 6 : 10), [notifications, compact]);
  const busy = markRead.isPending || markAllRead.isPending;

  const openNotification = async (notification: NotificationRow) => {
    if (!notification.read_at) {
      await markRead.mutateAsync({ notificationId: notification.id });
    }
    if (notification.action_url) {
      setOpen(false);
      setLocation(notification.action_url);
    }
  };

  return (
    <div className="relative">
      <Button type="button" onClick={() => setOpen((value) => !value)} variant="outline" className="relative rounded-2xl border-white/20 bg-white/80 font-black text-slate-900 shadow-sm hover:bg-white">
        <Bell className="mr-2 h-4 w-4" /> Avisos
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white text-slate-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div>
              <h3 className="text-base font-black">Notificaciones</h3>
              <p className="text-xs font-bold text-slate-500">Avisos internos de Taximun</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || unreadCount === 0} onClick={() => markAllRead.mutate()} className="rounded-xl font-black">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)} className="rounded-xl font-black"><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-3">
            {listQuery.isLoading && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Cargando avisos...</p>}
            {!listQuery.isLoading && latest.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">No tienes avisos todavía.</p>}
            <div className="space-y-2">
              {latest.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`w-full rounded-2xl border p-3 text-left transition hover:bg-slate-50 ${notification.read_at ? "border-slate-100 bg-white" : "border-cyan-100 bg-cyan-50/60"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black text-slate-950">{notification.title}</p>
                    <Badge className={typeClass(notification.type)}>{typeLabel(notification.type)}</Badge>
                  </div>
                  {notification.body && <p className="mt-1 text-xs font-bold text-slate-600">{notification.body}</p>}
                  <p className="mt-2 text-[11px] font-black text-slate-400">{dateLabel(notification.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
